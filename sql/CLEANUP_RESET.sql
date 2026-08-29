-- ══════════════════════════════════════════════════════════════
-- SM-Group Finance — تنظيف شامل قبل التسليم
-- ✅ يحتفظ بـ: الموظفين (users) + حساب الأرباح (9999)
-- ❌ يحذف: كل المعاملات، الحسابات، العملاء، السجلات، الإشعارات
-- ⚠️  لا تشغّله إلا مرة واحدة عند التسليم الفعلي
-- ══════════════════════════════════════════════════════════════

-- 1) حذف كل المعاملات
TRUNCATE TABLE transactions RESTART IDENTITY CASCADE;

-- 2) حذف اللقطات اليومية
TRUNCATE TABLE daily_snapshots RESTART IDENTITY CASCADE;

-- 3) حذف الحسابات المؤرشفة
TRUNCATE TABLE deleted_accounts RESTART IDENTITY CASCADE;

-- 4) حذف سجل التدقيق
TRUNCATE TABLE audit_log RESTART IDENTITY CASCADE;

-- 5) حذف الإشعارات
TRUNCATE TABLE notifications RESTART IDENTITY CASCADE;

-- 6) حذف إعدادات التنبيهات
TRUNCATE TABLE alert_settings RESTART IDENTITY CASCADE;

-- 7) حذف كل الحسابات (عملاء + خزينة) ما عدا حساب الأرباح
DELETE FROM accounts WHERE id <> '9999';

-- 8) تصفير رصيد حساب الأرباح مع الحفاظ عليه
UPDATE accounts SET
  bal_usd = 0, bal_eur = 0,
  bal_try = 0, bal_gbp = 0,
  bal_sar = 0, bal_aed = 0,
  bal_egp = 0, bal_jod = 0,
  bal_kwd = 0, bal_qar = 0,
  bal_mad = 0, bal_lyd = 0
WHERE id = '9999';

-- 9) ضمان وجود حساب الأرباح إذا كان محذوفاً
INSERT INTO accounts (id, name, type,
  bal_usd, bal_eur, bal_try, bal_gbp,
  bal_sar, bal_aed, bal_egp, bal_jod,
  bal_kwd, bal_qar, bal_mad, bal_lyd,
  commission_rate)
VALUES ('9999', 'حساب الأرباح', 'profit',
  0,0,0,0,0,0,0,0,0,0,0,0, 0)
ON CONFLICT (id) DO NOTHING;

-- ══ التحقق النهائي ══════════════════════════════════════════
SELECT 'users (الموظفون)'       AS جدول, COUNT(*) AS عدد FROM users
UNION ALL
SELECT 'accounts (الحسابات)',    COUNT(*) FROM accounts
UNION ALL
SELECT 'transactions (المعاملات)', COUNT(*) FROM transactions
UNION ALL
SELECT 'audit_log (التدقيق)',    COUNT(*) FROM audit_log
UNION ALL
SELECT 'notifications (الإشعارات)', COUNT(*) FROM notifications
UNION ALL
SELECT 'daily_snapshots (اللقطات)', COUNT(*) FROM daily_snapshots;
