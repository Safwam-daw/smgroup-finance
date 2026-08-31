-- ══════════════════════════════════════════════════════════════
-- SM-Group — Migration V33 — عكس اصطلاح إشارة رصيد الخزينة
--
-- الاصطلاح القديم (V29 وV32): سالب = فائض (لديها نقد)، موجب = عجز.
-- الاصطلاح الجديد (بطلب صريح الآن): موجب = فائض (لديها نقد)،
-- سالب = عجز (تحتاج نقداً) — أوضح وأقرب للحدس المعتاد في المحاسبة.
--
-- نوع الحركة (dep/wit) لا يتغيّر إطلاقاً — يبقى إيداع الزبون
-- مسجَّلاً كـ"إيداع" في الخزينة أيضاً (فعلاً نقد دخل الصندوق)،
-- وسحب الزبون "سحب" من الخزينة. المتغيّر الوحيد هو اتجاه الإشارة
-- على الرصيد الرقمي، لا نوع القيد.
--
-- هذا الملف يعدّل:
--   1) atomic_deposit / atomic_withdraw — إشارة تحديث رصيد الخزينة
--   2) atomic_reverse_deposit / atomic_reverse_withdraw — بالمثل
--   3) يعكس (× -1) الرصيد الحالي المتراكم على حساب الخزينة الفعلي
--      فقط (وليس أي حساب آخر) — حتى لا تنقلب كل الأرصدة القديمة
--      بمجرد تغيير منطق العمليات المستقبلية بينما القديم لا يزال
--      بالاصطلاح المعاكس.
-- ══════════════════════════════════════════════════════════════

-- ── 1) عكس الرصيد الحالي المتراكم على حساب الخزينة فقط ─────────
DO $$
DECLARE
  v_treasury text := public.get_treasury_account_id();
BEGIN
  IF v_treasury IS NOT NULL THEN
    UPDATE public.accounts SET
      bal_usd = -COALESCE(bal_usd,0), bal_eur = -COALESCE(bal_eur,0),
      bal_try = -COALESCE(bal_try,0), bal_gbp = -COALESCE(bal_gbp,0),
      bal_sar = -COALESCE(bal_sar,0), bal_aed = -COALESCE(bal_aed,0),
      bal_egp = -COALESCE(bal_egp,0), bal_jod = -COALESCE(bal_jod,0),
      bal_kwd = -COALESCE(bal_kwd,0), bal_qar = -COALESCE(bal_qar,0),
      bal_mad = -COALESCE(bal_mad,0), bal_lyd = -COALESCE(bal_lyd,0)
    WHERE id = v_treasury;
  END IF;
END $$;

