-- استعادة حساب الأرباح إذا حُذف بالخطأ
-- شغّل هذا في SQL Editor في Supabase

INSERT INTO accounts (id, name, type, bal_usd, bal_eur, commission_rate)
VALUES ('9999', 'حساب الأرباح', 'profit', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- تحقق
SELECT id, name, type, bal_usd, bal_eur FROM accounts WHERE id = '9999';
