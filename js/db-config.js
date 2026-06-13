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
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyZGFzZ2tlZ3Vkdm5vYmp3YWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NjI3NTMsImV4cCI6MjA5NjIzODc1M30.aFTETaS0MrbrL9G7GJ8nXM4-sJO-1l9NpKST-KAvnNU'
};
