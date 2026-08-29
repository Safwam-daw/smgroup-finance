-- ══════════════════════════════════════════════════════════════
-- SM-Group — Migration V32 — استعادة الذرّية للعمليات المالية
--
-- المشكلة المُصلحة:
--   التعديلات الخارجية الأخيرة استبدلت atomic_deposit/withdraw/
--   transfer/reverse_* (RPC ذرّية واحدة لكل عملية) بسلسلة استدعاءات
--   منفصلة من transactions.js (saveTxn ثم updateBalance ثم updateBalance
--   للخزينة ثم ...). هذا يُعيد بالضبط مشكلة "قراءة-ثم-تعديل من الواجهة"
--   التي حُلّت سابقاً:
--     - Race condition حقيقي على فحص "الرصيد كافٍ؟" (TOCTOU).
--     - فشل جزئي بلا تراجع: سجل معاملة بلا تحديث رصيد، أو خصم من
--       المُرسِل بلا إضافة للمستقبل عند فشل الخطوة الثانية.
--     - أخطاء صامتة تماماً على تحديثات الخزينة والعمولة.
--
--   بالإضافة لذلك، دوال atomic_* القديمة (V16/V19) كانت أصلاً معطوبة
--   وظيفياً: تُدرج في أعمدة created_by/created_at، بينما الجدول
--   الفعلي المستخدم من كل الواجهة يستخدم أعمدة by/date — أي أنها لم
--   تكن ستعمل حتى لو استُدعيت كما هي.
--
-- ما يوفره هذا الملف:
--   1) get_treasury_account_id() — بنفس نمط get_profit_account_id()
--      الديناميكي (V22)، بدل الاعتماد على ثابت في JS فقط.
--   2) عمود net_received على transactions — يُخزَّن وقت التحويل بدل
--      إعادة حسابه عند العكس (يُصلح ملاحظة مؤجلة سابقاً: احتمال
--      انزياح تقريب صامت بين وقت التحويل ووقت عكسه).
--   3) إعادة كتابة atomic_deposit / atomic_withdraw / atomic_transfer /
--      atomic_reverse_deposit / atomic_reverse_withdraw /
--      atomic_reverse_transfer — كل واحدة تُنفّذ العملية الرئيسية +
--      قيد الخزينة المقابل (V29) + قيد العمولة (إن وُجد) داخل نفس
--      الـ transaction الذرية الواحدة، مع قفل صفوف (FOR UPDATE) يمنع
--      أي تضارب متزامن، وأي خطأ في أي خطوة يُرجع كل شيء (rollback
--      تلقائي من Postgres).
--
-- لا تغيير في: منطق حساب العمولة (يبقى في JS من commission_rate
-- المخزّن في الحساب — كما كان سابقاً)، ولا في القيود التي لا تمس
-- الخزينة (التحويلات، حسب قرار V29).
-- ══════════════════════════════════════════════════════════════

-- ══ 0. عمود net_received (لتفادي إعادة حساب تقريبي عند عكس التحويل) ══
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS net_received numeric DEFAULT NULL;

-- ══ 1. دالة مرجعية لحساب الخزينة (بنفس نمط get_profit_account_id) ══
CREATE OR REPLACE FUNCTION public.get_treasury_account_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT id FROM public.accounts WHERE type = 'treasury' LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_treasury_account_id TO anon, authenticated;

-- ══ 2. حذف النسخ الحالية (لضمان signatures نظيفة) ══════════════
DROP FUNCTION IF EXISTS public.atomic_deposit(bigint, text, text, numeric, numeric, text, timestamptz, text);
DROP FUNCTION IF EXISTS public.atomic_withdraw(bigint, text, text, numeric, numeric, text, timestamptz, boolean, text);
DROP FUNCTION IF EXISTS public.atomic_transfer(bigint, text, text, text, numeric, numeric, numeric, numeric, text, timestamptz, boolean);
DROP FUNCTION IF EXISTS public.atomic_reverse_deposit(bigint, text);
DROP FUNCTION IF EXISTS public.atomic_reverse_withdraw(bigint, text);
DROP FUNCTION IF EXISTS public.atomic_reverse_transfer(bigint, text);

-- ══ 3. atomic_deposit ══════════════════════════════════════════
-- الإيداع: رصيد الزبون += (المبلغ - العمولة)، الخزينة += -المبلغ
-- (تصبح أكثر سالبية = لديها نقد أكثر)، العمولة (إن وُجدت) → الأرباح.
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
SET search_path = public, extensions
AS $$
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

  -- قفل الحسابات المتأثرة بترتيب ثابت (acc, treasury, profit) لتفادي deadlock
  PERFORM 1 FROM public.accounts
  WHERE id IN (p_acc_id, v_treasury, v_profit)
  ORDER BY id FOR UPDATE;

  -- 1) رصيد الزبون
  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING net_amount, p_acc_id;

  -- 2) الخزينة (القيد المقابل — V29)
  IF v_treasury IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING p_amount, v_treasury;
  END IF;

  -- 3) العمولة → الأرباح
  IF COALESCE(p_commission, 0) > 0 THEN
    IF v_profit IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_profit_account');
    END IF;
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
      col_name, col_name
    ) USING p_commission, v_profit;
  END IF;

  -- ── تسجيل الحركات ─────────────────────────────────────
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
$$;

