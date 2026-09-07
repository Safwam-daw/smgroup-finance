-- ══════════════════════════════════════════════════════════════
-- تشخيص قاطع: هل صلاحيات GRANT مطبَّقة فعلياً على print_assets؟
-- شغّل هذا فقط (بدون أي تعديل)، وأرسل لي النتيجة كصورة أو نص
-- ══════════════════════════════════════════════════════════════

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'print_assets'
ORDER BY grantee, privilege_type;

-- توقُّع النتيجة الصحيحة: صفوف لـ anon و authenticated تشمل
-- SELECT/INSERT/UPDATE/DELETE. إن كانت النتيجة فارغة أو ناقصة،
-- فهذا يؤكد أن FIX_missing_grants.sql لم يُشغَّل فعلياً على هذا
-- المشروع (أو شُغِّل على مشروع Supabase مختلف بالخطأ).
