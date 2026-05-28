-- SM-Group — Migration V5
-- إضافة جدول الأحداث للعمولة كحركة مرئية

-- عمود لربط حركة العمولة بالحركة الأصلية
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS parent_id bigint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_commission_entry boolean DEFAULT false;

-- جدول سجل التدقيق
CREATE TABLE IF NOT EXISTS audit_log (
  id         bigserial PRIMARY KEY,
  action     text NOT NULL,
  page       text,
  username   text,
  details    jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON audit_log;
CREATE POLICY "allow all" ON audit_log FOR ALL USING (true) WITH CHECK (true)
