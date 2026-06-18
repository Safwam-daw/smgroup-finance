-- SM-Group — Migration V16
-- إصلاح تحذيرات Supabase Advisor
-- 1) تفعيل RLS على public.users (Policy Exists RLS Disabled)
-- 2) تثبيت search_path لكل الدوال (Function Search Path Mutable)
-- ══════════════════════════════════════════════════════════

-- ══ 1. إصلاح RLS على public.users ════════════════════════
-- (V13 أنشأ الـ policy لكن قد لا يكون فعّل RLS فعلاً)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all"      ON public.users;
DROP POLICY IF EXISTS "app_only_users" ON public.users;
CREATE POLICY "app_only_users" ON public.users
  AS PERMISSIVE FOR ALL
  TO anon, authenticated
  USING (is_app_request())
  WITH CHECK (is_app_request());

-- ══ 2. تثبيت search_path لكل الدوال ══════════════════════

-- is_app_request
CREATE OR REPLACE FUNCTION public.is_app_request()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'app_role' = 'smgroup_app',
    false
  );
$$;

-- update_balance
CREATE OR REPLACE FUNCTION public.update_balance(
  p_account_id text,
  p_currency   text,
  p_delta      numeric
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  col_name text := 'bal_' || lower(p_currency);
BEGIN
  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I, 0) + $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING p_delta, p_account_id;
END;
$$;

