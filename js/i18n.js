/**
 * i18n.js — SM-Group v1.0
 * نظام الترجمة — عربي / إنجليزي / تركي
 */

const I18n = (() => {

  const STORAGE_KEY = 'smg_lang';
  let _lang = localStorage.getItem(STORAGE_KEY) || 'ar';

  // ══ قاموس الترجمات ══════════════════════════════════════
  const _dict = {

    // ── عام ─────────────────────────────────────────────
    app_name:           { ar: 'SM-Group', en: 'SM-Group', tr: 'SM-Group' },
    app_subtitle:       { ar: 'نظام إدارة الخزينة المزدوجة', en: 'Dual Treasury Management System', tr: 'Çift Hazine Yönetim Sistemi' },
    save:               { ar: 'حفظ', en: 'Save', tr: 'Kaydet' },
    cancel:             { ar: 'إلغاء', en: 'Cancel', tr: 'İptal' },
    close:              { ar: 'إغلاق', en: 'Close', tr: 'Kapat' },
    delete:             { ar: 'حذف', en: 'Delete', tr: 'Sil' },
    edit:               { ar: 'تعديل', en: 'Edit', tr: 'Düzenle' },
    add:                { ar: 'إضافة', en: 'Add', tr: 'Ekle' },
    search:             { ar: 'بحث', en: 'Search', tr: 'Ara' },
    loading:            { ar: 'جاري التحميل…', en: 'Loading…', tr: 'Yükleniyor…' },
    confirm:            { ar: 'تأكيد', en: 'Confirm', tr: 'Onayla' },
    yes:                { ar: 'نعم', en: 'Yes', tr: 'Evet' },
    no:                 { ar: 'لا', en: 'No', tr: 'Hayır' },
    back:               { ar: 'رجوع', en: 'Back', tr: 'Geri' },
    print:              { ar: 'طباعة', en: 'Print', tr: 'Yazdır' },
    export:             { ar: 'تصدير', en: 'Export', tr: 'Dışa Aktar' },
    filter:             { ar: 'فلترة', en: 'Filter', tr: 'Filtrele' },
    all:                { ar: 'الكل', en: 'All', tr: 'Hepsi' },
    from:               { ar: 'من', en: 'From', tr: 'Kimden' },
    to:                 { ar: 'إلى', en: 'To', tr: 'Kime' },
    date:               { ar: 'التاريخ', en: 'Date', tr: 'Tarih' },
    notes:              { ar: 'ملاحظات', en: 'Notes', tr: 'Notlar' },
    no_results:         { ar: 'لا توجد نتائج', en: 'No results', tr: 'Sonuç yok' },
    no_data:            { ar: 'لا توجد بيانات', en: 'No data', tr: 'Veri yok' },
    success:            { ar: 'تم بنجاح ✅', en: 'Done ✅', tr: 'Başarılı ✅' },
    error_save:         { ar: 'خطأ في الحفظ', en: 'Save error', tr: 'Kaydetme hatası' },
    error_load:         { ar: 'خطأ في التحميل', en: 'Load error', tr: 'Yükleme hatası' },
    logout:             { ar: 'تسجيل خروج', en: 'Logout', tr: 'Çıkış Yap' },

    // ── تسجيل الدخول ────────────────────────────────────
    login_title:        { ar: 'تسجيل الدخول', en: 'Login', tr: 'Giriş Yap' },
    username:           { ar: 'اسم المستخدم', en: 'Username', tr: 'Kullanıcı Adı' },
    password:           { ar: 'كلمة المرور', en: 'Password', tr: 'Şifre' },
    username_placeholder: { ar: 'أدخل اسم المستخدم', en: 'Enter username', tr: 'Kullanıcı adını girin' },
    login_btn:          { ar: 'دخول للنظام', en: 'Login', tr: 'Sisteme Gir' },
    login_checking:     { ar: 'جاري التحقق…', en: 'Checking…', tr: 'Kontrol ediliyor…' },
    login_error:        { ar: 'بيانات الدخول خاطئة', en: 'Invalid credentials', tr: 'Geçersiz kimlik bilgileri' },
    login_empty:        { ar: 'أدخل اسم المستخدم وكلمة المرور', en: 'Enter username and password', tr: 'Kullanıcı adı ve şifre girin' },
    login_locked:       { ar: 'تم تعليق الدخول. حاول بعد {secs} ثانية.', en: 'Login suspended. Try after {secs} seconds.', tr: 'Giriş askıya alındı. {secs} saniye sonra deneyin.' },
    login_too_many:     { ar: 'محاولات كثيرة. تم تعليق الدخول لمدة دقيقتين.', en: 'Too many attempts. Login suspended for 2 minutes.', tr: 'Çok fazla deneme. Giriş 2 dakika askıya alındı.' },
    login_attempts_left: { ar: '{error} — تبقى {n} محاولة', en: '{error} — {n} attempt(s) left', tr: '{error} — {n} deneme kaldı' },
    db_connecting:      { ar: '⏳ جاري الاتصال بقاعدة البيانات…', en: '⏳ Connecting to database…', tr: '⏳ Veritabanına bağlanıyor…' },
    db_connected:       { ar: '✅ متصل بقاعدة البيانات', en: '✅ Connected to database', tr: '✅ Veritabanına bağlandı' },
    db_error:           { ar: '❌ تعذّر الاتصال — تحقق من الإنترنت', en: '❌ Connection failed — check internet', tr: '❌ Bağlantı başarısız — interneti kontrol edin' },

    // ── الشريط الجانبي ──────────────────────────────────
    nav_dashboard:      { ar: 'لوحة التحكم', en: 'Dashboard', tr: 'Gösterge Paneli' },
    nav_analytics:      { ar: 'الإحصائيات', en: 'Analytics', tr: 'Analitik' },
    nav_accounts:       { ar: 'إدارة الحسابات', en: 'Accounts', tr: 'Hesaplar' },
    nav_deposit:        { ar: 'إيداع نقدي', en: 'Deposit', tr: 'Para Yatırma' },
    nav_withdraw:       { ar: 'سحب نقدي', en: 'Withdrawal', tr: 'Para Çekme' },
    nav_transfer:       { ar: 'تحويل', en: 'Transfer', tr: 'Transfer' },
    nav_ledger:         { ar: 'دفتر اليومية', en: 'Ledger', tr: 'Muhasebe Defteri' },
    nav_statement:      { ar: 'كشف حساب', en: 'Statement', tr: 'Hesap Özeti' },
    nav_history:        { ar: 'السجل التاريخي', en: 'History', tr: 'Geçmiş' },
    nav_reports:        { ar: 'التقارير', en: 'Reports', tr: 'Raporlar' },
    nav_audit:          { ar: 'سجل التدقيق', en: 'Audit Log', tr: 'Denetim Günlüğü' },
    nav_employees:      { ar: 'الموظفون', en: 'Employees', tr: 'Çalışanlar' },
    nav_settings:       { ar: 'الإعدادات', en: 'Settings', tr: 'Ayarlar' },
    nav_client_portal:  { ar: 'بوابة العملاء', en: 'Client Portal', tr: 'Müşteri Portalı' },

    // ── لوحة التحكم ─────────────────────────────────────
    dashboard_title:    { ar: 'لوحة التحكم', en: 'Dashboard', tr: 'Gösterge Paneli' },
    treasury:           { ar: 'الخزينة', en: 'Treasury', tr: 'Hazine' },
    treasury_usd:       { ar: 'خزينة الدولار', en: 'USD Treasury', tr: 'Dolar Hazinesi' },
    treasury_eur:       { ar: 'خزينة اليورو', en: 'EUR Treasury', tr: 'Euro Hazinesi' },
    profit:             { ar: 'الأرباح', en: 'Profit', tr: 'Kâr' },
    today_profit:       { ar: 'أرباح اليوم', en: "Today's Profit", tr: 'Bugünkü Kâr' },
    recent_txns:        { ar: 'آخر العمليات', en: 'Recent Transactions', tr: 'Son İşlemler' },
    publish_all:        { ar: 'نشر للكل', en: 'Publish All', tr: 'Hepsini Yayınla' },

    // ── الحسابات ─────────────────────────────────────────
    account:            { ar: 'الحساب', en: 'Account', tr: 'Hesap' },
    accounts:           { ar: 'الحسابات', en: 'Accounts', tr: 'Hesaplar' },
    account_id:         { ar: 'رقم الحساب', en: 'Account No.', tr: 'Hesap No.' },
    account_name:       { ar: 'اسم الحساب', en: 'Account Name', tr: 'Hesap Adı' },
    account_type:       { ar: 'نوع الحساب', en: 'Account Type', tr: 'Hesap Türü' },
    account_customer:   { ar: 'زبون', en: 'Customer', tr: 'Müşteri' },
    account_company:    { ar: 'شركة', en: 'Company', tr: 'Şirket' },
    account_profit:     { ar: '🏦 أرباح', en: '🏦 Profit', tr: '🏦 Kâr' },
    balance_usd:        { ar: 'رصيد الدولار', en: 'USD Balance', tr: 'Dolar Bakiyesi' },
    balance_eur:        { ar: 'رصيد اليورو', en: 'EUR Balance', tr: 'Euro Bakiyesi' },
    add_account:        { ar: 'إضافة حساب', en: 'Add Account', tr: 'Hesap Ekle' },
    delete_account:     { ar: 'حذف الحساب', en: 'Delete Account', tr: 'Hesabı Sil' },
    confirm_delete_account: { ar: 'تأكيد حذف الحساب', en: 'Confirm Account Deletion', tr: 'Hesap Silmeyi Onayla' },
    commission_rate:    { ar: 'نسبة العمولة', en: 'Commission Rate', tr: 'Komisyon Oranı' },
    overdraft:          { ar: 'السماح بالسحب على المكشوف', en: 'Allow Overdraft', tr: 'Eksi Bakiyeye İzin Ver' },

    // ── العمليات ─────────────────────────────────────────
    deposit:            { ar: 'إيداع', en: 'Deposit', tr: 'Para Yatırma' },
    withdraw:           { ar: 'سحب', en: 'Withdrawal', tr: 'Para Çekme' },
    transfer:           { ar: 'تحويل', en: 'Transfer', tr: 'Transfer' },
    amount:             { ar: 'المبلغ', en: 'Amount', tr: 'Miktar' },
    currency:           { ar: 'العملة', en: 'Currency', tr: 'Para Birimi' },
    rate:               { ar: 'سعر الصرف', en: 'Exchange Rate', tr: 'Döviz Kuru' },
    commission:         { ar: 'العمولة', en: 'Commission', tr: 'Komisyon' },
    net_amount:         { ar: 'الصافي', en: 'Net Amount', tr: 'Net Tutar' },
    before_balance:     { ar: 'الرصيد قبل', en: 'Balance Before', tr: 'Önceki Bakiye' },
    after_balance:      { ar: 'الرصيد بعد', en: 'Balance After', tr: 'Sonraki Bakiye' },
    sender:             { ar: 'المرسل', en: 'Sender', tr: 'Gönderen' },
    receiver:           { ar: 'المستقبل', en: 'Receiver', tr: 'Alıcı' },
    confirm_deposit:    { ar: 'تأكيد الإيداع', en: 'Confirm Deposit', tr: 'Para Yatırmayı Onayla' },
    confirm_withdraw:   { ar: 'تأكيد السحب', en: 'Confirm Withdrawal', tr: 'Para Çekmeyi Onayla' },
    confirm_transfer:   { ar: 'تأكيد التحويل', en: 'Confirm Transfer', tr: 'Transferi Onayla' },
    txn_done:           { ar: 'تمت العملية ✅', en: 'Transaction done ✅', tr: 'İşlem tamamlandı ✅' },
    txn_type:           { ar: 'نوع العملية', en: 'Type', tr: 'Tür' },
    insufficient:       { ar: 'الرصيد غير كافٍ', en: 'Insufficient balance', tr: 'Yetersiz bakiye' },
    cancel_txn:         { ar: 'تأكيد إلغاء العملية', en: 'Confirm Cancel Transaction', tr: 'İşlemi İptal Et' },
    cancel_txn_note:    { ar: 'سيتم إلغاء العملية وعكس تأثيرها على الرصيد.', en: 'The transaction will be cancelled and balance reversed.', tr: 'İşlem iptal edilecek ve bakiye geri alınacak.' },
    txn_saved_note:     { ar: 'تبقى العملية محفوظة في السجلات.', en: 'The transaction remains in records.', tr: 'İşlem kayıtlarda kalır.' },

    // ── الموظفون ─────────────────────────────────────────
    employees:          { ar: 'الموظفون', en: 'Employees', tr: 'Çalışanlar' },
    employee:           { ar: 'موظف', en: 'Employee', tr: 'Çalışan' },
    add_employee:       { ar: 'إضافة موظف', en: 'Add Employee', tr: 'Çalışan Ekle' },
    delete_employee:    { ar: 'حذف موظف', en: 'Delete Employee', tr: 'Çalışanı Sil' },
    role:               { ar: 'الدور', en: 'Role', tr: 'Rol' },
    role_admin:         { ar: 'مدير', en: 'Admin', tr: 'Yönetici' },
    role_employee:      { ar: 'موظف', en: 'Employee', tr: 'Çalışan' },
    permissions:        { ar: 'الصلاحيات', en: 'Permissions', tr: 'İzinler' },
    change_password:    { ar: 'تغيير كلمة المرور', en: 'Change Password', tr: 'Şifre Değiştir' },
    new_password:       { ar: 'كلمة المرور الجديدة', en: 'New Password', tr: 'Yeni Şifre' },
    confirm_password:   { ar: 'تأكيد كلمة المرور', en: 'Confirm Password', tr: 'Şifreyi Onayla' },
    passwords_mismatch: { ar: 'كلمتا المرور غير متطابقتين', en: 'Passwords do not match', tr: 'Şifreler eşleşmiyor' },

    // ── الإعدادات ────────────────────────────────────────
    settings:           { ar: 'الإعدادات', en: 'Settings', tr: 'Ayarlar' },
    language:           { ar: 'اللغة', en: 'Language', tr: 'Dil' },
    lang_ar:            { ar: 'العربية', en: 'Arabic', tr: 'Arapça' },
    lang_en:            { ar: 'الإنجليزية', en: 'English', tr: 'İngilizce' },
    lang_tr:            { ar: 'التركية', en: 'Turkish', tr: 'Türkçe' },
    theme:              { ar: 'المظهر', en: 'Theme', tr: 'Tema' },
    theme_dark:         { ar: '🌙 مظهر داكن', en: '🌙 Dark Mode', tr: '🌙 Karanlık Mod' },
    theme_light:        { ar: '☀️ مظهر فاتح', en: '☀️ Light Mode', tr: '☀️ Açık Mod' },
    backup:             { ar: 'نسخ احتياطي', en: 'Backup', tr: 'Yedekleme' },
    export_backup:      { ar: 'تصدير نسخة احتياطية', en: 'Export Backup', tr: 'Yedek Dışa Aktar' },
    currencies_active:  { ar: 'العملات المفعّلة', en: 'Active Currencies', tr: 'Aktif Para Birimleri' },
    personal_settings:  { ar: 'الإعدادات الشخصية', en: 'Personal Settings', tr: 'Kişisel Ayarlar' },
    current_password:   { ar: 'كلمة المرور الحالية', en: 'Current Password', tr: 'Mevcut Şifre' },

    // ── سجل التدقيق ──────────────────────────────────────
    audit_log:          { ar: 'سجل التدقيق', en: 'Audit Log', tr: 'Denetim Günlüğü' },
    action:             { ar: 'الإجراء', en: 'Action', tr: 'Eylem' },
    performed_by:       { ar: 'بواسطة', en: 'By', tr: 'Tarafından' },
    page:               { ar: 'الصفحة', en: 'Page', tr: 'Sayfa' },
    details:            { ar: 'التفاصيل', en: 'Details', tr: 'Ayrıntılar' },
    action_deposit:     { ar: 'إيداع', en: 'Deposit', tr: 'Para Yatırma' },
    action_withdraw:    { ar: 'سحب', en: 'Withdrawal', tr: 'Para Çekme' },
    action_transfer:    { ar: 'تحويل', en: 'Transfer', tr: 'Transfer' },
    action_delete:      { ar: 'حذف عملية', en: 'Delete Transaction', tr: 'İşlem Sil' },
    action_login:       { ar: 'دخول', en: 'Login', tr: 'Giriş' },
    action_logout:      { ar: 'خروج', en: 'Logout', tr: 'Çıkış' },
    action_create_acc:  { ar: 'إنشاء حساب', en: 'Create Account', tr: 'Hesap Oluştur' },
    action_delete_acc:  { ar: 'حذف حساب', en: 'Delete Account', tr: 'Hesap Sil' },
    action_add_emp:     { ar: 'إضافة موظف', en: 'Add Employee', tr: 'Çalışan Ekle' },
    action_del_emp:     { ar: 'حذف موظف', en: 'Delete Employee', tr: 'Çalışan Sil' },
    action_change_perm: { ar: 'تغيير صلاحيات', en: 'Change Permissions', tr: 'İzinleri Değiştir' },
    action_change_pass: { ar: 'تغيير كلمة مرور', en: 'Change Password', tr: 'Şifre Değiştir' },
    action_toggle_cur:  { ar: 'تغيير حالة عملة', en: 'Toggle Currency', tr: 'Para Birimi Durumu' },

    // ── التقارير ─────────────────────────────────────────
    reports:            { ar: 'التقارير', en: 'Reports', tr: 'Raporlar' },
    daily_report:       { ar: 'تقرير يومي', en: 'Daily Report', tr: 'Günlük Rapor' },
    monthly_report:     { ar: 'تقرير شهري', en: 'Monthly Report', tr: 'Aylık Rapor' },
    profit_report:      { ar: 'تقرير الأرباح', en: 'Profit Report', tr: 'Kâr Raporu' },
    activity_report:    { ar: 'تقرير النشاط', en: 'Activity Report', tr: 'Aktivite Raporu' },

    // ── بوابة العملاء ────────────────────────────────────
    client_portal:      { ar: 'بوابة العملاء', en: 'Client Portal', tr: 'Müşteri Portalı' },
    account_number:     { ar: 'رقم الحساب', en: 'Account Number', tr: 'Hesap Numarası' },
    pin_code:           { ar: 'كلمة المرور', en: 'Password', tr: 'Şifre' },
    client_login_btn:   { ar: 'دخول', en: 'Enter', tr: 'Giriş' },
    client_statement:   { ar: 'كشف الحساب', en: 'Account Statement', tr: 'Hesap Özeti' },
    contact_admin:      { ar: 'للحصول على كلمة المرور تواصل مع الإدارة', en: 'Contact admin to get your password', tr: 'Şifreniz için yöneticiyle iletişime geçin' },
    regenerate_pin:     { ar: 'إعادة توليد كلمة المرور', en: 'Regenerate PIN', tr: 'Şifreyi Yenile' },
    publish_client:     { ar: 'نشر للعميل', en: 'Publish to Client', tr: 'Müşteriye Yayınla' },
    last_published:     { ar: 'آخر نشر', en: 'Last Published', tr: 'Son Yayın' },

    // ── الإشعارات ────────────────────────────────────────
    notifications:      { ar: 'الإشعارات', en: 'Notifications', tr: 'Bildirimler' },
    no_notifications:   { ar: 'لا توجد إشعارات', en: 'No notifications', tr: 'Bildirim yok' },
    mark_read:          { ar: 'تعليم كمقروء', en: 'Mark as read', tr: 'Okundu olarak işaretle' },

    // ── الخزينة ──────────────────────────────────────────
    treasury_title:     { ar: 'الخزينة الكلية', en: 'Total Treasury', tr: 'Toplam Hazine' },
    debit:              { ar: 'مدين', en: 'Debit', tr: 'Borç' },
    credit:             { ar: 'دائن', en: 'Credit', tr: 'Alacak' },
    balance:            { ar: 'الرصيد', en: 'Balance', tr: 'Bakiye' },
    movements:          { ar: 'الحركات', en: 'Movements', tr: 'Hareketler' },
    archived:           { ar: 'مؤرشف', en: 'Archived', tr: 'Arşivlendi' },
  };

  // ══ دوال الترجمة ════════════════════════════════════════

  function setLang(lang) {
    if (!['ar', 'en', 'tr'].includes(lang)) return;
    _lang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    // تحديث اتجاه الصفحة
    document.documentElement.lang = lang === 'ar' ? 'ar' : lang === 'tr' ? 'tr' : 'en';
    document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr';
    // تطبيق الترجمة على كل عناصر data-i18n
    applyAll();
  }

  function getLang() { return _lang; }

  // t('key') أو t('key', { var: value })
  function t(key, vars = {}) {
    const entry = _dict[key];
    if (!entry) return key; // إذا المفتاح غير موجود نعيده كما هو
    let text = entry[_lang] || entry['ar'] || key;
    // استبدال المتغيرات {varName}
    Object.keys(vars).forEach(k => {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
    });
    return text;
  }

  // تطبيق الترجمة على كل عناصر الصفحة التي تحمل data-i18n
  function applyAll() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key  = el.getAttribute('data-i18n');
      const attr = el.getAttribute('data-i18n-attr'); // لتعيين attribute بدلاً من textContent
      const translated = t(key);
      if (attr) {
        el.setAttribute(attr, translated);
      } else {
        el.textContent = translated;
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
  }

  // تطبيق اللغة عند التحميل
  function init() {
    document.documentElement.lang = _lang === 'ar' ? 'ar' : _lang === 'tr' ? 'tr' : 'en';
    document.documentElement.dir  = _lang === 'ar' ? 'rtl' : 'ltr';
    // نطبق بعد تحميل DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyAll);
    } else {
      applyAll();
    }
  }

  return { t, setLang, getLang, applyAll, init };
})();

// اختصار عالمي
const t = (key, vars) => I18n.t(key, vars);

// تطبيق فوري عند تحميل الملف
I18n.init();
