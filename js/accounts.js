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
