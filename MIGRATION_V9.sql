-- SM-Group — Migration V9
-- أرشفة الحسابات المحذوفة برقم 7000+

-- إضافة عمود الرقم الأرشيفي
ALTER TABLE deleted_accounts
  ADD COLUMN IF NOT EXISTS archive_id text DEFAULT NULL;

-- دالة توليد رقم أرشيفي
CREATE OR REPLACE FUNCTION get_next_archive_id()
RETURNS text AS $$
DECLARE
  max_id integer;
BEGIN
  SELECT COALESCE(MAX(CAST(REPLACE(archive_id, '7', '') AS integer)), 999)
  INTO max_id
  FROM deleted_accounts
  WHERE archive_id IS NOT NULL AND archive_id ~ '^7[0-9]+$';
  RETURN '7' || LPAD((max_id - 7000 + 1 + 7000)::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- تحديث السجلات الموجودة
UPDATE deleted_accounts
  SET archive_id = '7' || LPAD((ROW_NUMBER() OVER (ORDER BY deleted_at))::text, 3, '0')
  WHERE archive_id IS NULL;