-- ── 2) atomic_deposit — الخزينة الآن += المبلغ (فائض أكبر) ──────
CREATE OR REPLACE FUNCTION public.atomic_deposit(
  p_txn_id     bigint,
  p_acc_id     text,
  p_currency   text,
  p_amount     numeric,
  p_commission numeric,
  p_by         text,
  p_date       timestamptz,
  p_note       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $atomic_deposit_fn$
DECLARE
  col_name     text    := 'bal_' || lower(p_currency);
  v_treasury   text    := public.get_treasury_account_id();
  v_profit     text    := public.get_profit_account_id();
  net_amount   numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF p_acc_id = v_treasury THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_target_treasury');
  END IF;

  net_amount := ROUND(p_amount - COALESCE(p_commission, 0), 6);

  PERFORM 1 FROM public.accounts
  WHERE id IN (p_acc_id, v_treasury, v_profit)
  ORDER BY id FOR UPDATE;

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING net_amount, p_acc_id;

  -- الخزينة: نقد حقيقي دخل الصندوق من الزبون => فائض أكبر => +=
  IF v_treasury IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING p_amount, v_treasury;
  END IF;

  IF COALESCE(p_commission, 0) > 0 THEN
    IF v_profit IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_profit_account');
    END IF;
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING p_commission, v_profit;
  END IF;

  INSERT INTO public.transactions
    (id, type, acc, cur, amt, commission_amt, note, by, date, is_deleted)
  VALUES
    (p_txn_id, 'dep', p_acc_id, p_currency, p_amount, COALESCE(p_commission,0), p_note, p_by, p_date, false);

  IF v_treasury IS NOT NULL THEN
    INSERT INTO public.transactions
      (id, type, acc, cur, amt, commission_amt, is_commission_entry, parent_id, by, date, note, is_deleted)
    VALUES
      (p_txn_id + 3, 'dep', v_treasury, p_currency, p_amount, 0, true, p_txn_id, 'system', p_date,
       'إيداع من حساب ' || p_acc_id, false);
  END IF;

  IF COALESCE(p_commission, 0) > 0 THEN
    INSERT INTO public.transactions
      (id, type, acc, cur, amt, commission_amt, is_commission_entry, parent_id, by, date, note, is_deleted)
    VALUES
      (p_txn_id + 1, 'fee', p_acc_id, p_currency, p_commission, 0, true, p_txn_id, 'system', p_date,
       'عمولة تلقائية', false);
    INSERT INTO public.transactions
      (id, type, acc, cur, amt, commission_amt, is_commission_entry, parent_id, by, date, note, is_deleted)
    VALUES
      (p_txn_id + 2, 'dep', v_profit, p_currency, p_commission, 0, true, p_txn_id, 'system', p_date,
       'عمولة من حساب ' || p_acc_id, false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'txn_id', p_txn_id, 'net_amount', net_amount);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$atomic_deposit_fn$;

-- ── 3) atomic_withdraw — الخزينة الآن -= المبلغ (عجز أكبر) ──────
CREATE OR REPLACE FUNCTION public.atomic_withdraw(
  p_txn_id   bigint,
  p_acc_id   text,
  p_currency text,
  p_amount   numeric,
  p_by       text,
  p_date     timestamptz,
  p_force    boolean DEFAULT false,
  p_note     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $atomic_withdraw_fn$
DECLARE
  col_name   text := 'bal_' || lower(p_currency);
  v_treasury text := public.get_treasury_account_id();
  cur_bal    numeric := 0;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF p_acc_id = v_treasury THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_target_treasury');
  END IF;

  PERFORM 1 FROM public.accounts
  WHERE id IN (p_acc_id, v_treasury)
  ORDER BY id FOR UPDATE;

  EXECUTE format(
    'SELECT COALESCE(%I, 0) FROM public.accounts WHERE id = $1',
    col_name
  ) INTO cur_bal USING p_acc_id;

  IF NOT p_force AND cur_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', cur_bal);
  END IF;

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING p_amount, p_acc_id;

  -- الخزينة: نقد حقيقي خرج من الصندوق للزبون => عجز أكبر => -=
  IF v_treasury IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING p_amount, v_treasury;
  END IF;

  INSERT INTO public.transactions
    (id, type, acc, cur, amt, commission_amt, note, by, date, is_deleted)
  VALUES
    (p_txn_id, 'wit', p_acc_id, p_currency, p_amount, 0, p_note, p_by, p_date, false);

  IF v_treasury IS NOT NULL THEN
    INSERT INTO public.transactions
      (id, type, acc, cur, amt, commission_amt, is_commission_entry, parent_id, by, date, note, is_deleted)
    VALUES
      (p_txn_id + 3, 'wit', v_treasury, p_currency, p_amount, 0, true, p_txn_id, 'system', p_date,
       'سحب من حساب ' || p_acc_id, false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'txn_id', p_txn_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$atomic_withdraw_fn$;

-- ── 4) atomic_reverse_deposit — عكس متماشٍ مع الاصطلاح الجديد ───
CREATE OR REPLACE FUNCTION public.atomic_reverse_deposit(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $atomic_reverse_deposit_fn$
DECLARE
  t          public.transactions%ROWTYPE;
  col_name   text;
  net_amt    numeric;
  v_treasury text := public.get_treasury_account_id();
  v_profit   text := public.get_profit_account_id();
  ce         public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.transactions
  WHERE id = p_txn_id AND is_deleted = false FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF t.type <> 'dep' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_a_deposit'); END IF;

  col_name := 'bal_' || lower(t.cur);
  net_amt  := ROUND(COALESCE(t.amt,0) - COALESCE(t.commission_amt,0), 6);

  PERFORM 1 FROM public.accounts
  WHERE id IN (t.acc, v_treasury, v_profit)
  ORDER BY id FOR UPDATE;

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING net_amt, t.acc;

  -- عكس إيداع: كان += على الخزينة، فالعكس -=
  IF v_treasury IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING t.amt, v_treasury;
  END IF;

  FOR ce IN
    SELECT * FROM public.transactions
    WHERE parent_id = p_txn_id AND is_commission_entry = true AND is_deleted = false
  LOOP
    IF ce.acc = v_profit THEN
      EXECUTE format(
        'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
        col_name, col_name
      ) USING ce.amt, v_profit;
    END IF;
    UPDATE public.transactions
    SET is_deleted = true, deleted_by = p_deleted_by, deleted_at = now()
    WHERE id = ce.id;
  END LOOP;

  UPDATE public.transactions
  SET is_deleted = true, deleted_by = p_deleted_by, deleted_at = now()
  WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$atomic_reverse_deposit_fn$;

-- ── 5) atomic_reverse_withdraw — عكس متماشٍ مع الاصطلاح الجديد ──
CREATE OR REPLACE FUNCTION public.atomic_reverse_withdraw(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $atomic_reverse_withdraw_fn$
DECLARE
  t          public.transactions%ROWTYPE;
  col_name   text;
  v_treasury text := public.get_treasury_account_id();
  ce         public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.transactions
  WHERE id = p_txn_id AND is_deleted = false FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF t.type <> 'wit' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_a_withdrawal'); END IF;

  col_name := 'bal_' || lower(t.cur);

  PERFORM 1 FROM public.accounts
  WHERE id IN (t.acc, v_treasury)
  ORDER BY id FOR UPDATE;

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING t.amt, t.acc;

  -- عكس سحب: كان -= على الخزينة، فالعكس +=
  IF v_treasury IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING t.amt, v_treasury;
  END IF;

  FOR ce IN
    SELECT * FROM public.transactions
    WHERE parent_id = p_txn_id AND is_commission_entry = true AND is_deleted = false
  LOOP
    UPDATE public.transactions
    SET is_deleted = true, deleted_by = p_deleted_by, deleted_at = now()
    WHERE id = ce.id;
  END LOOP;

  UPDATE public.transactions
  SET is_deleted = true, deleted_by = p_deleted_by, deleted_at = now()
  WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$atomic_reverse_withdraw_fn$;

GRANT EXECUTE ON FUNCTION public.atomic_deposit          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_withdraw         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reverse_deposit  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reverse_withdraw TO anon, authenticated;

-- ⚠️ atomic_transfer / atomic_reverse_transfer لا تلمسان الخزينة إطلاقاً
-- (قرار V29 — لا نقد فعلي يدخل/يخرج من الشباك عند التحويل)، فلا حاجة
-- لتعديلهما هنا.

-- ── التحقق ────────────────────────────────────────────────────
SELECT id, name, bal_usd, bal_eur FROM public.accounts WHERE type = 'treasury';
