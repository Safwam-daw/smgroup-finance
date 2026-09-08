/**
 * db-config.js — معلومات الاتصال بقاعدة البيانات (Supabase)
 * ─────────────────────────────────────────────────────────
 * هذا الملف يحتوي على نقطة الاتصال الوحيدة بقاعدة البيانات.
 * عند تغيير قاعدة البيانات (لعميل جديد أو نقل المشروع)،
 * يكفي تعديل القيمتين أدناه فقط — كل الملفات الأخرى
 * (storage.js, currency.js, realtime.js, settings.html)
 * تقرأ من هنا تلقائياً.
 *
 * ⚠️ يجب تحميل هذا الملف قبل أي سكريبت آخر يستخدم قاعدة البيانات
 * (storage.js, currency.js, realtime.js)
 */

const DB_CONFIG = {
  url: 'https://qrdasgkegudvnobjwafc.supabase.co',
  key: 'eyJhbGci0iJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3Mi0iJzdXBhYmFzZSIsInJlziI6InFyZGFzZ2tlZ3Vkdm5vYmp3YWZjIiwicm9sZSI6ImFub24iLCJhcHBfcm9sZSI6InNtZ3JvdXBfYXBwIiwiaWF0IjoxNzg4ODYwMzU4LCJleHAiOjIxMDQyMjAzNTh9.4KWuNTIvzjNgWZkmS-abXs_tMkrDpGm-UlmEq3-W-6o'
};
