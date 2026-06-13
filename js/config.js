/**
 * config.js — إعدادات الهوية والنصوص لكل نسخة
 * ─────────────────────────────────────────────
 * هذا الملف يُعدَّل لكل عميل بشكل مستقل
 * كل النصوص هنا قابلة للتعديل دون لمس باقي الكود
 *
 * ملاحظة: companyName و developedBy لا يُترجمان أبداً
 * يبقيان كما يُكتبان هنا في كل اللغات
 */

const BRAND = {
  // اسم الشركة المستخدمة للنظام — ثابت، لا يُترجم
  companyName: 'سندس',

  // وصف فرعي يظهر تحت الاسم — يُترجم حسب اللغة
  // يمكن تركه فارغاً '' إذا لا تريد عرض وصف
  tagline: {
    ar: 'نظام إدارة الخزينة',
    en: 'Treasury Management System',
    tr: 'Hazine Yönetim Sistemi'
  },

  // رقم إصدار النظام — يظهر في الإعدادات وصفحة الدخول
  version: 'v1.0',

  // معلومات المطوّر — ثابت، لا يُترجم
  developedBy: 'Daw Tech',

  // سنة حقوق النشر
  copyrightYear: '2025',

  // نص حقوق الطباعة — يظهر في تذييل كل الكشوفات والتقارير المطبوعة
  // يُترجم حسب اللغة
  printCopyright: {
    ar: 'جميع الحقوق محفوظة لشركة Daw Tech',
    en: 'All rights reserved to Daw Tech',
    tr: 'Tüm hakları Daw Tech\'e aittir'
  }
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

// نص حقوق الطباعة — يُترجم حسب اللغة الحالية
function brandPrintCopyright() {
  const lang = (typeof I18n !== 'undefined') ? I18n.getLang() : 'ar';
  return BRAND.printCopyright[lang] || BRAND.printCopyright.ar;
}
