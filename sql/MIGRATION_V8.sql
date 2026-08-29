-- SM-Group — Migration V8 (العملات المتعددة)

-- جدول العملات المتاحة
CREATE TABLE IF NOT EXISTS currencies (
  code      text PRIMARY KEY,         -- USD, EUR, TRY, EGP...
  name      text NOT NULL,            -- دولار أمريكي
  symbol    text NOT NULL,            -- $
  is_active boolean DEFAULT false,
  is_fixed  boolean DEFAULT false,    -- true = لا يمكن تعطيله (USD, EUR)
  sort_order integer DEFAULT 10
);

ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON currencies;
CREATE POLICY "allow all" ON currencies FOR ALL USING (true) WITH CHECK (true);

-- إدراج العملات الافتراضية
INSERT INTO currencies (code, name, symbol, is_active, is_fixed, sort_order) VALUES
  ('USD', 'دولار أمريكي',    '$',  true,  true,  1),
  ('EUR', 'يورو',            '€',  true,  true,  2),
  ('TRY', 'ليرة تركية',     '₺',  false, false, 3),
  ('GBP', 'جنيه إسترليني',  '£',  false, false, 4),
  ('SAR', 'ريال سعودي',     '﷼',  false, false, 5),
  ('AED', 'درهم إماراتي',   'د.إ', false, false, 6),
  ('EGP', 'جنيه مصري',      'ج.م', false, false, 7),
  ('JOD', 'دينار أردني',    'د.أ', false, false, 8),
  ('KWD', 'دينار كويتي',    'د.ك', false, false, 9),
  ('QAR', 'ريال قطري',      'ر.ق', false, false, 10),
  ('MAD', 'درهم مغربي',     'د.م', false, false, 11),
  ('LYD', 'دينار ليبي',     'ل.د', false, false, 12)
ON CONFLICT (code) DO NOTHING;

-- إضافة أعمدة الأرصدة للعملات الجديدة في accounts
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS bal_try numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bal_gbp numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bal_sar numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bal_aed numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bal_egp numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bal_jod numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bal_kwd numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bal_qar numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bal_mad numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bal_lyd numeric DEFAULT 0;
