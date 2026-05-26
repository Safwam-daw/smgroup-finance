-- ══════════════════════════════════════════════════════
-- SM-Group v5 — Migration V3 (الصلاحيات + العمولة)
-- شغّل هذا في SQL Editor في Supabase
-- ══════════════════════════════════════════════════════

-- 1) إضافة عمود الصلاحيات لجدول المستخدمين
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{
    "dashboard": true,
    "accounts":  true,
    "deposit":   true,
    "withdraw":  true,
    "transfer":  true,
    "ledger":    true,
    "statement": true,
    "employees": false,
    "canDelete": false,
    "canEdit":   false
  }'::jsonb;

-- 2) منح الأدمن كل الصلاحيات
UPDATE users SET permissions = '{
  "dashboard": true,
  "accounts":  true,
  "deposit":   true,
  "withdraw":  true,
  "transfer":  true,
  "ledger":    true,
  "statement": true,
  "employees": true,
  "canDelete": true,
  "canEdit":   true
}'::jsonb WHERE role = 'admin';

-- 3) عمولة الإيداع في جدول الحسابات
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS commission_rate numeric DEFAULT 0.00025;

-- تطبيق العمولة على الزبائن فقط، الشركات = 0
UPDATE accounts SET commission_rate = 0 WHERE type = 'company';
UPDATE accounts SET commission_rate = 0 WHERE type = 'profit';

-- 4) عمود العمولة في العمليات
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS commission_amt numeric DEFAULT 0;
