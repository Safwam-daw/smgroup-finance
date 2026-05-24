/**
 * storage.js — SM-Group Data Layer (Supabase)
 * كل العمليات تمر عبر Supabase — مشتركة بين جميع الأجهزة
 */

const SUPABASE_URL = 'https://jmmikuprhitwundsuplt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ECr_Pt2w19dBj_XPz5CYbQ_Qvj4gAQ-';

// تهيئة Supabase client
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const Storage = (() => {

  // ── Accounts ─────────────────────────────────────────────
  async function getAccounts() {
    const { data, error } = await _supabase.from('accounts').select('*').order('id');
    if (error) { console.error('getAccounts:', error); return []; }
    return data || [];
  }

  async function saveAccount(account) {
    const { error } = await _supabase.from('accounts').upsert({
      id: account.id,
      name: account.name,
      type: account.type
    });
    if (error) { console.error('saveAccount:', error); return false; }
    return true;
  }

  // ── Transactions ─────────────────────────────────────────
  async function getTxns(filters = {}) {
    let query = _supabase.from('transactions').select('*').order('date', { ascending: false });
    if (filters.type)     query = query.eq('type', filters.type);
    if (filters.cur)      query = query.eq('cur', filters.cur);
    if (filters.from_date) query = query.gte('date', filters.from_date);
    if (filters.to_date)  query = query.lte('date', filters.to_date);
    const { data, error } = await query;
    if (error) { console.error('getTxns:', error); return []; }
    return data || [];
  }

  async function saveTxn(txn) {
    const { error } = await _supabase.from('transactions').insert(txn);
    if (error) { console.error('saveTxn:', error); return false; }
    return true;
  }

  // ── Users ────────────────────────────────────────────────
  async function getUsers() {
    const { data, error } = await _supabase.from('users').select('*');
    if (error) { console.error('getUsers:', error); return []; }
    return data || [];
  }

  async function saveUser(user) {
    const { error } = await _supabase.from('users').insert({
      username: user.user,
      pass: user.pass,
      role: user.role
    });
    if (error) { console.error('saveUser:', error); return false; }
    return true;
  }

  async function deleteUser(id) {
    const { error } = await _supabase.from('users').delete().eq('id', id);
    if (error) { console.error('deleteUser:', error); return false; }
    return true;
  }

  async function findUser(username, passBase64) {
    const { data, error } = await _supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('pass', passBase64)
      .single();
    if (error || !data) return null;
    return { user: data.username, role: data.role, id: data.id };
  }

  // ── Backup ───────────────────────────────────────────────
  async function exportBackup() {
    const [accounts, txns, users] = await Promise.all([getAccounts(), getTxns(), getUsers()]);
    const data = JSON.stringify({ accounts, txns, users, exportedAt: new Date().toISOString(), version: '3.0' }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'SM_Group_Backup_' + Date.now() + '.json';
    a.click();
  }

  return { getAccounts, saveAccount, getTxns, saveTxn, getUsers, saveUser, deleteUser, findUser, exportBackup };
})();
