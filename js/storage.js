/**
 * storage.js — SM-Group v4 Data Layer (Supabase)
 * الأرصدة محفوظة مباشرة في جدول accounts — لا حسابات من الصفر
 */

const SUPABASE_URL = 'https://jmmikuprhitwundsuplt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ECr_Pt2w19dBj_XPz5CYbQ_Qvj4gAQ-';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const Storage = (() => {

  // ── Accounts ──────────────────────────────────────────
  async function getAccounts() {
    const { data, error } = await _supabase.from('accounts').select('*').order('id');
    if (error) { console.error('getAccounts:', error); return []; }
    return data || [];
  }

  async function saveAccount(account) {
    const { error } = await _supabase.from('accounts').upsert({
      id: account.id, name: account.name, type: account.type,
      bal_usd: 0, bal_eur: 0
    });
    return !error;
  }

  // تحديث رصيد الحساب مباشرة (سريع — بدل إعادة الحساب)
  async function updateBalance(accountId, currency, delta) {
    const col = currency === 'usd' ? 'bal_usd' : 'bal_eur';
    const { data: acc } = await _supabase.from('accounts').select(col).eq('id', accountId).single();
    if (!acc) return false;
    const newBal = parseFloat(acc[col] || 0) + delta;
    const { error } = await _supabase.from('accounts').update({ [col]: newBal }).eq('id', accountId);
    return !error;
  }

  async function getBalance(accountId, currency) {
    const col = currency === 'usd' ? 'bal_usd' : 'bal_eur';
    const { data, error } = await _supabase.from('accounts').select(col).eq('id', accountId).single();
    if (error || !data) return 0;
    return parseFloat(data[col] || 0);
  }

  // ── Transactions ──────────────────────────────────────
  async function getTxns(filters = {}) {
    let q = _supabase.from('transactions').select('*').order('date', { ascending: false });
    if (filters.type)      q = q.eq('type', filters.type);
    if (filters.cur)       q = q.eq('cur', filters.cur);
    if (filters.acc)       q = q.or(`acc.eq.${filters.acc},from.eq.${filters.acc},to.eq.${filters.acc}`);
    if (filters.from_date) q = q.gte('date', filters.from_date);
    if (filters.to_date)   q = q.lte('date', filters.to_date);
    if (filters.limit)     q = q.limit(filters.limit);
    const { data, error } = await q;
    if (error) { console.error('getTxns:', error); return []; }
    return data || [];
  }

  async function saveTxn(txn) {
    const { error } = await _supabase.from('transactions').insert(txn);
    return !error;
  }

  async function updateTxn(id, changes) {
    const { error } = await _supabase.from('transactions').update(changes).eq('id', id);
    return !error;
  }

  async function deleteTxn(id) {
    const { error } = await _supabase.from('transactions').delete().eq('id', id);
    return !error;
  }

  async function getTxnById(id) {
    const { data, error } = await _supabase.from('transactions').select('*').eq('id', id).single();
    if (error) return null;
    return data;
  }

  // ── Treasury totals (from accounts table — fast!) ──────
  async function getTreasuryTotals() {
    const { data, error } = await _supabase.from('accounts').select('bal_usd,bal_eur');
    if (error || !data) return { usd: 0, eur: 0 };
    // Treasury = sum of all positive balances (نظرة من جانب الخزينة)
    // بديل: نحسب من transactions فقط dep/wit بدون transfer
    const txns = await getTxns();
    let usd = 0, eur = 0;
    txns.forEach(t => {
      if (t.type === 'dep') { if (t.cur==='usd') usd+=parseFloat(t.amt); else eur+=parseFloat(t.amt); }
      if (t.type === 'wit') { if (t.cur==='usd') usd-=parseFloat(t.amt); else eur-=parseFloat(t.amt); }
    });
    return { usd, eur };
  }

  // ── Users ──────────────────────────────────────────────
  async function getUsers() {
    const { data, error } = await _supabase.from('users').select('*');
    if (error) return [];
    return data || [];
  }

  async function saveUser(user) {
    const { error } = await _supabase.from('users').insert({
      username: user.user, pass: user.pass, role: user.role
    });
    return !error;
  }

  async function deleteUser(id) {
    const { error } = await _supabase.from('users').delete().eq('id', id);
    return !error;
  }

  async function findUser(username, passBase64) {
    const { data, error } = await _supabase.from('users')
      .select('*').eq('username', username).eq('pass', passBase64).single();
    if (error || !data) return null;
    return { user: data.username, role: data.role, id: data.id };
  }

  // ── Backup ─────────────────────────────────────────────
  async function exportBackup() {
    const [accounts, txns, users] = await Promise.all([getAccounts(), getTxns(), getUsers()]);
    const blob = new Blob([JSON.stringify({ accounts, txns, users,
      exportedAt: new Date().toISOString(), version: '4.0' }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'SMGroup_Backup_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
  }

  return {
    getAccounts, saveAccount, updateBalance, getBalance,
    getTxns, saveTxn, updateTxn, deleteTxn, getTxnById,
    getTreasuryTotals, getUsers, saveUser, deleteUser, findUser, exportBackup
  };
})();
