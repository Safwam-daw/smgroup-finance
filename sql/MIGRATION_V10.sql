-- SM-Group — Migration V10
-- تحسين جدول سجل التدقيق: إضافة القيمة القديمة والجديدة

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS old_value jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS new_value jsonb DEFAULT NULL;

-- فهرس لتسريع البحث بالمستخدم والتاريخ
CREATE INDEX IF NOT EXISTS idx_audit_username   ON audit_log (username);
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log (created_at DESC);
