-- SM-Group — Migration V15
-- تشفير client_pin الموجودة بـ SHA-256

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- تحويل كل الـ PINs الموجودة من plain text إلى SHA-256
-- نتحقق من الطول لتجنب تشفير ما تم تشفيره مسبقاً
UPDATE accounts
SET client_pin = encode(digest(client_pin, 'sha256'), 'hex')
WHERE client_pin IS NOT NULL
  AND length(client_pin) != 64;
