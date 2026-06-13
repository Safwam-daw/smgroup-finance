/**
 * config.js — إعدادات الهوية لكل نسخة
 * ─────────────────────────────────────────────
 * هذا الملف يُعدَّل لكل عميل بشكل مستقل
 * كل النسخ الأخرى من الكود تبقى كما هي
 *
 * ملاحظة: اسم الشركة لا يُترجم أبداً — يبقى كما يُكتب هنا
 * بأي لغة كتبته (عربي أو إنجليزي أو غيره) سيظهر كما هو
 * في كل اللغات.
 */

const BRAND = {
  // اسم الشركة المستخدمة للنظام — ثابت، لا يُترجم
  companyName: 'سندس',

  // وصف فرعي يظهر تحت الاسم — يُترجم حسب اللغة
  tagline: {
    ar: 'نظام إدارة الخزينة المزدوجة',
    en: 'Dual Treasury Management System',
    tr: 'Çift Hazine Yönetim Sistemi'
  },

  // معلومات المطوّر — ثابت، لا يُترجم
  developedBy: 'Daw Tech',

  // سنة حقوق النشر
  copyrightYear: '2025'
};

// اسم الشركة — دائماً كما هو، بدون ترجمة
function brandName() {
  return BRAND.companyName;
}

// الوصف الفرعي — يُترجم حسب اللغة الحالية
function brandTagline() {
  const lang = (typeof I18n !== 'undefined') ? I18n.getLang() : 'ar';
  return BRAND.tagline[lang] || BRAND.tagline.ar;
}
