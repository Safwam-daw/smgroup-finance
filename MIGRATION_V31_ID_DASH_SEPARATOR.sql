-- ══════════════════════════════════════════════════════════
-- SM-Group — Migration V31 — إضافة شرطة فاصلة للمعرّفات
-- (PR0001 → PR-0001 ، TN0001 → TN-0001)
--
-- تعديل بسيط على الصياغة فقط، بلا تغيير في المفهوم. يُحدِّث:
--   1) دالة get_profit_account_id() لتُرجع القيمة بالشرطة
--   2) إعادة تسمية حساب الأرباح/الخزينة الفعليين إن كانا موجودين
--      بالمعرّف القديم بلا شرطة (PR0001/TN0001 من V30)
--   3) تحديث كل الإشارات إليهما داخل جدول transactions
-- ══════════════════════════════════════════════════════════

-- ── 1) تحديث الدالة المرجعية لحساب الأرباح ──────────────────
CREATE OR REPLACE FUNCTION public.get_profit_account_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT 'PR-0001'::text;
$$;

GRANT EXECUTE ON FUNCTION public.get_profit_account_id TO anon, authenticated;

-- ── 2) إعادة تسمية حساب الأرباح (PR0001 → PR-0001) إن وُجد ────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.accounts WHERE id = 'PR0001')
     AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = 'PR-0001') THEN
    UPDATE public.accounts     SET id = 'PR-0001' WHERE id = 'PR0001';
    UPDATE public.transactions SET acc = 'PR-0001' WHERE acc = 'PR0001';
    UPDATE public.transactions SET "from" = 'PR-0001' WHERE "from" = 'PR0001';
    UPDATE public.transactions SET "to"   = 'PR-0001' WHERE "to"   = 'PR0001';
  END IF;
END $$;

-- ── 3) إعادة تسمية حساب الخزينة (TN0001 → TN-0001) إن وُجد ────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.accounts WHERE id = 'TN0001')
     AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = 'TN-0001') THEN
    UPDATE public.accounts     SET id = 'TN-0001' WHERE id = 'TN0001';
    UPDATE public.transactions SET acc = 'TN-0001' WHERE acc = 'TN0001';
    UPDATE public.transactions SET "from" = 'TN-0001' WHERE "from" = 'TN0001';
    UPDATE public.transactions SET "to"   = 'TN-0001' WHERE "to"   = 'TN0001';
  END IF;
END $$;

-- ── 4) ضمان وجود الحسابين بالمعرّفين النهائيين ────────────────
INSERT INTO public.accounts (id, name, type, bal_usd, bal_eur, commission_rate)
VALUES ('PR-0001', 'حساب الأرباح', 'profit', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, name, type, bal_usd, bal_eur, commission_rate)
VALUES ('TN-0001', 'الخزينة', 'treasury', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;
