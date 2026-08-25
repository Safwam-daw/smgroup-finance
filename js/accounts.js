/**
 * accounts.js — SM-Group v5.3
 * دعم إعادة استخدام أرقام الحسابات المحذوفة
 */

const Accounts = (() => {

  async function generateCode(type) {
    const prefix = CONFIG.TYPE_PREFIXES[type];
    if (!prefix) return '';

    // حساب واحد ثابت فقط لكل من الأرباح والخزينة — لا تسلسل، معرّف واحد دائماً
    if (type === 'profit')   return CONFIG.PROFIT_ACCOUNT_ID;
    if (type === 'treasury') return CONFIG.TREASURY_ACCOUNT_ID;

    // البحث عن أول فجوة في تسلسل هذا النوع تحديداً (رقم مُحرَّر بعد الحذف)
    const full = prefix + '-';
    const accounts = await Storage.getAccounts();
    const existing = new Set(
      accounts.filter(a => a.type === type)
        .map(a => {
          const s = String(a.id || '');
          return s.startsWith(full) ? parseInt(s.slice(full.length), 10) : NaN;
        })
        .filter(n => !isNaN(n))
    );
    for (let i = 1; i <= 9999; i++) {
      if (!existing.has(i)) return full + String(i).padStart(4, '0');
    }
    return full + '9999';
  }

  // يُزيل أي بادئة نوع معروفة (CU-/CO-/PR-/TN- أو بلا شرطة) من بداية النص
  // إن وُجدت — يسمح للمستخدم بتعديل الكود المقترح جزئياً أو كتابة رقم مجرّد بلا قلق
  function _stripKnownPrefix(code) {
    const upper = code.toUpperCase();
    for (const p of Object.values(CONFIG.TYPE_PREFIXES)) {
      if (upper.startsWith(p + '-')) return code.slice(p.length + 1);
      if (upper.startsWith(p))       return code.slice(p.length);
    }
    return code;
  }

  // يبني الكود النهائي: بادئة النوع الصحيحة + شرطة + الجزء الذي أدخله المستخدم.
  // حسابا الأرباح والخزينة: معرّف ثابت واحد دائماً بغض النظر عمّا كُتب —
  // هذا يمنع أي خطأ يدوي محتمل عند إنشاء أحدهما (كما طلب المستخدم).
  function _validManualCode(type, code) {
    code = String(code || '').trim();
    if (!code) return { ok:false, error:'أدخل كود الحساب' };

    const prefix = CONFIG.TYPE_PREFIXES[type];
    if (!prefix) return { ok:false, error:'نوع حساب غير معروف' };

    if (type === 'profit')   return { ok:true, code: CONFIG.PROFIT_ACCOUNT_ID };
    if (type === 'treasury') return { ok:true, code: CONFIG.TREASURY_ACCOUNT_ID };

    const suffix = _stripKnownPrefix(code).replace(/^-+/, '').trim();
    if (!suffix) return { ok:false, error:'أدخل رقماً أو رمزاً مميزاً بعد رمز نوع الحساب' };

    if (type === 'company' && !/^\d+$/.test(suffix)) {
      // نطاق الشركات يبقى رقمياً بحتاً لثبات الفرز والتوليد التلقائي
      return { ok:false, error:'كود حساب الشركات يجب أن يكون رقماً بعد رمز CO' };
    }

    return { ok:true, code: prefix + '-' + suffix };
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
