-- ══════════════════════════════════════════════════════════════
-- SM-Group — Migration V37 — سد فجوة صلاحيات حول حساب admin الجذري
--
-- المشكلة: employees.html يلتزم بقاعدة "فقط admin (صاحب النظام)
-- يقدر ينشئ أدمن جديد" على مستوى الواجهة فقط. لكن داخل القاعدة،
-- أربع دوال كانت تتحقق فقط أن المتصل "أدمن" بشكل عام
-- (_is_caller_admin) دون تمييز الجذري (admin) عن أي أدمن فرعي
-- مستقبلي. عملياً هذا يعني أن أدمن فرعياً واحداً — لو وُجد يوماً —
-- كان يقدر عبر استدعاء الدالة مباشرة (متجاوزاً الواجهة):
--   1) إنشاء أدمن كامل آخر (admin_create_user)
--   2) ترقية أي موظف عادي إلى أدمن (admin_set_user_role)
--   3) حذف حساب admin الجذري نفسه بالكامل (admin_delete_user)
--   4) تغيير كلمة مرور admin الجذري دون علمه (admin_set_user_password)
--   — أي الاستيلاء الكامل على النظام أو تعطيل صاحبه الحقيقي.
--
-- هذا الملف يفرض نفس قاعدة العمل داخل القاعدة نفسها في الدوال
-- الأربع معاً، لا في admin_create_user وحدها.
-- ══════════════════════════════════════════════════════════════

-- ── 1) admin_create_user — منح دور admin محصور بصاحب النظام ────
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text, text, jsonb);
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
SET search_path = public, extensions
AS $admin_create_user_fn$
BEGIN
  IF NOT public._is_caller_admin(p_caller_username, p_caller_password) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_new_role = 'admin' AND p_caller_username <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE username = p_new_username) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'username_taken');
  END IF;

  INSERT INTO public.users (username, pass, role, permissions)
  VALUES (
    p_new_username,
    extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
    p_new_role,
    p_new_permissions
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$admin_create_user_fn$;

-- ── 2) admin_set_user_role — منع الترقية إلى admin أو المساس
--      بدور admin الجذري نفسه إلا من صاحب النظام ──────────────
DROP FUNCTION IF EXISTS public.admin_set_user_role(text, text, bigint, text);
CREATE FUNCTION public.admin_set_user_role(
  p_caller_username text,
  p_caller_password text,
  p_target_id        bigint,
  p_role              text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $admin_set_user_role_fn$
DECLARE
  target_username text;
BEGIN
  IF NOT public._is_caller_admin(p_caller_username, p_caller_password) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT username INTO target_username FROM public.users WHERE id = p_target_id;

  IF (p_role = 'admin' OR target_username = 'admin') AND p_caller_username <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.users SET role = p_role WHERE id = p_target_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$admin_set_user_role_fn$;

-- ── 3) admin_delete_user — حساب admin الجذري لا يُحذف أبداً ────
DROP FUNCTION IF EXISTS public.admin_delete_user(text, text, bigint);
CREATE FUNCTION public.admin_delete_user(
  p_caller_username text,
  p_caller_password text,
  p_target_id        bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $admin_delete_user_fn$
DECLARE
  target_username text;
BEGIN
  IF NOT public._is_caller_admin(p_caller_username, p_caller_password) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT username INTO target_username FROM public.users WHERE id = p_target_id;

  IF target_username = 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_delete_root_admin');
  END IF;

  DELETE FROM public.users WHERE id = p_target_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$admin_delete_user_fn$;

-- ── 4) admin_set_user_password — كلمة مرور admin الجذري لا
--      يُغيّرها إلا هو نفسه ──────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_set_user_password(text, text, bigint, text);
CREATE FUNCTION public.admin_set_user_password(
  p_caller_username text,
  p_caller_password text,
  p_target_id        bigint,
  p_new_password      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $admin_set_user_password_fn$
DECLARE
  target_username text;
BEGIN
  IF NOT public._is_caller_admin(p_caller_username, p_caller_password) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT username INTO target_username FROM public.users WHERE id = p_target_id;

  IF target_username = 'admin' AND p_caller_username <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.users
  SET pass = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10))
  WHERE id = p_target_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$admin_set_user_password_fn$;

-- ── إعادة منح صلاحيات التنفيذ ────────────────────────────────
-- ⚠️ ضرورية: DROP FUNCTION يُسقط أي GRANT سابق مرتبط بالدالة القديمة،
-- ولا يرثها الكائن الجديد تلقائياً. بدون هذا القسم، تسجيل الدخول
-- (login_verify، غير مُعدَّلة هنا) يبقى يعمل بلا مشاكل، لكن إدارة
-- الموظفين (إنشاء/حذف/تغيير دور أو كلمة مرور) كانت ستتعطل بخطأ صلاحيات.
GRANT EXECUTE ON FUNCTION public.admin_create_user       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password TO anon, authenticated;
