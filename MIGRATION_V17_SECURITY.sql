-- ══════════════════════════════════════════════════════════
-- SM-Group — Migration V17 SECURITY
-- نطاق هذا الإصلاح: تأمين كلمات المرور + إدارة الصلاحيات/الأدوار فقط.
-- لا يغيّر شيئاً في accounts / transactions / atomic_* (خارج النطاق المتفق عليه).
--
-- المشكلة المُصلحة:
--   1) كلمات المرور كانت SHA-256 بدون salt (سريعة الكسر لو سُرّب الجدول).
--   2) جدول users كان قابلاً للقراءة/الكتابة المباشرة من أي حامل لمفتاح anon
--      العام (لا تفريق بين مستخدم وآخر، ولا بين "تطبيق" و"أي طرف خارجي"،
--      لأن is_app_request() تتحقق فقط من claim مدمج في نفس المفتاح العام).
--   3) أي حامل للمفتاح كان يستطيع تعديل عمود permissions / role لنفسه
--      مباشرة عبر UPDATE، أي رفع صلاحياته بنفسه.
--
-- بعد هذا الملف:
--   - لا يمكن لأي طلب مباشر (SELECT/INSERT/UPDATE/DELETE) أن يلمس users.
--   - كل تعامل مع users يمر حصرياً عبر دوال RPC أدناه.
--   - الدوال التي تُعدّل صلاحيات/دور/كلمة مرور تتحقق هي نفسها أن المستدعي
--     admin حقيقي (بتمرير اسم مستخدم + هاش/كلمة مرور المتصل والتحقق داخلياً)
--     قبل تنفيذ أي تغيير — وليس فقط الاعتماد على RLS سطحية.
--   - bcrypt حقيقي (pgcrypto) بدل SHA-256 عاري، مع ترحيل تلقائي تدريجي:
--     أول تسجيل دخول ناجح لمستخدم بهاش SHA-256 قديم يُعاد تخزينه فوراً
--     كـ bcrypt، بدون الحاجة لإجبار كل المستخدمين على إعادة تعيين كلمة
--     المرور دفعة واحدة.
-- ══════════════════════════════════════════════════════════

-- ══ 0. التأكد من توفر pgcrypto لـ bcrypt ═══════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ══ 1. حذف أي نسخ سابقة من الدوال (لإعادة تشغيل الملف بأمان) ══
DROP FUNCTION IF EXISTS public.login_verify(text, text);
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.admin_delete_user(text, text, bigint);
DROP FUNCTION IF EXISTS public.admin_set_user_password(text, text, bigint, text);
DROP FUNCTION IF EXISTS public.admin_set_user_permissions(text, text, bigint, jsonb);
DROP FUNCTION IF EXISTS public.admin_set_user_role(text, text, bigint, text);
DROP FUNCTION IF EXISTS public._is_caller_admin(text, text);

