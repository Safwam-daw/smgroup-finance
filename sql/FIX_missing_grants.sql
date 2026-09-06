-- ══════════════════════════════════════════════════════════════
-- إصلاح عاجل: منح صلاحيات GRANT الأساسية المفقودة
--
-- السبب الجذري لخطأ "401 Unauthorized" عند حفظ رسالة المطابقة:
-- الجداول التي أُنشئت عبر SQL مباشرة (لا عبر واجهة Supabase) لم
-- تحصل أبداً على GRANT صريح لأدوار anon/authenticated. سياسات RLS
-- تتحكم بالصفوف، لكنها لا تُغني عن GRANT على مستوى الجدول نفسه —
-- بدونه يرفض PostgREST أي INSERT/UPDATE/DELETE بـ 401 حتى لو كانت
-- سياسة RLS نفسها صحيحة تماماً. القراءة (SELECT) قد تعمل أحياناً
-- بلا GRANT بسبب صلاحية افتراضية أعم في بعض المشاريع، لهذا ظهر
-- الخطأ في POST فقط لا GET.
--
-- هذا الملف يمنح الصلاحيات الأساسية لكل الجداول المتأثرة (ليس
-- print_assets فقط) — آمن تماماً للتشغيل، لا يمسّ أي بيانات.
-- ══════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON public.print_assets     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_settings   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deleted_accounts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.currencies       TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_snapshots TO anon, authenticated;

-- الأعمدة التسلسلية (bigserial/serial) تحتاج صلاحية استخدام
-- الـ sequence بشكل منفصل عن الجدول نفسه في بعض الحالات
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- تحقق سريع: يجب أن تنجح هذه العملية الآن بدون 401
-- (جرّب زر الحفظ في صفحة الإعدادات مباشرة بعد تشغيل هذا الملف)
