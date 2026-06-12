/**
 * config.js — إعدادات الهوية لكل نسخة
 * ─────────────────────────────────────────────
 * هذا الملف يُعدَّل لكل عميل بشكل مستقل
 * كل النسخ الأخرى من الكود تبقى كما هي
 */

const BRAND = {
  // اسم الشركة المستخدمة للنظام (يظهر للموظفين والعملاء)
  companyName: {
    ar: 'سندس',
    en: 'Sundus',
    tr: 'Sundus'
  },

  // وصف فرعي يظهر تحت الاسم
  tagline: {
    ar: 'نظام إدارة الخزينة المزدوجة',
    en: 'Dual Treasury Management System',
    tr: 'Çift Hazine Yönetim Sistemi'
  },

  // معلومات المطوّر — تظهر في تذييل الصفحات (footer) كحقوق ملكية
  developedBy: 'Daw Tech',

  // سنة حقوق النشر
  copyrightYear: '2025'
};

// دالة مساعدة — الحصول على اسم الشركة باللغة الحالية
function brandName() {
  const lang = (typeof I18n !== 'undefined') ? I18n.getLang() : 'ar';
  return BRAND.companyName[lang] || BRAND.companyName.ar;
}

function brandTagline() {
  const lang = (typeof I18n !== 'undefined') ? I18n.getLang() : 'ar';
  return BRAND.tagline[lang] || BRAND.tagline.ar;
}
