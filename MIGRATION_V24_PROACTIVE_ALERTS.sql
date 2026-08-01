-- ══════════════════════════════════════════════════════════
-- SM-Group — Migration V24 — تنبيهات استباقية
--
-- يضيف حقول جديدة لجدول alert_settings الموجود مسبقاً:
--   - treasury_min_usd / treasury_min_eur: حد أدنى لرصيد الخزينة
--     الإجمالي (0 = التنبيه معطّل لهذه العملة)
--   - large_txn_threshold: قيمة العملية التي تُعتبر "كبيرة"
--     وتستحق تنبيهاً فورياً (0 = معطّل)، تُطبَّق بنفس الرقم
--     على أي عملة (بنفس منطق debt_limit الحالي)
--
-- التنبيه بالرصيد السالب لا يحتاج عموداً جديداً — يعتمد على
-- عتبة forceOverdraft الموجودة أصلاً في transactions.js.
-- ══════════════════════════════════════════════════════════

ALTER TABLE public.alert_settings
  ADD COLUMN IF NOT EXISTS treasury_min_usd    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_min_eur    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS large_txn_threshold numeric DEFAULT 0;

UPDATE public.alert_settings
  SET treasury_min_usd = COALESCE(treasury_min_usd, 0),
      treasury_min_eur = COALESCE(treasury_min_eur, 0),
      large_txn_threshold = COALESCE(large_txn_threshold, 0);
