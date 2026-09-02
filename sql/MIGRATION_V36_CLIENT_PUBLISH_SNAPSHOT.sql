-- ══════════════════════════════════════════════════════════════
-- SM-Group — Migration V36 — تجميد رصيد بوابة الزبون عند النشر
--
-- المشكلة: زر "نشر الكشوفات" (فردي أو للكل) كان يُحدِّث client_published_at
-- فقط، بينما الرصيد المعروض للزبون يُقرأ دائماً من bal_usd/bal_eur
-- الحيّة مباشرة — أي الزبون يرى رصيده الفعلي اللحظي بغض النظر عن
-- الضغط على "نشر" من الأساس، والنشر كان يتحكم بقائمة الحركات فقط.
--
-- كذلك: حساب لم يُنشر له أي كشف مطلقاً (client_published_at لا يزال
-- NULL) كان يعرض كل حركاته بلا استثناء (لأن getClientTxns تتجاهل
-- الفلترة إن كان publishedAt فارغاً) — عكس المقصود تماماً.
--
-- الحل: عمودان جديدان يُجمّدان لقطة الرصيد وقت الضغط على "نشر"،
-- والبوابة تعرض هذه اللقطة فقط لا الرصيد الحي.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS client_published_bal_usd numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS client_published_bal_eur numeric DEFAULT NULL;

-- ── نشر كشف حساب واحد ────────────────────────────────────────
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
    client_published_bal_eur = bal_eur
  WHERE id = p_account_id AND type = 'customer';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$client_publish_one_fn$;

GRANT EXECUTE ON FUNCTION public.client_publish_one TO anon, authenticated;

-- ── نشر كشوفات كل الزبائن دفعة واحدة ─────────────────────────
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
    client_published_bal_eur = bal_eur
  WHERE type = 'customer';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'count', affected);
END;
$client_publish_all_fn$;

GRANT EXECUTE ON FUNCTION public.client_publish_all TO anon, authenticated;

-- ── client_login / client_get_account: إرجاع اللقطة المنشورة
--    فقط، لا الرصيد الحي (تستبدل نسخة V34) ─────────────────────
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
    'client_published_at', a.client_published_at
  ));
END;
$client_get_account_fn$;

GRANT EXECUTE ON FUNCTION public.client_login       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_get_account TO anon, authenticated;
