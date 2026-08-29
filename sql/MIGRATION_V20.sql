-- ══════════════════════════════════════════════════════════
-- SM-Group — MIGRATION V20
-- الهدف: دعم ميزة "نمط التنقل" (قائمة جانبية / شريط علوي):
--   - الافتراضي: الاختيار محلي لكل جهاز (localStorage — لا يلمس القاعدة)
--   - اختياري: "احفظ على كل أجهزتي" يُخزّن التفضيل في users.nav_style
--     ويُقرأ عند كل تسجيل دخول جديد على أي جهاز
-- ══════════════════════════════════════════════════════════

-- ══ 1. عمود التفضيل — نص حر، NULL = لا مزامنة (يعتمد كل جهاز محليّه) ══
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS nav_style text;

-- ══ 2. إعادة إنشاء login_verify لإرجاع nav_style أيضاً (نفس التوقيع) ══
DROP FUNCTION IF EXISTS public.login_verify(text, text);
CREATE FUNCTION public.login_verify(
  p_username text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
    ok := u.pass = encode(extensions.digest(p_password, 'sha256'), 'hex');
    IF ok THEN
      UPDATE public.users
      SET pass = extensions.crypt(p_password, extensions.gen_salt('bf', 10))
      WHERE id = u.id;
    END IF;
  ELSE
    ok := u.pass = extensions.crypt(p_password, u.pass);
  END IF;

  IF NOT ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', u.id,
    'username', u.username,
    'role', u.role,
    'permissions', u.permissions,
    'nav_style', u.nav_style
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_verify TO anon, authenticated;

-- ══ 3. self_set_nav_style — تحديث تفضيل المستخدم لنفسه فقط ══════
--       لا حاجة لكلمة مرور (إعداد تجميلي بحت، بلا أي أثر مالي أو أمني)
DROP FUNCTION IF EXISTS public.self_set_nav_style(text, text);
CREATE FUNCTION public.self_set_nav_style(
  p_username  text,
  p_nav_style text  -- 'sidebar' أو 'topbar' أو NULL لإلغاء المزامنة
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_nav_style IS NOT NULL AND p_nav_style NOT IN ('sidebar', 'topbar') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_value');
  END IF;

  UPDATE public.users SET nav_style = p_nav_style WHERE username = p_username;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.self_set_nav_style TO anon, authenticated;
