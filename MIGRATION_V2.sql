-- ══════════════════════════════════════════════════════
-- SM-Group v4.3 — Migration V2
-- شغّل هذا في SQL Editor في Supabase
-- ══════════════════════════════════════════════════════

-- 1) إضافة حساب الأرباح إذا لم يكن موجوداً
INSERT INTO accounts (id, name, type, bal_usd, bal_eur)
VALUES ('9999', 'حساب الأرباح', 'profit', 0, 0)
ON CONFLICT (id) DO NOTHING;

-- 2) إضافة عمود نوع العملية للتمييز
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_commission boolean DEFAULT false;

-- 3) إضافة عمود العمولة في الحسابات
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS commission_rate numeric DEFAULT 0.00025;
