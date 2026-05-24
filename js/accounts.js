/**
 * accounts.js — SM-Group Account Management (Supabase)
 */

const Accounts = (() => {

  async function generateCode(type) {
    const accounts = await Storage.getAccounts();
    if (type === 'customer') {
      const custs = accounts.filter(a => a.id.startsWith('0'));
      if (!custs.length) return '0001';
      const nums = custs.map(c => parseInt(c.id)).filter(n => !isNaN(n));
      return String(Math.max(...nums) + 1).padStart(4, '0');
    } else {
      const comps = accounts.filter(a => a.id.startsWith('4'));
      if (!comps.length) return '4000';
      const nums = comps.map(c => parseInt(c.id)).filter(n => !isNaN(n));
      return String(Math.max(...nums) + 1);
    }
  }

  async function create(type, name) {
    if (!Auth.requireAdmin()) return { ok: false, error: 'صلاحية الإدارة مطلوبة لفتح الحسابات' };
    name = name.trim();
    if (!name) return { ok: false, error: 'أدخل اسم الحساب' };
    const id = await generateCode(type);
    const ok = await Storage.saveAccount({ id, name, type });
    if (!ok) return { ok: false, error: 'خطأ في حفظ الحساب' };
    return { ok: true, id };
  }

  async function getAll() { return Storage.getAccounts(); }

  async function search(query, limit = 6) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const all = await Storage.getAccounts();
    return all.filter(a => a.id.includes(q) || a.name.toLowerCase().includes(q)).slice(0, limit);
  }

  async function getById(id) {
    const all = await Storage.getAccounts();
    return all.find(a => a.id === id) || null;
  }

  return { generateCode, create, getAll, search, getById };
})();
