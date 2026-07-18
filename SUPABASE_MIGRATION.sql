-- ══════════════════════════════════════════════════
-- SM-Group v4 — Migration
-- شغّل هذا في SQL Editor في Supabase
-- ══════════════════════════════════════════════════

-- 1) أضف أعمدة الرصيد لجدول accounts
ALTER TABLE accounts 
  ADD COLUMN IF NOT EXISTS bal_usd numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bal_eur numeric DEFAULT 0;

-- 2) أضف عمود note للعمليات (للتعديل لاحقاً)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS note text DEFAULT '';

-- 3) أعد حساب الأرصدة من العمليات الموجودة
UPDATE accounts a SET
  bal_usd = (
    SELECT COALESCE(SUM(
      CASE 
        WHEN t.type='dep' AND t.acc=a.id AND t.cur='usd' THEN t.amt
        WHEN t.type='wit' AND t.acc=a.id AND t.cur='usd' THEN -t.amt
        WHEN t.type='trf' AND t.from=a.id AND t.cur='usd' THEN -t.amt
        WHEN t.type='trf' AND t.to=a.id AND t.cur='usd' THEN t.amt * COALESCE(t.rate,1)
        ELSE 0
      END
    ),0) FROM transactions t
    WHERE t.acc=a.id OR t.from=a.id OR t.to=a.id
  ),
  bal_eur = (
    SELECT COALESCE(SUM(
      CASE 
        WHEN t.type='dep' AND t.acc=a.id AND t.cur='eur' THEN t.amt
        WHEN t.type='wit' AND t.acc=a.id AND t.cur='eur' THEN -t.amt
        WHEN t.type='trf' AND t.from=a.id AND t.cur='eur' THEN -t.amt
        WHEN t.type='trf' AND t.to=a.id AND t.cur='eur' THEN t.amt * COALESCE(t.rate,1)
        ELSE 0
      END
    ),0) FROM transactions t
    WHERE t.acc=a.id OR t.from=a.id OR t.to=a.id
  );
