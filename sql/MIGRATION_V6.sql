-- SM-Group — Migration V6 (3B)
-- حذف الحسابات + تنبيهات الديون + التقارير

-- 1) جدول الحسابات المحذوفة (للاستعادة وإعادة الأرقام)
CREATE TABLE IF NOT EXISTS deleted_accounts (
  id           text PRIMARY KEY,
  name         text,
  type         text,
  bal_usd      numeric DEFAULT 0,
  bal_eur      numeric DEFAULT 0,
  deleted_at   timestamptz DEFAULT now(),
  deleted_by   text,
  transfer_note text  -- ملاحظة تحويل الرصيد
);
ALTER TABLE deleted_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON deleted_accounts;
CREATE POLICY "allow all" ON deleted_accounts FOR ALL USING (true) WITH CHECK (true)

-- 2) جدول إعدادات التنبيهات
CREATE TABLE IF NOT EXISTS alert_settings (
  id            serial PRIMARY KEY,
  debt_limit    numeric DEFAULT -500,  -- حد الدين التلقائي
  updated_at    timestamptz DEFAULT now(),
  updated_by    text
);
ALTER TABLE alert_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON alert_settings;
CREATE POLICY "allow all" ON alert_settings FOR ALL USING (true) WITH CHECK (true)

-- إدراج القيمة الافتراضية
INSERT INTO alert_settings (debt_limit) VALUES (-500)
  ON CONFLICT DO NOTHING;
