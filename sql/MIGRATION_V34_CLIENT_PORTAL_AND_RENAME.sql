-- ══════════════════════════════════════════════════════════════
-- SM-Group — Migration V34
--
-- ثلاث معالجات مستقلة:
--
-- 1) 🔴 إصلاح حرج: تسريب بيانات كل الزبائن من صفحة بوابة الزبون.
--    كانت clientLogin() تجلب جدول accounts كاملاً (بما فيه PIN كل
--    زبون بنص صريح عبر عمود client_pin_plain) إلى المتصفح، ثم تقارن
--    الرقم محلياً — أي زائر لصفحة الدخول (حتى بدون كتابة أي شيء
--    صحيح) يُنزَّل كل شيء. الحل: كل المقارنة تتم الآن داخل القاعدة
--    عبر client_login()، ولا تُعاد سوى بيانات الحساب المطابق نفسه —
--    لا الجدول كاملاً، ولا أي عمود PIN مطلقاً. أضفت أيضاً
--    client_get_account() لإعادة تحميل الجلسة بعد أول دخول ناجح
--    بنفس المبدأ (حساب واحد فقط، لا الجدول كاملاً).
--
-- 2) جعل get_profit_account_id() ديناميكية (بنفس نمط
--    get_treasury_account_id من V32) بدل إرجاع 'PR-0001' ثابتاً —
--    شرط ضروري لميزة "تعديل كود حساب الأرباح" الجديدة أدناه.
--
-- 3) atomic_rename_structural_account() — تعديل كود حساب الأرباح
--    أو الخزينة فقط (لا الزبائن/الشركات — أثر أكبر وأخطر هناك على
--    كشوفات مطبوعة/مُرسَلة سابقاً بالكود القديم)، مع تحديث كل
--    الحركات المرتبطة (acc/from/to) بنفس العملية الذرية.
-- ══════════════════════════════════════════════════════════════

-- ── 1) بوابة الزبون: تسجيل الدخول داخل القاعدة فقط ──────────────
CREATE OR REPLACE FUNCTION public.client_login(
  p_account_id text,
  p_pin        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $client_login_fn$
DECLARE
  a public.accounts%ROWTYPE;
  hashed text;
BEGIN
  IF p_account_id IS NULL OR p_pin IS NULL OR length(trim(p_pin)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  END IF;

  SELECT * INTO a FROM public.accounts
  WHERE id = trim(p_account_id) AND type = 'customer';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  END IF;

  hashed := encode(extensions.digest(trim(p_pin), 'sha256'), 'hex');

  IF a.client_pin IS NULL OR a.client_pin <> hashed THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  END IF;

  RETURN jsonb_build_object('ok', true, 'account', jsonb_build_object(
    'id', a.id, 'name', a.name,
    'bal_usd', a.bal_usd, 'bal_eur', a.bal_eur,
    'client_published_at', a.client_published_at
  ));
END;
$client_login_fn$;

GRANT EXECUTE ON FUNCTION public.client_login TO anon, authenticated;

-- ── استعادة الجلسة بعد أول دخول ناجح — حساب واحد فقط، لا الجدول كاملاً
CREATE OR REPLACE FUNCTION public.client_get_account(
  p_account_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $client_get_account_fn$
DECLARE
  a public.accounts%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.accounts
  WHERE id = trim(p_account_id) AND type = 'customer';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'account', jsonb_build_object(
    'id', a.id, 'name', a.name,
    'bal_usd', a.bal_usd, 'bal_eur', a.bal_eur,
    'client_published_at', a.client_published_at
  ));
END;
$client_get_account_fn$;

GRANT EXECUTE ON FUNCTION public.client_get_account TO anon, authenticated;

-- ── 2) get_profit_account_id() تصبح ديناميكية (بنفس نمط الخزينة) ──
CREATE OR REPLACE FUNCTION public.get_profit_account_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $get_profit_id_fn$
  SELECT id FROM public.accounts WHERE type = 'profit' LIMIT 1;
$get_profit_id_fn$;

-- ── 3) تعديل كود حساب الأرباح/الخزينة فقط ────────────────────────
CREATE OR REPLACE FUNCTION public.atomic_rename_structural_account(
  p_old_id text,
  p_new_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $rename_structural_fn$
DECLARE
  a public.accounts%ROWTYPE;
  required_prefix text;
BEGIN
  SELECT * INTO a FROM public.accounts WHERE id = p_old_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF a.type NOT IN ('profit', 'treasury') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_structural_account');
  END IF;

  required_prefix := CASE a.type WHEN 'profit' THEN 'PR-' WHEN 'treasury' THEN 'TN-' END;
  IF p_new_id IS NULL OR NOT (p_new_id LIKE required_prefix || '%') OR length(p_new_id) <= length(required_prefix) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_prefix', 'required_prefix', required_prefix);
  END IF;

  IF p_new_id = p_old_id THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true);
  END IF;

  IF EXISTS (SELECT 1 FROM public.accounts WHERE id = p_new_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'id_taken');
  END IF;

  UPDATE public.accounts SET id = p_new_id WHERE id = p_old_id;
  UPDATE public.transactions SET acc     = p_new_id WHERE acc     = p_old_id;
  UPDATE public.transactions SET "from"  = p_new_id WHERE "from"  = p_old_id;
  UPDATE public.transactions SET "to"    = p_new_id WHERE "to"    = p_old_id;
  UPDATE public.deleted_accounts SET id  = p_new_id WHERE id      = p_old_id;

  RETURN jsonb_build_object('ok', true, 'new_id', p_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$rename_structural_fn$;

GRANT EXECUTE ON FUNCTION public.atomic_rename_structural_account TO anon, authenticated;

-- ── التحقق ────────────────────────────────────────────────────
SELECT public.get_profit_account_id()   AS profit_id;
SELECT public.get_treasury_account_id() AS treasury_id;
