-- ══════════════════════════════════════════════════════════════
-- SM-Group Finance — تنظيف شامل قبل التسليم (مُصحَّح بعد V30/V31)
-- ✅ يحتفظ بـ: الموظفين (users) + حساب الأرباح (معرّفه الفعلي الحالي)
-- ✅ يعيد إنشاء: حساب الخزينة (معرّفه الفعلي الحالي)
-- ❌ يحذف: كل المعاملات، الحسابات، العملاء، السجلات، الإشعارات
-- ⚠️  لا تشغّله إلا مرة واحدة عند التسليم الفعلي
--
-- الفرق عن النسخة القديمة: لا يستخدم '9999' الثابت إطلاقاً — يقرأ
-- معرّف حساب الأرباح الفعلي عبر get_profit_account_id() (ديناميكي
-- منذ V22/V30/V31)، ويحدد حساب الخزينة بالنوع type='treasury' بدل
-- معرّف ثابت قديم — يعمل بشكل صحيح بغض النظر عن أي تعديل مستقبلي
-- على مخطط التسمية (CU/CO/PR/TN).
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_profit_id    text := public.get_profit_account_id();
  v_treasury_id  text;
BEGIN
  SELECT id INTO v_treasury_id FROM public.accounts WHERE type = 'treasury' LIMIT 1;

  -- 1) حذف كل المعاملات
  TRUNCATE TABLE public.transactions RESTART IDENTITY CASCADE;

  -- 2) حذف اللقطات اليومية
  TRUNCATE TABLE public.daily_snapshots RESTART IDENTITY CASCADE;

  -- 3) حذف الحسابات المؤرشفة
  TRUNCATE TABLE public.deleted_accounts RESTART IDENTITY CASCADE;

  -- 4) حذف سجل التدقيق
  TRUNCATE TABLE public.audit_log RESTART IDENTITY CASCADE;

  -- 5) حذف الإشعارات
  TRUNCATE TABLE public.notifications RESTART IDENTITY CASCADE;

  -- 6) حذف إعدادات التنبيهات
  TRUNCATE TABLE public.alert_settings RESTART IDENTITY CASCADE;

  -- 7) حذف كل الحسابات ما عدا الأرباح والخزينة (بمعرّفيهما الفعليين)
  DELETE FROM public.accounts
  WHERE id NOT IN (v_profit_id, COALESCE(v_treasury_id, v_profit_id));

  -- 8) تصفير رصيد حساب الأرباح مع الحفاظ عليه
  UPDATE public.accounts SET
    bal_usd = 0, bal_eur = 0, bal_try = 0, bal_gbp = 0,
    bal_sar = 0, bal_aed = 0, bal_egp = 0, bal_jod = 0,
    bal_kwd = 0, bal_qar = 0, bal_mad = 0, bal_lyd = 0
  WHERE id = v_profit_id;

  -- 9) تصفير رصيد حساب الخزينة إن وُجد
  IF v_treasury_id IS NOT NULL THEN
    UPDATE public.accounts SET
      bal_usd = 0, bal_eur = 0, bal_try = 0, bal_gbp = 0,
      bal_sar = 0, bal_aed = 0, bal_egp = 0, bal_jod = 0,
      bal_kwd = 0, bal_qar = 0, bal_mad = 0, bal_lyd = 0
    WHERE id = v_treasury_id;
  END IF;

  -- 10) ضمان وجود حساب الأرباح إذا كان محذوفاً
  INSERT INTO public.accounts (id, name, type,
    bal_usd, bal_eur, bal_try, bal_gbp,
    bal_sar, bal_aed, bal_egp, bal_jod,
    bal_kwd, bal_qar, bal_mad, bal_lyd,
    commission_rate)
  VALUES (v_profit_id, 'حساب الأرباح', 'profit',
    0,0,0,0,0,0,0,0,0,0,0,0, 0)
  ON CONFLICT (id) DO NOTHING;

  -- 11) ضمان وجود حساب الخزينة إذا كان محذوفاً (يُنشأ تلقائياً لاحقاً
  --     من ensureTreasuryAccount أيضاً، لكن نضمنه هنا صراحة)
  IF v_treasury_id IS NULL THEN
    INSERT INTO public.accounts (id, name, type,
      bal_usd, bal_eur, bal_try, bal_gbp,
      bal_sar, bal_aed, bal_egp, bal_jod,
      bal_kwd, bal_qar, bal_mad, bal_lyd,
      commission_rate)
    VALUES ('TN-0001', 'الخزينة', 'treasury',
      0,0,0,0,0,0,0,0,0,0,0,0, 0)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ══ التحقق النهائي ══════════════════════════════════════════
SELECT 'users (الموظفون)'          AS جدول, COUNT(*) AS عدد FROM public.users
UNION ALL
SELECT 'accounts (الحسابات)',       COUNT(*) FROM public.accounts
UNION ALL
SELECT 'transactions (المعاملات)',  COUNT(*) FROM public.transactions
UNION ALL
SELECT 'audit_log (التدقيق)',       COUNT(*) FROM public.audit_log
UNION ALL
SELECT 'notifications (الإشعارات)', COUNT(*) FROM public.notifications
UNION ALL
SELECT 'daily_snapshots (اللقطات)', COUNT(*) FROM public.daily_snapshots;
