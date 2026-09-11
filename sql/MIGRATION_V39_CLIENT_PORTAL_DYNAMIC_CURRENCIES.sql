-- ══════════════════════════════════════════════════════════════
-- MIGRATION_V39_CLIENT_PORTAL_DYNAMIC_CURRENCIES.sql
--
-- المشكلة: نظام نشر كشف بوابة الزبون (V36) يُجمِّد الرصيد وقت
-- النشر في عمودين ثابتين فقط: client_published_bal_usd/eur.
-- أي عملة أخرى تُفعَّل لاحقاً (TRY, GBP, ذهب...) لا تظهر للزبون
-- إطلاقاً مهما كان رصيده فيها، لأن آلية النشر لا تعرف عنها شيئاً.
--
-- الحل: عمود JSONB واحد يُجمِّد رصيد كل العملات المعروفة (نفس
-- القائمة الكاملة الموجودة كأعمدة bal_* في accounts) وقت النشر،
-- والواجهة (client.html) تعرض ديناميكياً فقط ما هو مفعّل حالياً
-- من جدول currencies. عمودا USD/EUR القديمان يبقيان لأي كود قديم
-- لا يزال يعتمد عليهما مباشرة (توافق خلفي)، لكن كل الحقول تُحدَّث
-- معاً من نفس السطر.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS client_published_balances jsonb DEFAULT NULL;

-- تعبير مشترك لبناء لقطة كل العملات — نفس القائمة المستخدمة في
-- MIGRATION_V38 لجدول daily_snapshots
-- (usd, eur, try, gbp, sar, aed, egp, jod, kwd, qar, mad, lyd, gold, silver)

CREATE OR REPLACE FUNCTION public.client_publish_one(
  p_account_id text,
  p_by         text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $client_publish_one_fn$
BEGIN
  UPDATE public.accounts SET
    client_published_at      = now(),
    client_published_by      = p_by,
    client_published_bal_usd = bal_usd,
    client_published_bal_eur = bal_eur,
    client_published_balances = jsonb_build_object(
      'usd', bal_usd, 'eur', bal_eur, 'try', bal_try, 'gbp', bal_gbp,
      'sar', bal_sar, 'aed', bal_aed, 'egp', bal_egp, 'jod', bal_jod,
      'kwd', bal_kwd, 'qar', bal_qar, 'mad', bal_mad, 'lyd', bal_lyd,
      'gold', bal_gold, 'silver', bal_silver
    )
  WHERE id = p_account_id AND type = 'customer';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$client_publish_one_fn$;

GRANT EXECUTE ON FUNCTION public.client_publish_one TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.client_publish_all(
  p_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $client_publish_all_fn$
DECLARE
  affected int;
BEGIN
  UPDATE public.accounts SET
    client_published_at      = now(),
    client_published_by      = p_by,
    client_published_bal_usd = bal_usd,
    client_published_bal_eur = bal_eur,
    client_published_balances = jsonb_build_object(
      'usd', bal_usd, 'eur', bal_eur, 'try', bal_try, 'gbp', bal_gbp,
      'sar', bal_sar, 'aed', bal_aed, 'egp', bal_egp, 'jod', bal_jod,
      'kwd', bal_kwd, 'qar', bal_qar, 'mad', bal_mad, 'lyd', bal_lyd,
      'gold', bal_gold, 'silver', bal_silver
    )
  WHERE type = 'customer';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'count', affected);
END;
$client_publish_all_fn$;

GRANT EXECUTE ON FUNCTION public.client_publish_all TO anon, authenticated;

-- ── client_login / client_get_account: تُرجع اللقطة الكاملة
--    balances (كل العملات) بجانب bal_usd/bal_eur القديمين ──────
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
    'bal_usd', a.client_published_bal_usd,
    'bal_eur', a.client_published_bal_eur,
    'balances', a.client_published_balances,
    'client_published_at', a.client_published_at
  ));
END;
$client_login_fn$;

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
    'bal_usd', a.client_published_bal_usd,
    'bal_eur', a.client_published_bal_eur,
    'balances', a.client_published_balances,
    'client_published_at', a.client_published_at
  ));
END;
$client_get_account_fn$;

GRANT EXECUTE ON FUNCTION public.client_login       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_get_account TO anon, authenticated;
