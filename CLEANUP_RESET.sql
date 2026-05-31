-- ══════════════════════════════════════════════════════
-- SM-Group — تنظيف بيانات التطوير والاختبار
-- ⚠️ تحذير: هذا يحذف كل البيانات نهائياً
-- شغّله فقط عند البدء الفعلي
-- ══════════════════════════════════════════════════════

-- 1) حذف كل العمليات
TRUNCATE TABLE transactions;

-- 2) حذف كل الحسابات المحذوفة (الأرشيف)
TRUNCATE TABLE deleted_accounts;

-- 3) حذف سجل التدقيق
TRUNCATE TABLE audit_log;

-- 4) إعادة ضبط أرصدة الحسابات الموجودة إلى صفر
UPDATE accounts SET
  bal_usd = 0, bal_eur = 0,
  bal_try = 0, bal_gbp = 0,
  bal_sar = 0, bal_aed = 0,
  bal_egp = 0, bal_jod = 0,
  bal_kwd = 0, bal_qar = 0,
  bal_mad = 0, bal_lyd = 0;

-- 5) التأكد من وجود حساب الأرباح
INSERT INTO accounts (id, name, type, bal_usd, bal_eur, commission_rate)
VALUES ('9999', 'حساب الأرباح', 'profit', 0, 0, 0)
ON CONFLICT (id) DO UPDATE SET
  bal_usd = 0, bal_eur = 0;

-- 6) التحقق النهائي
SELECT 'transactions' as table_name, COUNT(*) as rows FROM transactions
UNION ALL
SELECT 'accounts', COUNT(*) FROM accounts
UNION ALL
SELECT 'deleted_accounts', COUNT(*) FROM deleted_accounts
UNION ALL
SELECT 'audit_log', COUNT(*) FROM audit_log;
