-- ══════════════════════════════════════════════════════════
-- SM-Group — Migration V23 — استعادة نسخة احتياطية آمنة
--
-- المشكلة المُصلحة:
--   doImport() في settings.html كانت تمسح كل البيانات
--   (transactions/accounts/deleted_accounts/audit_log) ولا
--   تُعيد إدراج أي شيء من ملف النسخة الاحتياطية — أي أن زر
--   "استعادة الآن" كان في الواقع "مسح كامل بلا استعادة".
--
-- ما يوفره هذا الملف:
--   1) admin_restore_backup(): RPC واحدة تتحقق من admin فعليًا
--      (وليس فقط إخفاء زر في الواجهة)، وتنفّذ الحذف + الإعادة
--      داخل نفس الدالة (ذرية طبيعية — فشل أي خطوة يُرجع كل شيء).
--   2) لقطة أمان تلقائية (backup_snapshots) قبل أي حذف.
--   3) audit_log لم يعد يُمسح أبداً أثناء الاستعادة (كان يُمسح
--      سابقاً — يخالف مبدأ "Preserve auditability").
-- ══════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ══ 1. جدول لقطات الأمان قبل كل استعادة ═══════════════════
CREATE TABLE IF NOT EXISTS public.backup_snapshots (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz DEFAULT now(),
  created_by  text,
  reason      text,
  payload     jsonb
);

ALTER TABLE public.backup_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_only_backup_snapshots" ON public.backup_snapshots;
CREATE POLICY "app_only_backup_snapshots" ON public.backup_snapshots
  FOR ALL USING (is_app_request()) WITH CHECK (is_app_request());

-- ══ 2. admin_restore_backup ════════════════════════════════
DROP FUNCTION IF EXISTS public.admin_restore_backup(text, text, jsonb);

CREATE FUNCTION public.admin_restore_backup(
  p_caller_username text,
  p_caller_password text,
  p_payload         jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_snapshot       jsonb;
  v_accounts_count int;
  v_txns_count     int;
  v_seq            text;
BEGIN
  -- تحقق حقيقي من admin (نفس آلية V17)، وليس فقط إخفاء زر في الواجهة
  IF NOT public._is_caller_admin(p_caller_username, p_caller_password) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_payload IS NULL OR p_payload->'accounts' IS NULL OR p_payload->'txns' IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  -- ── 1) لقطة أمان تلقائية قبل أي حذف ─────────────────────
  v_snapshot := jsonb_build_object(
    'accounts',        (SELECT coalesce(jsonb_agg(a), '[]'::jsonb) FROM public.accounts a),
    'txns',             (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM public.transactions t),
    'deleted_accounts', (SELECT coalesce(jsonb_agg(d), '[]'::jsonb) FROM public.deleted_accounts d),
    'notifications',    (SELECT coalesce(jsonb_agg(n), '[]'::jsonb) FROM public.notifications n),
    'alert_settings',   (SELECT coalesce(jsonb_agg(s), '[]'::jsonb) FROM public.alert_settings s),
    'currencies',       (SELECT coalesce(jsonb_agg(c), '[]'::jsonb) FROM public.currencies c)
  );

  INSERT INTO public.backup_snapshots (created_by, reason, payload)
  VALUES (p_caller_username, 'pre_restore_auto', v_snapshot);

  -- ── 2) مسح البيانات الحالية (audit_log لا يُمس إطلاقاً) ──
  DELETE FROM public.transactions;
  DELETE FROM public.deleted_accounts;
  DELETE FROM public.notifications;
  DELETE FROM public.accounts;

  -- ── 3) إعادة إدراج بيانات النسخة الاحتياطية ─────────────
  INSERT INTO public.accounts
    SELECT * FROM jsonb_populate_recordset(null::public.accounts, p_payload->'accounts');

  INSERT INTO public.transactions
    SELECT * FROM jsonb_populate_recordset(null::public.transactions, p_payload->'txns');

  IF p_payload ? 'deleted_accounts' THEN
    INSERT INTO public.deleted_accounts
      SELECT * FROM jsonb_populate_recordset(null::public.deleted_accounts, p_payload->'deleted_accounts');
  END IF;

  IF p_payload ? 'notifications' THEN
    INSERT INTO public.notifications
      SELECT * FROM jsonb_populate_recordset(null::public.notifications, p_payload->'notifications');
  END IF;

  IF p_payload ? 'alert_settings' THEN
    DELETE FROM public.alert_settings;
    INSERT INTO public.alert_settings
      SELECT * FROM jsonb_populate_recordset(null::public.alert_settings, p_payload->'alert_settings');
  END IF;

  IF p_payload ? 'currencies' THEN
    DELETE FROM public.currencies;
    INSERT INTO public.currencies
      SELECT * FROM jsonb_populate_recordset(null::public.currencies, p_payload->'currencies');
  END IF;

  -- ── 4) ضمان وجود حساب أرباح واحد على الأقل ──────────────
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE type = 'profit') THEN
    INSERT INTO public.accounts (id, name, type, bal_usd, bal_eur, commission_rate)
    VALUES (public.get_profit_account_id(), 'حساب الأرباح', 'profit', 0, 0, 0);
  END IF;

  -- ── 5) إعادة ضبط sequences (لأن IDs المستوردة صريحة) ────
  v_seq := pg_get_serial_sequence('public.transactions', 'id');
  IF v_seq IS NOT NULL THEN
    PERFORM setval(v_seq, COALESCE((SELECT MAX(id) FROM public.transactions), 1));
  END IF;

  v_seq := pg_get_serial_sequence('public.notifications', 'id');
  IF v_seq IS NOT NULL THEN
    PERFORM setval(v_seq, COALESCE((SELECT MAX(id) FROM public.notifications), 1));
  END IF;

  SELECT count(*) INTO v_accounts_count FROM public.accounts;
  SELECT count(*) INTO v_txns_count     FROM public.transactions;

  INSERT INTO public.audit_log (action, page, username, details)
  VALUES ('restore_backup', 'settings.html', p_caller_username,
          'استعادة نسخة احتياطية — ' || v_accounts_count || ' حساب، ' || v_txns_count || ' عملية');

  RETURN jsonb_build_object('ok', true, 'accounts', v_accounts_count, 'txns', v_txns_count);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_restore_backup FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_restore_backup TO anon, authenticated;
