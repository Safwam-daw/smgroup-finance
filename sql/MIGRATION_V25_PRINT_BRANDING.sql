-- ══════════════════════════════════════════════════════════
-- SM-Group — Migration V25 — أصول الطباعة (شعار / ختم / توقيع)
--
-- جدول بصف واحد فقط (نفس نمط alert_settings) يخزّن صور
-- الشعار والختم والتوقيع كـ base64 (Data URL) مباشرة —
-- لا حاجة لإعداد Supabase Storage bucket منفصل.
--
-- القيود: أقصى حجم لكل صورة تُفرض من الواجهة (500KB) وليس
-- من القاعدة، لتفادي رفض الحفظ الصامت لو غيّرنا الحد لاحقاً.
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.print_assets (
  id            bigserial PRIMARY KEY,
  logo_data     text,   -- Data URL للشعار (اختياري، شفاف أو عادي)
  stamp_data    text,   -- Data URL للختم (يُفضَّل PNG شفاف)
  signature_data text,  -- Data URL للتوقيع (يُفضَّل PNG شفاف)
  updated_by    text,
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.print_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_only_print_assets" ON public.print_assets;
CREATE POLICY "app_only_print_assets" ON public.print_assets
  FOR ALL USING (is_app_request()) WITH CHECK (is_app_request());
