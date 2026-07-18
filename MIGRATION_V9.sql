-- SM-Group — Migration V9 (مصحح)
-- أرشفة الحسابات المحذوفة برقم 7000+

-- إضافة عمود الرقم الأرشيفي
ALTER TABLE deleted_accounts
  ADD COLUMN IF NOT EXISTS archive_id text DEFAULT NULL;

-- تحديث السجلات الموجودة بطريقة بديلة (بدون window function في UPDATE)
DO $$
DECLARE
  r RECORD;
  counter INTEGER := 1;
BEGIN
  FOR r IN SELECT id FROM deleted_accounts WHERE archive_id IS NULL ORDER BY deleted_at LOOP
    UPDATE deleted_accounts
      SET archive_id = '7' || LPAD(counter::text, 3, '0')
      WHERE id = r.id;
    counter := counter + 1;
  END LOOP;
END;
$$;

-- التحقق
SELECT id, name, archive_id, deleted_at FROM deleted_accounts ORDER BY deleted_at;

-- ══════════════════════════════════════════════════════
-- إضافة: إصلاح الحسابات المحذوفة القديمة بدون archive_id
-- ══════════════════════════════════════════════════════
DO $$
DECLARE
  r RECORD;
  last_num INTEGER;
BEGIN
  -- اجلب أعلى رقم موجود
  SELECT COALESCE(MAX(CAST(SUBSTRING(archive_id FROM 2) AS INTEGER)), 7000)
  INTO last_num
  FROM deleted_accounts
  WHERE archive_id IS NOT NULL AND archive_id ~ '^7[0-9]+$';

  -- أعطِ archive_id للسجلات التي ليس لها واحد
  FOR r IN
    SELECT id FROM deleted_accounts
    WHERE archive_id IS NULL
    ORDER BY deleted_at NULLS LAST
  LOOP
    last_num := last_num + 1;
    UPDATE deleted_accounts
      SET archive_id = '7' || LPAD((last_num - 7000)::text, 3, '0')
      WHERE id = r.id AND archive_id IS NULL;
  END LOOP;
END;
$$;