-- atomic_deposit
CREATE OR REPLACE FUNCTION public.atomic_deposit(
  p_txn_id    bigint,
  p_acc_id    text,
  p_currency  text,
  p_amount    numeric,
  p_commission numeric,
  p_by        text,
  p_date      timestamptz,
  p_note      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  col_name   text    := 'bal_' || lower(p_currency);
  net_amount numeric := p_amount - p_commission;
BEGIN
  PERFORM 1 FROM public.accounts WHERE id = p_acc_id FOR UPDATE;

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING net_amount, p_acc_id;

  IF p_commission > 0 THEN
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING p_commission, '9999';
  END IF;

  INSERT INTO public.transactions (id, type, acc, cur, amt, commission_amt, note, created_by, created_at)
  VALUES (p_txn_id, 'dep', p_acc_id, p_currency, p_amount, p_commission, p_note, p_by, p_date);

  RETURN jsonb_build_object('ok', true, 'txn_id', p_txn_id);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- atomic_withdraw
CREATE OR REPLACE FUNCTION public.atomic_withdraw(
  p_txn_id     bigint,
  p_acc_id     text,
  p_currency   text,
  p_amount     numeric,
  p_commission numeric,
  p_by         text,
  p_date       timestamptz,
  p_force      boolean DEFAULT false,
  p_note       text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  col_name text    := 'bal_' || lower(p_currency);
  cur_bal  numeric := 0;
BEGIN
  EXECUTE format('SELECT COALESCE(%I, 0) FROM public.accounts WHERE id = $1 FOR UPDATE', col_name)
  INTO cur_bal USING p_acc_id;

  IF NOT p_force AND cur_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', cur_bal);
  END IF;

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING p_amount, p_acc_id;

  IF p_commission > 0 THEN
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING p_commission, '9999';
  END IF;

  INSERT INTO public.transactions (id, type, acc, cur, amt, commission_amt, note, created_by, created_at)
  VALUES (p_txn_id, 'wit', p_acc_id, p_currency, p_amount, p_commission, p_note, p_by, p_date);

  RETURN jsonb_build_object('ok', true, 'txn_id', p_txn_id);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- atomic_transfer
CREATE OR REPLACE FUNCTION public.atomic_transfer(
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
SET search_path = public
AS $$
DECLARE
  col_name text    := 'bal_' || lower(p_currency);
  cur_bal  numeric := 0;
BEGIN
  -- قفل بترتيب ثابت لمنع deadlock
  PERFORM 1 FROM public.accounts
  WHERE id IN (p_from_id, p_to_id)
  ORDER BY id FOR UPDATE;

  EXECUTE format('SELECT COALESCE(%I,0) FROM public.accounts WHERE id = $1', col_name)
  INTO cur_bal USING p_from_id;

  IF NOT p_force AND cur_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', cur_bal);
  END IF;

  -- خصم من المرسل
  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING p_amount, p_from_id;

  -- إضافة للمستقبل (الصافي بعد العمولة)
  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING p_net_received, p_to_id;

  -- العمولة لحساب الأرباح
  IF p_commission > 0 THEN
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING p_commission, '9999';
  END IF;

  INSERT INTO public.transactions (id, type, "from", "to", cur, amt, rate, commission_amt, created_by, created_at)
  VALUES (p_txn_id, 'trf', p_from_id, p_to_id, p_currency, p_amount, p_rate, p_commission, p_by, p_date);

  RETURN jsonb_build_object('ok', true, 'txn_id', p_txn_id);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- atomic_reverse_deposit (من V15)
CREATE OR REPLACE FUNCTION public.atomic_reverse_deposit(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t        transactions%ROWTYPE;
  col_name text;
  net_amt  numeric;
BEGIN
  SELECT * INTO t FROM public.transactions
  WHERE id = p_txn_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF t.type <> 'dep' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_a_deposit'); END IF;

  col_name := 'bal_' || lower(t.cur);
  net_amt  := COALESCE(t.amt::numeric, 0) - COALESCE(t.commission_amt::numeric, 0);

  PERFORM 1 FROM public.accounts WHERE id = t.acc FOR UPDATE;

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING net_amt, t.acc;

  IF COALESCE(t.commission_amt::numeric, 0) > 0 THEN
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING t.commission_amt::numeric, '9999';
  END IF;

  UPDATE public.transactions
  SET is_deleted = true, deleted_by = p_deleted_by, deleted_at = now()
  WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- atomic_reverse_withdraw (من V15)
CREATE OR REPLACE FUNCTION public.atomic_reverse_withdraw(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t        transactions%ROWTYPE;
  col_name text;
BEGIN
  SELECT * INTO t FROM public.transactions
  WHERE id = p_txn_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF t.type <> 'wit' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_a_withdrawal'); END IF;

  col_name := 'bal_' || lower(t.cur);

  PERFORM 1 FROM public.accounts WHERE id = t.acc FOR UPDATE;

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING t.amt::numeric, t.acc;

  UPDATE public.transactions
  SET is_deleted = true, deleted_by = p_deleted_by, deleted_at = now()
  WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- atomic_reverse_transfer (من V15)
CREATE OR REPLACE FUNCTION public.atomic_reverse_transfer(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t            transactions%ROWTYPE;
  col_name     text;
  net_received numeric;
BEGIN
  SELECT * INTO t FROM public.transactions
  WHERE id = p_txn_id AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF t.type <> 'trf' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_a_transfer'); END IF;

  col_name     := 'bal_' || lower(t.cur);
  net_received := ROUND(
    COALESCE(t.amt::numeric, 0) * COALESCE(t.rate::numeric, 1)
    - COALESCE(t.commission_amt::numeric, 0),
    6
  );

  PERFORM 1 FROM public.accounts
  WHERE id IN (t."from", t."to")
  ORDER BY id FOR UPDATE;

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING t.amt::numeric, t."from";

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING net_received, t."to";

  IF COALESCE(t.commission_amt::numeric, 0) > 0 THEN
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING t.commission_amt::numeric, '9999';
  END IF;

  UPDATE public.transactions
  SET is_deleted = true, deleted_by = p_deleted_by, deleted_at = now()
  WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- ══ منح الصلاحيات ════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.is_app_request          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_balance          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_deposit          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_withdraw         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_transfer         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reverse_deposit  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reverse_withdraw TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reverse_transfer TO anon, authenticated;
