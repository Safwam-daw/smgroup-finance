-- SM-Group — Migration V14
-- دوال ذرية للعمليات المالية — إيداع، سحب، تحويل
-- كل عملية تنجح كاملاً أو تفشل كاملاً — لا حالة وسطى

-- ══ دالة الإيداع الذرية ═══════════════════════════════════
CREATE OR REPLACE FUNCTION atomic_deposit(
  p_txn_id      bigint,
  p_account_id  text,
  p_currency    text,
  p_amount      numeric,
  p_commission  numeric,
  p_net_amount  numeric,
  p_by          text,
  p_date        timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  col_name text;
  new_bal  numeric;
BEGIN
  col_name := 'bal_' || lower(p_currency);

  -- خطوة 1: حفظ سجل العملية
  INSERT INTO transactions (
    id, type, acc, cur, amt, commission_amt,
    is_commission_entry, parent_id, is_deleted, by, date, note
  ) VALUES (
    p_txn_id, 'dep', p_account_id, p_currency, p_amount, p_commission,
    false, null, false, p_by, p_date, ''
  );

  -- خطوة 2: تحديث الرصيد ذرياً
  EXECUTE format(
    'UPDATE accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6)
     WHERE id = $2 RETURNING %I',
    col_name, col_name, col_name
  )
  INTO new_bal
  USING p_net_amount, p_account_id;

  IF new_bal IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'new_balance', new_bal);

EXCEPTION WHEN OTHERS THEN
  RAISE; -- يتراجع تلقائياً عن كل الخطوات
END;
$$;

-- ══ دالة السحب الذرية ════════════════════════════════════
CREATE OR REPLACE FUNCTION atomic_withdraw(
  p_txn_id      bigint,
  p_account_id  text,
  p_currency    text,
  p_amount      numeric,
  p_by          text,
  p_date        timestamptz,
  p_force       boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  col_name    text;
  current_bal numeric;
  new_bal     numeric;
BEGIN
  col_name := 'bal_' || lower(p_currency);

  -- قراءة الرصيد الحالي مع قفل الصف
  EXECUTE format('SELECT COALESCE(%I,0) FROM accounts WHERE id = $1 FOR UPDATE', col_name)
  INTO current_bal
  USING p_account_id;

  -- التحقق من الرصيد
  IF p_amount > current_bal AND NOT p_force THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', current_bal);
  END IF;

  -- خطوة 1: حفظ سجل العملية
  INSERT INTO transactions (
    id, type, acc, cur, amt, commission_amt,
    is_commission_entry, parent_id, is_deleted, by, date, note
  ) VALUES (
    p_txn_id, 'wit', p_account_id, p_currency, p_amount, 0,
    false, null, false, p_by, p_date, ''
  );

  -- خطوة 2: تحديث الرصيد
  EXECUTE format(
    'UPDATE accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6)
     WHERE id = $2 RETURNING %I',
    col_name, col_name, col_name
  )
  INTO new_bal
  USING p_amount, p_account_id;

  RETURN jsonb_build_object('ok', true, 'new_balance', new_bal);

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ══ دالة التحويل الذرية ══════════════════════════════════
CREATE OR REPLACE FUNCTION atomic_transfer(
  p_txn_id       bigint,
  p_from_id      text,
  p_to_id        text,
  p_currency     text,
  p_amount       numeric,
  p_rate         numeric,
  p_commission   numeric,
  p_net_received numeric,
  p_by           text,
  p_date         timestamptz,
  p_force        boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  col_name    text;
  current_bal numeric;
  new_from    numeric;
  new_to      numeric;
BEGIN
  col_name := 'bal_' || lower(p_currency);

  -- قراءة رصيد المرسل مع قفل الصف
  EXECUTE format('SELECT COALESCE(%I,0) FROM accounts WHERE id = $1 FOR UPDATE', col_name)
  INTO current_bal
  USING p_from_id;

  -- قفل صف المستقبل أيضاً لمنع deadlock
  EXECUTE format('SELECT 1 FROM accounts WHERE id = $1 FOR UPDATE', col_name)
  USING p_to_id;

  -- التحقق من الرصيد
  IF p_amount > current_bal AND NOT p_force THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', current_bal);
  END IF;

  -- خطوة 1: حفظ سجل العملية
  INSERT INTO transactions (
    id, type, acc, cur, amt, rate, commission_amt,
    is_commission_entry, parent_id, is_deleted, by, date, note,
    "from", "to"
  ) VALUES (
    p_txn_id, 'trf', p_from_id, p_currency, p_amount, p_rate, p_commission,
    false, null, false, p_by, p_date, '',
    p_from_id, p_to_id
  );

  -- خطوة 2: خصم من المرسل
  EXECUTE format(
    'UPDATE accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2 RETURNING %I',
    col_name, col_name, col_name
  )
  INTO new_from
  USING p_amount, p_from_id;

  -- خطوة 3: إضافة للمستقبل
  EXECUTE format(
    'UPDATE accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2 RETURNING %I',
    col_name, col_name, col_name
  )
  INTO new_to
  USING p_net_received, p_to_id;

  RETURN jsonb_build_object(
    'ok', true,
    'from_balance', new_from,
    'to_balance', new_to
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ══ منح الصلاحيات ════════════════════════════════════════
GRANT EXECUTE ON FUNCTION atomic_deposit  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION atomic_withdraw TO anon, authenticated;
GRANT EXECUTE ON FUNCTION atomic_transfer TO anon, authenticated;
