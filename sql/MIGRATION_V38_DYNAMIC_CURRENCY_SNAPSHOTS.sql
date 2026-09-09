-- ══════════════════════════════════════════════════════════
-- MIGRATION_V38_DYNAMIC_CURRENCY_SNAPSHOTS.sql
-- الهدف: صف المطابقة اليومي في ledger.html كان يدعم USD/EUR فقط
-- (عمودان ثابتان treasury_usd/treasury_eur في daily_snapshots).
-- هذا التعديل يضيف عمود خزينة لكل عملة مدعومة حالياً في accounts
-- (نفس القائمة الموجودة في MIGRATION_V8 + FIX_add_gold_silver_currencies)
-- حتى تُحفظ لقطة يومية كاملة لأي عملة تُفعَّل لاحقاً من صفحة العملات،
-- بدل الاقتصار على USD/EUR فقط.
-- ══════════════════════════════════════════════════════════

ALTER TABLE public.daily_snapshots
  ADD COLUMN IF NOT EXISTS treasury_try    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_gbp    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_sar    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_aed    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_egp    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_jod    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_kwd    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_qar    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_mad    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_lyd    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_gold   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_silver numeric DEFAULT 0;

-- ملاحظة: عند إضافة عملة جديدة كليًا لاحقًا (غير هذه القائمة)، يلزم
-- سطر ADD COLUMN مشابه هنا + عمود bal_<code> في accounts (سطر SQL
-- واحد في كل مكان) — js/storage.js وjs/ledger و js/print-brand.js
-- لا تحتاج أي تعديل بعدها لأنها تقرأ الأعمدة ديناميكيًا حسب
-- العملات المفعّلة في جدول currencies.
