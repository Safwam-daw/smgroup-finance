-- SM-Group — Migration V11
-- 1) دالة atomic لتحديث الرصيد (تمنع race condition)
-- 2) تشفير كلمات المرور الموجودة بـ SHA-256

-- ══ دالة تحديث الرصيد الذرية ══════════════════════════
-- تستخدم UPDATE مباشرة في SQL بدلاً من read-modify-write في JavaScript
-- هذا يضمن أن عمليتين متزامنتين لا تتعارضان أبداً
CREATE OR REPLACE FUNCTION update_balance(
  p_account_id text,
  p_currency    text,
  p_delta       numeric
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  col_name text;
  new_bal  numeric;
BEGIN
  col_name := 'bal_' || lower(p_currency);

  EXECUTE format(
    'UPDATE accounts SET %I = ROUND(COALESCE(%I, 0) + $1, 6)
     WHERE id = $2
     RETURNING %I',
    col_name, col_name, col_name
  )
  INTO new_bal
  USING p_delta, p_account_id;

  RETURN new_bal;
END;
$$;

-- ══ تشفير كلمات المرور الموجودة ══════════════════════
-- كلمات المرور الحالية مخزنة كـ base64 (btoa)
-- نحولها إلى SHA-256 hex
-- pgcrypto مدمجة في Supabase
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- تحويل كلمات المرور الموجودة:
-- 1. نفك الـ base64 للحصول على النص الأصلي
-- 2. نشفره بـ SHA-256
UPDATE users
SET pass = encode(
  digest(
    convert_from(decode(pass, 'base64'), 'UTF8'),
    'sha256'
  ),
  'hex'
)
WHERE pass NOT SIMILAR TO '[0-9a-f]{64}';
-- الشرط يمنع إعادة تشفير كلمات المرور المشفرة مسبقاً

-- ══ منح صلاحية تنفيذ الدالة للـ anon ════════════════
GRANT EXECUTE ON FUNCTION update_balance(text, text, numeric) TO anon;
GRANT EXECUTE ON FUNCTION update_balance(text, text, numeric) TO authenticated;
