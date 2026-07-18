-- SM-Group — Migration V4 (تصحيح العمولة)
-- شغّل في SQL Editor في Supabase

-- تغيير عمود العمولة ليكون بالنسبة المئوية مباشرة (0.025 بدل 0.00025)
-- القيمة الافتراضية = 0.025%
ALTER TABLE accounts
  ALTER COLUMN commission_rate SET DEFAULT 0.025;

-- تحديث القيم الموجودة من الصيغة القديمة للجديدة
-- (إذا كانت قيم صغيرة جداً تعني أنها بالصيغة القديمة)
UPDATE accounts
  SET commission_rate = commission_rate * 100
  WHERE commission_rate < 0.01 AND commission_rate > 0
    AND type = 'customer';

-- التأكد من أن الشركات وحساب الأرباح = 0
UPDATE accounts SET commission_rate = 0
  WHERE type IN ('company', 'profit');
