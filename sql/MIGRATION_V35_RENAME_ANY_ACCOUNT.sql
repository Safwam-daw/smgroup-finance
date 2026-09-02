-- ══════════════════════════════════════════════════════════════
-- SM-Group — Migration V35 — تعميم تعديل كود الحساب لكل الأنواع
--
-- V34 قصرت تعديل الكود على حساب الأرباح/الخزينة فقط. بطلب صريح
-- الآن: الزبائن والشركات يحتاجون هذا أيضاً (تنظيم داخلي عند الشركة،
-- أو رغبة الزبون بكود مختلف). هذا الملف يستبدل
-- atomic_rename_structural_account بنسخة تتحقق من البادئة الصحيحة
-- حسب نوع كل حساب (CU-/CO-/PR-/TN-)، وتفرض نفس قاعدة الشركات
-- (كود رقمي بحت بعد CO-) المطبَّقة أصلاً عند الإنشاء اليدوي
-- (accounts.js: _validManualCode) — لضمان اتساق الفرز والتوليد
-- التلقائي اللاحق لأكواد الشركات.
--
-- ⚠️ ملاحظة تشغيلية يجب معرفتها: أي كشف/إيصال طُبع أو أُرسل للزبون
-- سابقاً يحمل الكود القديم — تغيير الكود لا "يُحدِّث" تلك الأوراق
-- تلقائياً بالطبع. هذا قرار عمل تنظيمي عندك، لا قيداً تقنياً.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.atomic_rename_structural_account(
  p_old_id text,
  p_new_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, extensions
AS $rename_account_fn$
DECLARE
  a public.accounts%ROWTYPE;
  required_prefix text;
  new_suffix text;
BEGIN
  SELECT * INTO a FROM public.accounts WHERE id = p_old_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  required_prefix := CASE a.type
    WHEN 'customer' THEN 'CU-'
    WHEN 'company'  THEN 'CO-'
    WHEN 'profit'   THEN 'PR-'
    WHEN 'treasury' THEN 'TN-'
    ELSE NULL
  END;
  IF required_prefix IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unsupported_type');
  END IF;

  IF p_new_id IS NULL OR NOT (p_new_id LIKE required_prefix || '%') OR length(p_new_id) <= length(required_prefix) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_prefix', 'required_prefix', required_prefix);
  END IF;

  new_suffix := substring(p_new_id from length(required_prefix) + 1);
  IF a.type = 'company' AND new_suffix !~ '^[0-9]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company_code_must_be_numeric');
  END IF;

  IF p_new_id = p_old_id THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true);
  END IF;

  IF EXISTS (SELECT 1 FROM public.accounts WHERE id = p_new_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'id_taken');
  END IF;

  UPDATE public.accounts SET id = p_new_id WHERE id = p_old_id;
  UPDATE public.transactions SET acc     = p_new_id WHERE acc     = p_old_id;
  UPDATE public.transactions SET "from"  = p_new_id WHERE "from"  = p_old_id;
  UPDATE public.transactions SET "to"    = p_new_id WHERE "to"    = p_old_id;
  UPDATE public.deleted_accounts SET id  = p_new_id WHERE id      = p_old_id;

  RETURN jsonb_build_object('ok', true, 'new_id', p_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$rename_account_fn$;

GRANT EXECUTE ON FUNCTION public.atomic_rename_structural_account TO anon, authenticated;
