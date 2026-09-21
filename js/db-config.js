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

  // مفتاح Supabase الأصلي Public Anon Key
  key: 'sb_publishable_39_RdqjfD4UmntIeMBpwnQ_7r9sQDoW',

  // هوية التطبيق: هيدر نصي بسيط (وليس JWT) تتحقق منه is_app_request()
  // في قاعدة البيانات عبر request.headers — لا علاقة له بتوقيع JWT
  // ولا يتأثر بنظام مفاتيح Supabase (HS256/JWKS)، لذا هذا هو الحل الثابت.
  appRole: 'smgroup_app'
};
