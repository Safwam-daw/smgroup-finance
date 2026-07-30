/**
 * accounts.js — SM-Group v5.3
 * دعم إعادة استخدام أرقام الحسابات المحذوفة
 */

const Accounts = (() => {

  async function generateCode(type) {
    // البحث عن أول فجوة في الأرقام (رقم محذوف)
    const accounts = await Storage.getAccounts();

    if (type === 'customer') {
      // الأرقام الموجودة للزبائن (بدون 4xxx و 9xxx و 7xxx)
      const existing = new Set(
        accounts
          .filter(a => !a.id.startsWith('4') && !a.id.startsWith('9') && !a.id.startsWith('7'))
          .map(a => parseInt(a.id))
          .filter(n => !isNaN(n))
      );
      // ابحث عن أول رقم مفقود من 1
      for (let i = 1; i <= 999; i++) {
        if (!existing.has(i)) return String(i).padStart(4, '0');
      }
      return '0999';
    } else if (type === 'profit') {
      const existing = new Set(
        accounts.filter(a => a.id.startsWith('9'))
          .map(a => parseInt(a.id))
          .filter(n => !isNaN(n))
      );
      for (let i = 9999; i >= 9000; i--) {
        if (!existing.has(i)) return String(i);
      }
      return '9000';
    } else {
      const existing = new Set(
        accounts.filter(a => a.id.startsWith('4'))
          .map(a => parseInt(a.id))
          .filter(n => !isNaN(n))
      );
      for (let i = 4000; i <= 4999; i++) {
        if (!existing.has(i)) return String(i);
      }
      return '4999';
    }
  }

  // يتحقق أن الكود اليدوي يطابق نمط الكود المتوقع لهذا النوع
  // (نفس نطاقات الأرقام المستخدمة في generateCode) قبل محاولة الحفظ
  function _validManualCode(type, code) {
    code = String(code || '').trim();
    if (!code) return { ok:false, error:'أدخل كود الحساب' };
    if (type === 'customer') {
      // لا يُسمح بأكواد تتقاطع مع نطاقات محجوزة لأنواع أخرى (شركات 4xxx، أرباح 9xxx، 7xxx)
      if (code.startsWith('4') || code.startsWith('9') || code.startsWith('7')) {
        return { ok:false, error:'هذا النطاق محجوز لنوع حساب آخر' };
      }
    } else if (type === 'company') {
      if (!code.startsWith('4')) return { ok:false, error:'كود حساب الشركات يجب أن يبدأ بـ 4' };
    } else if (type === 'profit') {
      if (!code.startsWith('9')) return { ok:false, error:'كود حساب الأرباح يجب أن يبدأ بـ 9' };
    } else {
      return { ok:false, error:'نوع حساب غير معروف' };
    }
    return { ok:true, code };
  }

  async function create(type, name, code) {
    if (!Auth.requireLogin()) return { ok:false, error:'يجب تسجيل الدخول' };
    if (!Auth.can('accounts')) return { ok:false, error:'ليس لديك صلاحية فتح الحسابات' };
    name = name.trim();
    if (!name) return { ok:false, error:'أدخل اسم الحساب' };

    const check = _validManualCode(type, code);
    if (!check.ok) return check;
    const id = check.code;

    const result = await Storage.saveAccount({ id, name, type });
    if (!result.ok) {
      const errors = {
        duplicate: 'هذا الكود مستخدم بالفعل من قبل حساب آخر',
        duplicate_profit: 'يوجد حساب أرباح بالفعل — لا يمكن إنشاء أكثر من حساب أرباح واحد'
      };
      return { ok:false, error: errors[result.error] || 'خطأ في الحفظ' };
    }

    await Storage.logAction('create_account', { accountId:id, name, type });
    return { ok:true, id };
  }

  async function getAll()          { return Storage.getAccounts(); }
  async function getById(id)       { const all = await Storage.getAccounts(); return all.find(a=>a.id===id)||null; }
  async function search(q, limit=6) {
    const ql = q.toLowerCase().trim();
    if (!ql) return [];
    return (await Storage.getAccounts())
      .filter(a => a.id.includes(ql) || a.name.toLowerCase().includes(ql))
      .slice(0, limit);
  }
  // بحث بالكود فقط — يطابق بداية الكود (بادئة) لتفادي نتائج عشوائية من البحث المدمج القديم
  async function searchByCode(q, limit=6) {
    const ql = String(q||'').toLowerCase().trim();
    if (!ql) return [];
    return (await Storage.getAccounts())
      .filter(a => a.id.toLowerCase().startsWith(ql))
      .slice(0, limit);
  }
  // بحث بالاسم فقط — لا يلمس حقل الكود إطلاقاً
  async function searchByName(q, limit=6) {
    const ql = String(q||'').toLowerCase().trim();
    if (!ql) return [];
    return (await Storage.getAccounts())
      .filter(a => a.name.toLowerCase().includes(ql))
      .slice(0, limit);
  }

  return { generateCode, create, getAll, getById, search, searchByCode, searchByName };
})();
