-- SM-Group — Migration V12
-- Soft Delete للعمليات المالية — لا حذف نهائي أبداً

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_deleted  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_by  text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz DEFAULT NULL;

-- فهرس لتسريع الاستعلامات التي تستثني المحذوفات
CREATE INDEX IF NOT EXISTS idx_txn_is_deleted ON transactions (is_deleted);

-- تأكد أن كل السجلات الموجودة غير محذوفة
UPDATE transactions SET is_deleted = false WHERE is_deleted IS NULL;
