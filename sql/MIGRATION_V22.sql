-- ══════════════════════════════════════════════════════════
-- MIGRATION V22 — حساب الأرباح الديناميكي (المرحلة الثانية)
-- ══════════════════════════════════════════════════════════
-- سابقاً: get_profit_account_id() كانت تُعيد القيمة الثابتة '9999'
-- (راجع تعليق MIGRATION_V19.sql: "هذا هو المكان الوحيد الذي سيُعدَّل
-- لاحقاً عند تفعيل اختيار حساب الأرباح ديناميكياً" — هذا هو ذلك التعديل).
--
-- الآن: تُعيد أي حساب بنوع 'profit' بغض النظر عن كوده. يمكن للمستخدم
-- إنشاء حساب أرباح بأي كود يبدأ بـ 9 (وليس 9999 حصراً)، وكل العمولات
-- التلقائية تُرحَّل إليه تلقائياً دون أي تعديل إضافي في دوال RPC —
-- لأنها جميعاً تستدعي get_profit_account_id() أصلاً.
-- ══════════════════════════════════════════════════════════

-- ══ 1. تأكد أن الحساب الحالي 9999 (إن وُجد) بنوعه الصحيح ═══════
UPDATE public.accounts SET type = 'profit' WHERE id = '9999' AND type <> 'profit';

-- ══ 2. قيد: حساب أرباح واحد فقط في كل قاعدة بيانات ════════════
-- فهرس فريد جزئي: يمنع وجود أكثر من صف واحد بنوع 'profit'
CREATE UNIQUE INDEX IF NOT EXISTS one_profit_account_only
  ON public.accounts (type)
  WHERE type = 'profit';

-- ══ 3. الدالة المرجعية تصبح ديناميكية فعلياً ═══════════════════
CREATE OR REPLACE FUNCTION public.get_profit_account_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT id FROM public.accounts WHERE type = 'profit' LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_profit_account_id TO anon, authenticated;

-- ⚠️ ملاحظة: إن لم يوجد أي حساب بنوع 'profit' عند التشغيل (حالة نادرة)
-- ستُعيد الدالة NULL، وستفشل عمليات العمولة بخطأ واضح بدل صمت خاطئ —
-- الواجهة تُنشئ حساب الأرباح تلقائياً عند أول دخول (Storage.ensureProfitAccount)
-- لذا هذه الحالة لن تحدث عمليًا إلا لو حُذف الحساب يدويًا من قاعدة البيانات مباشرة.