-- ══ 2. دالة داخلية مساعدة: تتحقق هل (username, password) ═══
--      ينتمي فعلاً لمستخدم بدور admin. تُستخدم داخل كل دالة
--      admin_* أدناه قبل تنفيذ أي تعديل. SECURITY DEFINER لأنها
--      تحتاج قراءة عمود pass الذي لن يكون مقروءاً مباشرة بعد الآن.
CREATE FUNCTION public._is_caller_admin(
  p_caller_username text,
  p_caller_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u public.users%ROWTYPE;
  ok boolean;
BEGIN
  SELECT * INTO u FROM public.users WHERE username = p_caller_username;
  IF NOT FOUND THEN RETURN false; END IF;
  IF u.role <> 'admin' THEN RETURN false; END IF;

  -- يدعم الهاش القديم (SHA-256 hex، طوله 64) والجديد (bcrypt عبر crypt())
  IF length(u.pass) = 64 THEN
    ok := u.pass = encode(digest(p_caller_password, 'sha256'), 'hex');
  ELSE
    ok := u.pass = crypt(p_caller_password, u.pass);
  END IF;

  RETURN coalesce(ok, false);
END;
$$;

-- ══ 3. login_verify — نقطة الدخول الوحيدة للمصادقة ═════════
--      تتحقق من كلمة المرور داخل القاعدة، ترحّل الهاش القديم
--      تلقائياً إلى bcrypt عند أول نجاح، ولا تُرجع عمود pass أبداً.
CREATE FUNCTION public.login_verify(
  p_username text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u  public.users%ROWTYPE;
  ok boolean;
BEGIN
  SELECT * INTO u FROM public.users WHERE username = p_username;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  END IF;

  IF length(u.pass) = 64 THEN
    -- هاش قديم SHA-256 بدون salt
    ok := u.pass = encode(digest(p_password, 'sha256'), 'hex');
    IF ok THEN
      -- ترحيل فوري إلى bcrypt الآن أن كلمة المرور الصحيحة معروفة
      UPDATE public.users
      SET pass = crypt(p_password, gen_salt('bf', 10))
      WHERE id = u.id;
    END IF;
  ELSE
    ok := u.pass = crypt(p_password, u.pass);
  END IF;

  IF NOT ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', u.id,
    'username', u.username,
    'role', u.role,
    'permissions', u.permissions
  );
END;
$$;

-- ══ 4. admin_create_user ════════════════════════════════════
CREATE FUNCTION public.admin_create_user(
  p_caller_username text,
  p_caller_password text,
  p_new_username     text,
  p_new_password      text,
  p_new_role          text,
  p_new_permissions   jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_caller_admin(p_caller_username, p_caller_password) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE username = p_new_username) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'username_taken');
  END IF;

  INSERT INTO public.users (username, pass, role, permissions)
  VALUES (
    p_new_username,
    crypt(p_new_password, gen_salt('bf', 10)),
    p_new_role,
    p_new_permissions
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- ══ 5. admin_delete_user ════════════════════════════════════
CREATE FUNCTION public.admin_delete_user(
  p_caller_username text,
  p_caller_password text,
  p_target_id        bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_caller_admin(p_caller_username, p_caller_password) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM public.users WHERE id = p_target_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- ══ 6. admin_set_user_password ══════════════════════════════
CREATE FUNCTION public.admin_set_user_password(
  p_caller_username text,
  p_caller_password text,
  p_target_id        bigint,
  p_new_password      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_caller_admin(p_caller_username, p_caller_password) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.users
  SET pass = crypt(p_new_password, gen_salt('bf', 10))
  WHERE id = p_target_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- ══ 7. admin_set_user_permissions ═══════════════════════════
CREATE FUNCTION public.admin_set_user_permissions(
  p_caller_username text,
  p_caller_password text,
  p_target_id        bigint,
  p_permissions       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_caller_admin(p_caller_username, p_caller_password) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.users SET permissions = p_permissions WHERE id = p_target_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- ══ 8. admin_set_user_role ══════════════════════════════════
CREATE FUNCTION public.admin_set_user_role(
  p_caller_username text,
  p_caller_password text,
  p_target_id        bigint,
  p_role              text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_caller_admin(p_caller_username, p_caller_password) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.users SET role = p_role WHERE id = p_target_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- ══ 8b. self_set_password — تغيير كلمة المرور الذاتية ══════
--       لأي مستخدم (admin أو موظف عادي)، بشرط معرفة كلمة
--       مروره الحالية الصحيحة. لا تتحقق من role admin.
DROP FUNCTION IF EXISTS public.self_set_password(text, text, text);
CREATE FUNCTION public.self_set_password(
  p_username     text,
  p_current_pass text,
  p_new_pass     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u  public.users%ROWTYPE;
  ok boolean;
BEGIN
  SELECT * INTO u FROM public.users WHERE username = p_username;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  END IF;

  IF length(u.pass) = 64 THEN
    ok := u.pass = encode(digest(p_current_pass, 'sha256'), 'hex');
  ELSE
    ok := u.pass = crypt(p_current_pass, u.pass);
  END IF;

  IF NOT coalesce(ok, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  END IF;

  UPDATE public.users
  SET pass = crypt(p_new_pass, gen_salt('bf', 10))
  WHERE id = u.id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- ══ 9. قائمة المستخدمين للعرض في employees.html ════════════
--      ترجع كل شيء إلا عمود pass — تتحقق من admin قبل الإرجاع
--      حتى لا يستطيع موظف عادي رؤية صلاحيات/أدوار الجميع.
DROP FUNCTION IF EXISTS public.admin_list_users(text, text);
CREATE FUNCTION public.admin_list_users(
  p_caller_username text,
  p_caller_password text
)
RETURNS TABLE (
  id bigint,
  username text,
  role text,
  permissions jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_caller_admin(p_caller_username, p_caller_password) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
    SELECT u.id, u.username, u.role, u.permissions FROM public.users u;
END;
$$;

-- ══ 10. منع أي وصول مباشر لجدول users ═══════════════════════
--       (RLS تمنع الجميع؛ المسار الوحيد المتبقي هو الدوال أعلاه
--       التي تعمل بـ SECURITY DEFINER فتتجاوز RLS بأمان داخلياً)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all"      ON public.users;
DROP POLICY IF EXISTS "app_only_users" ON public.users;

CREATE POLICY "no_direct_access" ON public.users
  AS PERMISSIVE FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ══ 11. الصلاحيات على الدوال الجديدة ═════════════════════════
REVOKE ALL ON FUNCTION public._is_caller_admin        FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.login_verify              TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_create_user         TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_delete_user         TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_password   TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.self_set_password          TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_permissions TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_role       TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_list_users          TO anon, authenticated;

-- ══════════════════════════════════════════════════════════
-- ══ 12. إنشاء أول مستخدم admin (يُشغَّل مرة واحدة فقط) ══════
--
--      بعد هذا الملف، لا يمكن إدخال صف في users عبر API
--      (anon/authenticated) إطلاقاً — فقط عبر SQL Editor مباشرة
--      بصلاحيات postgres الكاملة (التي تتجاوز RLS من الأساس).
--      هذا مقصود: المستخدم admin الأول لكل عميل جديد يُنشأ هنا
--      يدوياً، وليس من المتصفح.
--
--      شغّل هذا الاستعلام بعد كل ما سبق، بعد تغيير القيمتين:
--      'admin'         ← اسم المستخدم الذي تريده
--      'CHANGE_ME_123' ← كلمة مرور قوية فعلية، ثم احذف هذا
--                        التعليق وغيّرها فوراً بعد أول دخول
--                        عبر صفحة "الإعدادات" في الموقع.
--
-- INSERT INTO public.users (username, pass, role, permissions)
-- VALUES (
--   'admin',
--   crypt('CHANGE_ME_123', gen_salt('bf', 10)),
--   'admin',
--   NULL
-- );
-- ══════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════
-- ملاحظات تشغيلية مهمة قبل التشغيل في الإنتاج:
--
-- 1) هذا الملف لا يلمس accounts / transactions / atomic_* —
--    تلك تبقى بمشكلتها المعروفة (قراءة مباشرة عبر مفتاح anon
--    العام) إلى أن يتم إصلاح موسّع لاحقاً، بحسب الاتفاق.
--
-- 2) بعد تشغيل هذا الملف، الكود في js/storage.js و js/auth.js
--    يجب تحديثه ليستدعي login_verify / admin_* بدل
--    _sb.from('users').select/insert/update/delete المباشرة،
--    وإلا ستتوقف صفحة employees.html وتسجيل الدخول عن العمل
--    تماماً (لأن RLS تمنع أي وصول مباشر الآن). الإصلاحات
--    المطلوبة في الكود مرفقة في رسالة منفصلة.
--
-- 3) كل مستخدم admin حالي سيُرحَّل تلقائياً لـ bcrypt في أول
--    تسجيل دخول ناجح له بعد هذا الملف. لا حاجة لفعل شيء يدوي.
-- ══════════════════════════════════════════════════════════
