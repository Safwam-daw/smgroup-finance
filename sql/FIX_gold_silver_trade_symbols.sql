-- ══════════════════════════════════════════════════════════
-- FIX_gold_silver_trade_symbols.sql
-- الهدف: عرض رمز البورصة المتعارف للذهب والفضة (XAU/XAG) بدل
-- الرمز النصي العربي (ج/ف) في كل مكان يعرض عمود symbol من جدول
-- currencies (القوائم المنسدلة، رسالة المطابقة، إلخ).
--
-- ⚠️ لا يُغيَّر عمود code (يبقى GOLD/SILVER) لأن باقي النظام
-- (storage.js, ledger.html, account-view.html...) يشتق منه اسم
-- عمود الرصيد فعلياً عبر 'bal_' + code.toLowerCase() → bal_gold/
-- bal_silver. تغيير code سيكسر هذا الربط في كل الملفات دفعة واحدة.
-- ══════════════════════════════════════════════════════════

UPDATE public.currencies SET symbol = 'XAU' WHERE code = 'GOLD';
UPDATE public.currencies SET symbol = 'XAG' WHERE code = 'SILVER';
