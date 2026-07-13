/**
 * app-constants.js — الثوابت التقنية العامة للنظام
 * ─────────────────────────────────────────────
 * بخلاف config.js (خاص بهوية كل عميل: الاسم، الشعار، إلخ)،
 * هذا الملف يحتوي الثوابت البرمجية المشتركة بين كل النسخ.
 *
 * الهدف: عدم تكرار قيم مثل رقم حساب الأرباح أو أنواع الحسابات
 * داخل عشرات الملفات — أي تعديل مستقبلي يتم من هنا فقط.
 *
 * ملاحظة عن PROFIT_ACCOUNT_ID: هذه القيمة الثابتة تقابل تماماً
 * الدالة public.get_profit_account_id() في MIGRATION_V19.sql —
 * كلاهما يُعيدان '9999' حالياً. عند تفعيل اختيار حساب الأرباح
 * ديناميكياً (المرحلة الثانية)، سيُستبدل هذا الثابت باستدعاء
 * غير متزامن (مثل Settings.getProfitAccountId()) بدل قيمة ثابتة.
 */

const CONFIG = {
  PROFIT_ACCOUNT_ID: '9999',

  ACCOUNT_TYPES: {
    CUSTOMER: 'customer',
    COMPANY:  'company',
    PROFIT:   'profit'
  },

  TRANSACTION_TYPES: {
    DEPOSIT:  'dep',
    WITHDRAW: 'wit',
    TRANSFER: 'trf'
  },

  // نطاقات أكواد الحسابات المحجوزة (تُستخدم في accounts.js عند التحقق من كود يدوي)
  RESERVED_ACCOUNT_CODE_PREFIXES: ['4', '7', '9'],

  SUPPORTED_CURRENCIES: ['usd', 'eur'],

  ROWS_PER_PAGE: 20,

  DATE_FORMAT: 'YYYY-MM-DD',
  TIME_FORMAT: 'HH:mm'
};
