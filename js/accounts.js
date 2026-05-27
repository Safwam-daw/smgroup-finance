/**
 * accounts.js — SM-Group v5.3
 * دعم إعادة استخدام أرقام الحسابات المحذوفة
 */

const Accounts = (() => {

  async function generateCode(type) {
    // أولاً: هل يوجد رقم محذوف قابل لإعادة الاستخدام؟
    const recycled = await Storage.getRecyclableId(type);
    if (recycled) return recycled;

    // ثانياً: أنشئ رقماً جديداً
    const accounts = await Storage.getAccounts();
    if (type === 'customer') {
      const custs = accounts.filter(a => !a.id.startsWith('4') && !a.id.startsWith('9'));
      if (!custs.length) return '0001';
      const nums  = custs.map(c => parseInt(c.id)).filter(n => !isNaN(n));
      return String(Math.max(...nums) + 1).padStart(4, '0');
    } else {
      const comps = accounts.filter(a => a.id.startsWith('4'));
      if (!comps.length) return '4000';
      const nums  = comps.map(c => parseInt(c.id)).filter(n => !isNaN(n));
      return String(Math.max(...nums) + 1);
    }
  }

  async function create(type, name) {
    if (!Auth.requireLogin()) return { ok:false, error:'يجب تسجيل الدخول' };
    if (!Auth.can('accounts')) return { ok:false, error:'ليس لديك صلاحية فتح الحسابات' };
    name = name.trim();
    if (!name) return { ok:false, error:'أدخل اسم الحساب' };

    const id = await generateCode(type);
    const ok = await Storage.saveAccount({ id, name, type });
    if (!ok) return { ok:false, error:'خطأ في الحفظ' };

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

  return { generateCode, create, getAll, getById, search };
})();
