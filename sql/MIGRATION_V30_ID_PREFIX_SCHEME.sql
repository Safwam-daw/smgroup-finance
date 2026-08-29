-- ══════════════════════════════════════════════════════════
-- SM-Group — Migration V30 — نظام معرّفات بادئة الحروف
-- (CU زبون / CO شركة / PR أرباح / TN خزينة / AC أرشيف)
--
-- سبب الأهمية القصوى لهذا الملف:
--   دالة public.get_profit_account_id() (من MIGRATION_V19) كانت
--   تُرجع القيمة الثابتة '9999' مباشرة، وتُستدعى من app.js في
--   كل تحميل صفحة لتحديث CONFIG.PROFIT_ACCOUNT_ID. لو لم تُحدَّث
--   هذه الدالة، فستستمر بالكتابة فوق القيمة الجديدة 'PR0001'
--   (المعرَّفة في app-constants.js) بالقيمة القديمة '9999' في كل
--   مرة — ما يُبطل نظام معرّفات الحروف بالكامل بصمت.
--
-- كما يُعيد تسمية حسابَي الأرباح/الخزينة الفعليين إن كانا قد
-- أُنشئا مسبقاً بالمعرّفين القديمين (9999 / 8888)، مع تحديث كل
-- الإشارات إليهما داخل جدول transactions (لا توجد قيود FK فعلية
-- على هذه الأعمدة، فالتحديث يدوي بالكامل).
-- ══════════════════════════════════════════════════════════

-- ── 1) تحديث الدالة المرجعية لحساب الأرباح ──────────────────
CREATE OR REPLACE FUNCTION public.get_profit_account_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT 'PR0001'::text;
$$;

GRANT EXECUTE ON FUNCTION public.get_profit_account_id TO anon, authenticated;

-- ── 2) إعادة تسمية حساب الأرباح القديم (9999) إن وُجد ────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.accounts WHERE id = '9999')
     AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = 'PR0001') THEN
    UPDATE public.accounts     SET id = 'PR0001' WHERE id = '9999';
    UPDATE public.transactions SET acc = 'PR0001' WHERE acc = '9999';
    UPDATE public.transactions SET "from" = 'PR0001' WHERE "from" = '9999';
    UPDATE public.transactions SET "to"   = 'PR0001' WHERE "to"   = '9999';
  END IF;
END $$;

-- ── 3) إعادة تسمية حساب الخزينة القديم (8888) إن وُجد ────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.accounts WHERE id = '8888')
     AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = 'TN0001') THEN
    UPDATE public.accounts     SET id = 'TN0001' WHERE id = '8888';
    UPDATE public.transactions SET acc = 'TN0001' WHERE acc = '8888';
    UPDATE public.transactions SET "from" = 'TN0001' WHERE "from" = '8888';
    UPDATE public.transactions SET "to"   = 'TN0001' WHERE "to"   = '8888';
  END IF;
END $$;

-- ── 4) ضمان وجود الحسابين بالمعرّفين الجديدين (لو لم يوجدا أصلاً) ──
INSERT INTO public.accounts (id, name, type, bal_usd, bal_eur, commission_rate)
VALUES ('PR0001', 'حساب الأرباح', 'profit', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, name, type, bal_usd, bal_eur, commission_rate)
VALUES ('TN0001', 'الخزينة', 'treasury', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;
