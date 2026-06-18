-- SM-Group — Migration V15
-- إصلاح عكس رصيد التحويل عند الحذف (atomic_reverse_transfer)
-- بدل updateBalance المتسلسل غير الذري في JS

-- ══ دالة عكس التحويل الذرية ══════════════════════════════

CREATE OR REPLACE FUNCTION atomic_reverse_transfer(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  t            transactions%ROWTYPE;
  col_name     text;
  net_received numeric;
BEGIN
  -- 1) جلب العملية مع قفل الصفين معاً لمنع race condition
  SELECT * INTO t FROM transactions
  WHERE id = p_txn_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF t.type <> 'trf' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_transfer');
  END IF;

  col_name     := 'bal_' || lower(t.cur);
  net_received := ROUND(
    COALESCE(t.amt::numeric, 0) * COALESCE(t.rate::numeric, 1)
    - COALESCE(t.commission_amt::numeric, 0),
    6
  );

  -- 2) قفل حسابَي المرسل والمستقبل (بترتيب ثابت لمنع deadlock)
  PERFORM 1 FROM accounts
  WHERE id IN (t."from", t."to")
  ORDER BY id
  FOR UPDATE;

  -- 3) أعد المبلغ للمرسل
  EXECUTE format(
    'UPDATE accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING t.amt::numeric, t."from";

  -- 4) اخصم من المستقبل ما استلمه فعلاً
  EXECUTE format(
    'UPDATE accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING net_received, t."to";

  -- 5) اخصم العمولة من حساب الأرباح إن وجدت
  IF COALESCE(t.commission_amt::numeric, 0) > 0 THEN
    EXECUTE format(
      'UPDATE accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING t.commission_amt::numeric, '9999';
  END IF;

  -- 6) Soft delete للعملية
  UPDATE transactions
  SET is_deleted = true,
      deleted_by = p_deleted_by,
      deleted_at = now()
  WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  RAISE; -- تراجع تلقائي عن كل الخطوات
END;
$$;

-- ══ دالة عكس الإيداع الذرية ══════════════════════════════

CREATE OR REPLACE FUNCTION atomic_reverse_deposit(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  t        transactions%ROWTYPE;
  col_name text;
  net_amt  numeric;
BEGIN
  SELECT * INTO t FROM transactions
  WHERE id = p_txn_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF t.type <> 'dep' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_deposit');
  END IF;

  col_name := 'bal_' || lower(t.cur);
  net_amt  := COALESCE(t.amt::numeric, 0) - COALESCE(t.commission_amt::numeric, 0);

  -- قفل الحساب
  PERFORM 1 FROM accounts WHERE id = t.acc FOR UPDATE;

  -- اخصم المبلغ الصافي من الحساب
  EXECUTE format(
    'UPDATE accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING net_amt, t.acc;

  -- اخصم العمولة من حساب الأرباح
  IF COALESCE(t.commission_amt::numeric, 0) > 0 THEN
    EXECUTE format(
      'UPDATE accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING t.commission_amt::numeric, '9999';
  END IF;

  -- Soft delete
  UPDATE transactions
  SET is_deleted = true,
      deleted_by = p_deleted_by,
      deleted_at = now()
  WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ══ دالة عكس السحب الذرية ════════════════════════════════

CREATE OR REPLACE FUNCTION atomic_reverse_withdraw(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  t        transactions%ROWTYPE;
  col_name text;
BEGIN
  SELECT * INTO t FROM transactions
  WHERE id = p_txn_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF t.type <> 'wit' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_withdrawal');
  END IF;

  col_name := 'bal_' || lower(t.cur);

  -- قفل الحساب
  PERFORM 1 FROM accounts WHERE id = t.acc FOR UPDATE;

  -- أعد المبلغ للحساب
  EXECUTE format(
    'UPDATE accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING t.amt::numeric, t.acc;

  -- Soft delete
  UPDATE transactions
  SET is_deleted = true,
      deleted_by = p_deleted_by,
      deleted_at = now()
  WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ══ منح الصلاحيات ════════════════════════════════════════
GRANT EXECUTE ON FUNCTION atomic_reverse_deposit  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION atomic_reverse_withdraw TO anon, authenticated;
GRANT EXECUTE ON FUNCTION atomic_reverse_transfer TO anon, authenticated;
