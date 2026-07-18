-- SM-Group — Migration V13
-- تأمين RLS — منع الوصول الخارجي المباشر لقاعدة البيانات
-- ══════════════════════════════════════════════════════════
-- المنطق: المنظومة تستخدم مستخدمين خاصين (جدول users) وليس Supabase Auth
-- لذلك نستخدم app.role كـ claim مخصص في JWT
-- أي طلب بدون هذا الـ claim يُرفض تلقائياً
-- ══════════════════════════════════════════════════════════

-- ── الدالة المساعدة: هل الطلب قادم من التطبيق؟ ──────────
-- تتحقق من وجود claim مخصص في JWT اسمه app_secret
-- يُضبط في إعدادات Supabase → API → JWT Secret
CREATE OR REPLACE FUNCTION is_app_request()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'app_role' = 'smgroup_app',
    false
  );
$$;

-- ══ accounts ══════════════════════════════════════════════
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all"        ON accounts;
DROP POLICY IF EXISTS "app_only_accounts" ON accounts;
CREATE POLICY "app_only_accounts" ON accounts
  FOR ALL USING (is_app_request()) WITH CHECK (is_app_request());

-- ══ transactions ══════════════════════════════════════════
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all"            ON transactions;
DROP POLICY IF EXISTS "app_only_transactions" ON transactions;
CREATE POLICY "app_only_transactions" ON transactions
  FOR ALL USING (is_app_request()) WITH CHECK (is_app_request());

-- ══ users ═════════════════════════════════════════════════
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all"       ON users;
DROP POLICY IF EXISTS "app_only_users"  ON users;
CREATE POLICY "app_only_users" ON users
  FOR ALL USING (is_app_request()) WITH CHECK (is_app_request());

-- ══ audit_log ═════════════════════════════════════════════
DROP POLICY IF EXISTS "allow all"           ON audit_log;
DROP POLICY IF EXISTS "app_only_audit_log"  ON audit_log;
CREATE POLICY "app_only_audit_log" ON audit_log
  FOR ALL USING (is_app_request()) WITH CHECK (is_app_request());

-- ══ notifications ═════════════════════════════════════════
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all"               ON notifications;
DROP POLICY IF EXISTS "app_only_notifications"  ON notifications;
CREATE POLICY "app_only_notifications" ON notifications
  FOR ALL USING (is_app_request()) WITH CHECK (is_app_request());

-- ══ deleted_accounts ══════════════════════════════════════
DROP POLICY IF EXISTS "allow all"                  ON deleted_accounts;
DROP POLICY IF EXISTS "app_only_deleted_accounts"  ON deleted_accounts;
CREATE POLICY "app_only_deleted_accounts" ON deleted_accounts
  FOR ALL USING (is_app_request()) WITH CHECK (is_app_request());

-- ══ alert_settings ════════════════════════════════════════
DROP POLICY IF EXISTS "allow all"               ON alert_settings;
DROP POLICY IF EXISTS "app_only_alert_settings" ON alert_settings;
CREATE POLICY "app_only_alert_settings" ON alert_settings
  FOR ALL USING (is_app_request()) WITH CHECK (is_app_request());

-- ══ currencies ════════════════════════════════════════════
DROP POLICY IF EXISTS "allow all"           ON currencies;
DROP POLICY IF EXISTS "app_only_currencies" ON currencies;
CREATE POLICY "app_only_currencies" ON currencies
  FOR ALL USING (is_app_request()) WITH CHECK (is_app_request());

-- ══ daily_snapshots ═══════════════════════════════════════
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all"                ON daily_snapshots;
DROP POLICY IF EXISTS "app_only_daily_snapshots" ON daily_snapshots;
CREATE POLICY "app_only_daily_snapshots" ON daily_snapshots
  FOR ALL USING (is_app_request()) WITH CHECK (is_app_request());
