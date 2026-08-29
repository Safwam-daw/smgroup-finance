-- SM-Group — Migration V7 (بوابة الزبون)

-- 1) إضافة كلمة سر الزبون وحالة التحديث لجدول الحسابات
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS client_pin   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS client_published_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS client_published_by text DEFAULT NULL;

-- 2) توليد PIN عشوائي 6 أرقام للزبائن الموجودين
UPDATE accounts
  SET client_pin = LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0')
  WHERE type = 'customer' AND client_pin IS NULL;
