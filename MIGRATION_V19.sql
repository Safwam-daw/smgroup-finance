-- ══════════════════════════════════════════════════════════
-- SM-Group — MIGRATION V19
-- الهدف: إزالة الرقم الثابت '9999' من داخل دوال RPC، واستبداله
--        بدالة مرجع واحدة public.get_profit_account_id()
--
-- هذه هي "المرحلة الأولى" فقط من طلب "حساب الأرباح القابل للتحديد":
-- لا تغيير في السلوك إطلاقاً — get_profit_account_id() تُعيد
-- '9999' بالضبط كما كانت مكتوبة سابقاً، لكن من مكان واحد فقط.
-- عندما يُنفَّذ لاحقاً جعل حساب الأرباح قابلاً للاختيار (المرحلة
-- الثانية)، التعديل سيقتصر على تغيير جسم هذه الدالة فقط، بدل
-- تعديل 5 دوال RPC من جديد.
--
-- الدوال المعاد إنشاؤها بنفس التوقيع (signature) تماماً كما في
-- MIGRATION_V16_FINAL.sql — لا تغيير في المعاملات ولا نوع الإرجاع.
-- ══════════════════════════════════════════════════════════

-- ══ 1. حذف النسخ الحالية من الدوال (نفس التوقيعات في V16_FINAL) ══
DROP FUNCTION IF EXISTS public.atomic_deposit(bigint, text, text, numeric, numeric, text, timestamptz, text);
DROP FUNCTION IF EXISTS public.atomic_withdraw(bigint, text, text, numeric, numeric, text, timestamptz, boolean, text);
DROP FUNCTION IF EXISTS public.atomic_transfer(bigint, text, text, text, numeric, numeric, numeric, numeric, text, timestamptz, boolean);
DROP FUNCTION IF EXISTS public.atomic_reverse_deposit(bigint, text);
DROP FUNCTION IF EXISTS public.atomic_reverse_transfer(bigint, text);
DROP FUNCTION IF EXISTS public.get_profit_account_id();

-- ══ 2. دالة المرجع المركزي لحساب الأرباح ══════════════════
-- STABLE لأنها لا تُعدّل بيانات، ويمكن لـ Postgres تخزينها مؤقتاً
-- ضمن نفس الاستعلام. القيمة حالياً ثابتة '9999' — هذا هو المكان
-- الوحيد الذي سيُعدَّل لاحقاً عند تفعيل اختيار حساب الأرباح ديناميكياً.
CREATE FUNCTION public.get_profit_account_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT '9999'::text;
$$;

GRANT EXECUTE ON FUNCTION public.get_profit_account_id TO anon, authenticated;

-- ══ 3. إعادة إنشاء الدوال الخمس مع استبدال '9999' بالدالة المرجعية ══

-- atomic_deposit
CREATE FUNCTION public.atomic_deposit(
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
    ) USING p_commission, public.get_profit_account_id();
  END IF;

  INSERT INTO public.transactions
    (id, type, acc, cur, amt, commission_amt, note, created_by, created_at)
  VALUES
    (p_txn_id, 'dep', p_acc_id, p_currency, p_amount, p_commission, p_note, p_by, p_date);

  RETURN jsonb_build_object('ok', true, 'txn_id', p_txn_id);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- atomic_withdraw
CREATE FUNCTION public.atomic_withdraw(
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
  EXECUTE format(
    'SELECT COALESCE(%I, 0) FROM public.accounts WHERE id = $1 FOR UPDATE',
    col_name
  ) INTO cur_bal USING p_acc_id;

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
    ) USING p_commission, public.get_profit_account_id();
  END IF;

  INSERT INTO public.transactions
    (id, type, acc, cur, amt, commission_amt, note, created_by, created_at)
  VALUES
    (p_txn_id, 'wit', p_acc_id, p_currency, p_amount, p_commission, p_note, p_by, p_date);

  RETURN jsonb_build_object('ok', true, 'txn_id', p_txn_id);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- atomic_transfer
CREATE FUNCTION public.atomic_transfer(
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
  PERFORM 1 FROM public.accounts
  WHERE id IN (p_from_id, p_to_id)
  ORDER BY id FOR UPDATE;

  EXECUTE format(
    'SELECT COALESCE(%I,0) FROM public.accounts WHERE id = $1',
    col_name
  ) INTO cur_bal USING p_from_id;

  IF NOT p_force AND cur_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', cur_bal);
  END IF;

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING p_amount, p_from_id;

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING p_net_received, p_to_id;

  IF p_commission > 0 THEN
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING p_commission, public.get_profit_account_id();
  END IF;

  INSERT INTO public.transactions
    (id, type, "from", "to", cur, amt, rate, commission_amt, created_by, created_at)
  VALUES
    (p_txn_id, 'trf', p_from_id, p_to_id, p_currency, p_amount, p_rate, p_commission, p_by, p_date);

  RETURN jsonb_build_object('ok', true, 'txn_id', p_txn_id);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- atomic_reverse_deposit
CREATE FUNCTION public.atomic_reverse_deposit(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t        public.transactions%ROWTYPE;
  col_name text;
  net_amt  numeric;
BEGIN
  SELECT * INTO t FROM public.transactions
  WHERE id = p_txn_id AND is_deleted = false FOR UPDATE;

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
    ) USING t.commission_amt::numeric, public.get_profit_account_id();
  END IF;

  UPDATE public.transactions
  SET is_deleted = true, deleted_by = p_deleted_by, deleted_at = now()
  WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- atomic_reverse_transfer
CREATE FUNCTION public.atomic_reverse_transfer(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t            public.transactions%ROWTYPE;
  col_name     text;
  net_received numeric;
BEGIN
  SELECT * INTO t FROM public.transactions
  WHERE id = p_txn_id AND is_deleted = false FOR UPDATE;

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
    ) USING t.commission_amt::numeric, public.get_profit_account_id();
  END IF;

  UPDATE public.transactions
  SET is_deleted = true, deleted_by = p_deleted_by, deleted_at = now()
  WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- ══ 4. صلاحيات التنفيذ (كما في V16_FINAL) ═══════════════════
GRANT EXECUTE ON FUNCTION public.atomic_deposit           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_withdraw          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_transfer          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reverse_deposit   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reverse_transfer  TO anon, authenticated;

-- ملاحظة: atomic_reverse_withdraw لا تحتوي أي مرجع لحساب الأرباح
-- في V16_FINAL (السحب لا يُنشئ عمولة تُرحَّل لحساب الأرباح عند
-- عكسه بنفس طريقة الإيداع/التحويل) — لذلك لم تُعَد كتابتها هنا.
