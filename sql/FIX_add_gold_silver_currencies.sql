-- ══════════════════════════════════════════════════════════════
-- إضافة عملتين جديدتين: الذهب والفضة
--
-- الذهب والفضة ليسا عملة نقدية بالمعنى التقليدي، لكن النظام
-- يتعامل مع "العملة" كوحدة قيمة عامة (مجرد اسم عمود bal_xxx)،
-- فيعملان بنفس الآلية تماماً بمجرد وجود العمود ودخولهما في جدول
-- currencies — لا حاجة لأي تعديل في atomic_deposit/withdraw/transfer
-- (تبني اسم العمود ديناميكياً من رمز العملة أصلاً).
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS bal_gold numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bal_silver numeric DEFAULT 0;

INSERT INTO public.currencies (code, name, symbol, is_active, is_fixed, sort_order) VALUES
  ('GOLD',   'ذهب',  'ج',  false, false, 13),
  ('SILVER', 'فضة',  'ف',  false, false, 14)
ON CONFLICT (code) DO NOTHING;

-- تحقق
SELECT code, name, is_active FROM public.currencies WHERE code IN ('GOLD','SILVER');
