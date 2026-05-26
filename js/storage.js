/**
 * storage.js — SM-Group v4.3
 * تحسين السرعة: Cache ذكي للحسابات + طلبات متوازية
 */

const SUPABASE_URL = 'https://jmmikuprhitwundsuplt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ECr_Pt2w19dBj_XPz5CYbQ_Qvj4gAQ-';
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const Storage = (() => {

  // ── Cache بسيط ──────────────────────────────────────
  let _accountsCache = null;
  let _accountsCacheTime = 0;
  const CACHE_TTL = 30000; // 30 ثانية

  function _invalidateAccounts() { _accountsCache = null; _accountsCacheTime = 0; }

  // ── Accounts ─────────────────────────────────────────
  async function getAccounts() {
    const now = Date.now();
    if (_accountsCache && (now - _accountsCacheTime) < CACHE_TTL) return _accountsCache;
    const { data, error } = await _sb.from('accounts').select('*').order('id');
    if (error) { console.error('getAccounts:', error); return []; }
    _accountsCache = data || [];
    _accountsCacheTime = Date.now();
    return _accountsCache;
  }

  async function updateAccount(id, changes) {
    const { error } = await _sb.from('accounts').update(changes).eq('id', id);
    if (!error) _invalidateAccounts();
    return !error;
  }

  async function saveAccount(account) {
    const { error } = await _sb.from('accounts').upsert({
      id:account.id, name:account.name, type:account.type, bal_usd:0, bal_eur:0
    });
    if (!error) _invalidateAccounts();
    return !error;
  }

  async function getBalance(accountId, currency) {
    // أولاً: حاول من الـ Cache
    if (_accountsCache) {
      const a = _accountsCache.find(x=>x.id===accountId);
      if (a) return parseFloat(currency==='usd' ? (a.bal_usd||0) : (a.bal_eur||0));
    }
    const col = currency==='usd'?'bal_usd':'bal_eur';
    const { data, error } = await _sb.from('accounts').select(col).eq('id',accountId).single();
    if (error||!data) return 0;
    return parseFloat(data[col]||0);
  }

  async function updateBalance(accountId, currency, delta) {
    const col = currency==='usd'?'bal_usd':'bal_eur';
    // اقرأ الرصيد الحالي من الـ Cache إن وجد
    let currentVal = 0;
    if (_accountsCache) {
      const a = _accountsCache.find(x=>x.id===accountId);
      if (a) currentVal = parseFloat(a[col]||0);
    } else {
      const { data } = await _sb.from('accounts').select(col).eq('id',accountId).single();
      if (data) currentVal = parseFloat(data[col]||0);
    }
    const newBal = currentVal + delta;
    const { error } = await _sb.from('accounts').update({[col]:newBal}).eq('id',accountId);
    if (!error && _accountsCache) {
      // حدّث الـ Cache محلياً بدل إعادة جلب كل شيء
      const a = _accountsCache.find(x=>x.id===accountId);
      if (a) a[col] = newBal;
    }
    return !error;
  }

  // ── Transactions ──────────────────────────────────────
  async function getTxns(filters={}) {
    let q = _sb.from('transactions').select('*').order('date',{ascending:false});
    if (filters.type)      q = q.eq('type', filters.type);
    if (filters.cur)       q = q.eq('cur', filters.cur);
    if (filters.acc)       q = q.or(`acc.eq.${filters.acc},from.eq.${filters.acc},to.eq.${filters.acc}`);
    if (filters.from_date) q = q.gte('date', filters.from_date);
    if (filters.to_date)   q = q.lte('date', filters.to_date);
    if (filters.limit)     q = q.limit(filters.limit);
    const { data, error } = await q;
    if (error) { console.error('getTxns:', error); return []; }
    return data||[];
  }

  async function saveTxn(txn) {
    const { error } = await _sb.from('transactions').insert(txn);
    return !error;
  }

  async function updateTxn(id, changes) {
    const { error } = await _sb.from('transactions').update(changes).eq('id',id);
    return !error;
  }

  async function deleteTxn(id) {
    const { error } = await _sb.from('transactions').delete().eq('id',id);
    return !error;
  }

  async function getTxnById(id) {
    const { data, error } = await _sb.from('transactions').select('*').eq('id',id).single();
    if (error) return null;
    return data;
  }

  // الخزينة = مجموع الأرصدة بدون حساب الأرباح (9999)
  async function getTreasuryTotals() {
    const accounts = await getAccounts();
    let usd=0, eur=0;
    accounts.forEach(a => {
      if (a.id === '9999') return; // حساب الأرباح منفصل
      usd += parseFloat(a.bal_usd||0);
      eur += parseFloat(a.bal_eur||0);
    });
    return { usd, eur };
  }

  // ── Users ─────────────────────────────────────────────
  async function getUsers() {
    const { data, error } = await _sb.from('users').select('*');
    if (error) return [];
    return data||[];
  }

  async function saveUser(user) {
    const { error } = await _sb.from('users').insert({
      username:    user.user,
      pass:        user.pass,
      role:        user.role,
      permissions: user.permissions || null
    });
    return !error;
  }

  async function deleteUser(id) {
    const { error } = await _sb.from('users').delete().eq('id',id);
    return !error;
  }

  async function updateUserPass(id, passBase64) {
    const { error } = await _sb.from('users').update({pass:passBase64}).eq('id',id);
    return !error;
  }

  async function findUser(username, passBase64) {
    const { data, error } = await _sb.from('users')
      .select('*').eq('username',username).eq('pass',passBase64).single();
    if (error||!data) return null;
    return {
      user: data.username,
      role: data.role,
      id:   data.id,
      permissions: data.permissions || null
    };
  }

  async function updateUserPermissions(id, permissions) {
    const { error } = await _sb.from('users').update({ permissions }).eq('id', id);
    return !error;
  }

  async function updateUserRole(id, role) {
    const { error } = await _sb.from('users').update({ role }).eq('id', id);
    return !error;
  }

  // ── Backup ────────────────────────────────────────────
  async function exportBackup() {
    const [accounts, txns, users] = await Promise.all([getAccounts(), getTxns(), getUsers()]);
    const blob = new Blob([JSON.stringify({accounts,txns,users,
      exportedAt:new Date().toISOString(),version:'4.3'},null,2)],
      {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'SMGroup_Backup_'+new Date().toISOString().slice(0,10)+'.json';
    a.click();
  }

  return {
    getAccounts, saveAccount, updateAccount, getBalance, updateBalance,
    getTxns, saveTxn, updateTxn, deleteTxn, getTxnById,
    getTreasuryTotals, getUsers, saveUser, deleteUser,
    updateUserPass, updateUserPermissions, updateUserRole,
    findUser, exportBackup
  };
})();