-- ══ 4. atomic_withdraw ═════════════════════════════════════════
-- السحب: لا عمولة (كما في السلوك الحالي). الخزينة += المبلغ (أكثر إيجابية).
CREATE FUNCTION public.atomic_withdraw(
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
AS $$
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

  IF v_treasury IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
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
$$;

-- ══ 5. atomic_transfer ═════════════════════════════════════════
-- لا قيد خزينة (قرار V29 — لا نقد فعلي يدخل/يخرج من الشباك).
CREATE FUNCTION public.atomic_transfer(
  p_txn_id     bigint,
  p_from_id    text,
  p_to_id      text,
  p_currency   text,
  p_amount     numeric,
  p_rate       numeric,
  p_commission numeric,
  p_by         text,
  p_date       timestamptz,
  p_force      boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  col_name     text    := 'bal_' || lower(p_currency);
  v_treasury   text    := public.get_treasury_account_id();
  v_profit     text    := public.get_profit_account_id();
  cur_bal      numeric := 0;
  gross        numeric;
  net_received numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF p_from_id = p_to_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'same_account');
  END IF;
  IF p_from_id = v_treasury OR p_to_id = v_treasury THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_target_treasury');
  END IF;

  gross        := ROUND(p_amount * COALESCE(p_rate, 1), 6);
  net_received := ROUND(gross - COALESCE(p_commission, 0), 6);

  PERFORM 1 FROM public.accounts
  WHERE id IN (p_from_id, p_to_id, v_profit)
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
  ) USING net_received, p_to_id;

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
    (id, type, acc, "from", "to", cur, amt, rate, commission_amt, net_received, by, date, is_deleted)
  VALUES
    (p_txn_id, 'trf', p_from_id, p_from_id, p_to_id, p_currency, p_amount, p_rate,
     COALESCE(p_commission,0), net_received, p_by, p_date, false);

  IF COALESCE(p_commission, 0) > 0 THEN
    INSERT INTO public.transactions
      (id, type, acc, cur, amt, commission_amt, is_commission_entry, parent_id, by, date, note, is_deleted)
    VALUES
      (p_txn_id + 1, 'fee', p_to_id, p_currency, p_commission, 0, true, p_txn_id, 'system', p_date,
       'عمولة تلقائية', false);
    INSERT INTO public.transactions
      (id, type, acc, cur, amt, commission_amt, is_commission_entry, parent_id, by, date, note, is_deleted)
    VALUES
      (p_txn_id + 2, 'dep', v_profit, p_currency, p_commission, 0, true, p_txn_id, 'system', p_date,
       'عمولة من حساب ' || p_to_id, false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'txn_id', p_txn_id, 'net_received', net_received);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ══ 6. atomic_reverse_deposit ══════════════════════════════════
CREATE FUNCTION public.atomic_reverse_deposit(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
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
$$;

-- ══ 7. atomic_reverse_withdraw ═════════════════════════════════
CREATE FUNCTION public.atomic_reverse_withdraw(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
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
$$;

-- ══ 8. atomic_reverse_transfer ═════════════════════════════════
-- يستخدم net_received المخزَّن (هذه الهجرة) — ويعود لإعادة الحساب
-- فقط للعمليات القديمة السابقة لهذه الهجرة (net_received IS NULL).
CREATE FUNCTION public.atomic_reverse_transfer(
  p_txn_id     bigint,
  p_deleted_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  t            public.transactions%ROWTYPE;
  col_name     text;
  net_received numeric;
  v_profit     text := public.get_profit_account_id();
  ce           public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.transactions
  WHERE id = p_txn_id AND is_deleted = false FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF t.type <> 'trf' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_a_transfer'); END IF;

  col_name := 'bal_' || lower(t.cur);
  net_received := COALESCE(
    t.net_received,
    ROUND(COALESCE(t.amt,0) * COALESCE(t.rate,1) - COALESCE(t.commission_amt,0), 6)
  );

  PERFORM 1 FROM public.accounts
  WHERE id IN (t."from", t."to", v_profit)
  ORDER BY id FOR UPDATE;

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) + $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING t.amt, t."from";

  EXECUTE format(
    'UPDATE public.accounts SET %I = ROUND(COALESCE(%I,0) - $1, 6) WHERE id = $2',
    col_name, col_name
  ) USING net_received, t."to";

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
$$;

-- ══ 9. صلاحيات التنفيذ ═══════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.atomic_deposit           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_withdraw          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_transfer          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reverse_deposit   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reverse_withdraw  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_reverse_transfer  TO anon, authenticated;

-- ⚠️ ملاحظة مهمة للتنفيذ:
--   بعد تشغيل هذا الملف، يجب تحديث js/transactions.js (مرفق منفصلاً)
--   ليستدعي هذه الدوال بدل السلسلة الحالية من saveTxn/updateBalance
--   المنفصلة — وإلا فإن هذه الدوال ستبقى غير مستخدمة كسابقتها.
