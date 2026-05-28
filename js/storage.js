/**
 * storage.js — SM-Group v6.0
 * Cache مركزي قوي + طلبات متوازية = أسرع تحميل ممكن
 */

const SUPABASE_URL = 'https://jmmikuprhitwundsuplt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ECr_Pt2w19dBj_XPz5CYbQ_Qvj4gAQ-';
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const Storage = (() => {

  // ══ Cache مركزي ══════════════════════════════════════
  const _cache = {
    accounts:  { data: null, ts: 0 },
    users:     { data: null, ts: 0 },
    settings:  { data: null, ts: 0 },
  };
  const TTL = { accounts: 60000, users: 120000, settings: 300000 }; // ms

  function _fresh(key) {
    return _cache[key].data && (Date.now() - _cache[key].ts) < TTL[key];
  }
  function _set(key, data) {
    _cache[key] = { data, ts: Date.now() };
  }
  function invalidate(key) {
    if (key) _cache[key] = { data: null, ts: 0 };
    else Object.keys(_cache).forEach(k => _cache[k] = { data: null, ts: 0 });
  }

  // ══ Accounts ═════════════════════════════════════════
  async function getAccounts() {
    if (_fresh('accounts')) return _cache.accounts.data;
    const { data, error } = await _sb.from('accounts').select('*').order('id');
    if (error) { console.error('getAccounts:', error); return _cache.accounts.data || []; }
    _set('accounts', data || []);
    return _cache.accounts.data;
  }

  async function saveAccount(account) {
    const { error } = await _sb.from('accounts').upsert({
      id: account.id, name: account.name, type: account.type,
      bal_usd: 0, bal_eur: 0, commission_rate: account.type === 'customer' ? 0.025 : 0
    });
    if (!error) invalidate('accounts');
    return !error;
  }

  async function updateAccount(id, changes) {
    const { error } = await _sb.from('accounts').update(changes).eq('id', id);
    if (!error) {
      // تحديث Cache محلياً بدون إعادة جلب
      if (_cache.accounts.data) {
        const a = _cache.accounts.data.find(x => x.id === id);
        if (a) Object.assign(a, changes);
      }
    }
    return !error;
  }

  function _balCol(currency) {
    return 'bal_' + currency.toLowerCase();
  }

  async function getBalance(accountId, currency) {
    const col = _balCol(currency);
    if (_cache.accounts.data) {
      const a = _cache.accounts.data.find(x => x.id === accountId);
      if (a) return parseFloat(a[col] || 0);
    }
    const { data, error } = await _sb.from('accounts').select(col).eq('id', accountId).single();
    if (error || !data) return 0;
    return parseFloat(data[col] || 0);
  }

  async function updateBalance(accountId, currency, delta) {
    const col = _balCol(currency);
    let current = 0;
    if (_cache.accounts.data) {
      const a = _cache.accounts.data.find(x => x.id === accountId);
      if (a) current = parseFloat(a[col] || 0);
    } else {
      const { data } = await _sb.from('accounts').select(col).eq('id', accountId).single();
      if (data) current = parseFloat(data[col] || 0);
    }
    const newBal = parseFloat((current + delta).toFixed(6));
    const { error } = await _sb.from('accounts').update({ [col]: newBal }).eq('id', accountId);
    if (!error && _cache.accounts.data) {
      const a = _cache.accounts.data.find(x => x.id === accountId);
      if (a) a[col] = newBal;
    }
    return !error;
  }

  // الخزينة = مجموع كل الأرصدة لكل العملات
  async function getTreasuryTotals() {
    const accounts = await getAccounts();
    const totals = {};
    accounts.forEach(a => {
      Object.keys(a).filter(k => k.startsWith('bal_')).forEach(k => {
        const cur = k.replace('bal_', '');
        totals[cur] = (totals[cur] || 0) + parseFloat(a[k] || 0);
      });
    });
    return totals; // { usd:X, eur:Y, try:Z, ... }
  }

  // الأرباح منفصلة
  async function getProfitBalance() {
    const accounts = await getAccounts();
    const p = accounts.find(a => a.id === '9999');
    if (!p) return { usd:0, eur:0 };
    const result = {};
    Object.keys(p).filter(k => k.startsWith('bal_')).forEach(k => {
      const cur = k.replace('bal_','').toUpperCase();
      result[cur.toLowerCase()] = parseFloat(p[k] || 0);
    });
    return result;
  }

  // ══ Transactions ══════════════════════════════════════
  async function getTxns(filters = {}) {
    let q = _sb.from('transactions').select('*').order('date', { ascending: false });
    if (filters.type)      q = q.eq('type', filters.type);
    if (filters.cur)       q = q.eq('cur', filters.cur);
    if (filters.acc) {
      q = q.or(`acc.eq.${filters.acc},"from".eq.${filters.acc},to.eq.${filters.acc}`);
    }
    if (filters.from_date) q = q.gte('date', filters.from_date);
    if (filters.to_date)   q = q.lte('date', filters.to_date);
    if (filters.limit)     q = q.limit(filters.limit);
    const { data, error } = await q;
    if (error) { console.error('getTxns:', error); return []; }
    return data || [];
  }

  async function saveTxn(txn) {
    const { error } = await _sb.from('transactions').insert(txn);
    return !error;
  }

  async function updateTxn(id, changes) {
    const { error } = await _sb.from('transactions').update(changes).eq('id', id);
    return !error;
  }

  async function deleteTxn(id) {
    const { error } = await _sb.from('transactions').delete().eq('id', id);
    return !error;
  }

  async function getTxnById(id) {
    const { data, error } = await _sb.from('transactions').select('*').eq('id', id).single();
    if (error) return null;
    return data;
  }

  async function getTxnByParent(parentId) {
    const { data, error } = await _sb.from('transactions')
      .select('*').eq('parent_id', parentId).eq('is_commission_entry', true).single();
    if (error || !data) return null;
    return data;
  }

  // ══ Users ══════════════════════════════════════════════
  async function getUsers() {
    if (_fresh('users')) return _cache.users.data;
    const { data, error } = await _sb.from('users').select('*');
    if (error) return _cache.users.data || [];
    _set('users', data || []);
    return _cache.users.data;
  }

  async function saveUser(user) {
    const { error } = await _sb.from('users').insert({
      username: user.user, pass: user.pass,
      role: user.role, permissions: user.permissions || null
    });
    if (!error) invalidate('users');
    return !error;
  }

  async function deleteUser(id) {
    const { error } = await _sb.from('users').delete().eq('id', id);
    if (!error) invalidate('users');
    return !error;
  }

  async function updateUserPass(id, passBase64) {
    const { error } = await _sb.from('users').update({ pass: passBase64 }).eq('id', id);
    if (!error) invalidate('users');
    return !error;
  }

  async function updateUserPermissions(id, permissions) {
    const { error } = await _sb.from('users').update({ permissions }).eq('id', id);
    if (!error) invalidate('users');
    return !error;
  }

  async function updateUserRole(id, role) {
    const { error } = await _sb.from('users').update({ role }).eq('id', id);
    if (!error) invalidate('users');
    return !error;
  }

  async function findUser(username, passBase64) {
    // البحث عن المستخدم من الـ Cache أولاً
    if (_fresh('users')) {
      const u = _cache.users.data.find(x => x.username === username && x.pass === passBase64);
      if (u) return { user: u.username, role: u.role, id: u.id, permissions: u.permissions || null };
      return null;
    }
    const { data, error } = await _sb.from('users')
      .select('*').eq('username', username).eq('pass', passBase64).single();
    if (error || !data) return null;
    return { user: data.username, role: data.role, id: data.id, permissions: data.permissions || null };
  }

  // ══ حذف الحساب مع تسوية الرصيد ══════════════════════
  async function deleteAccount(accountId, deletedBy) {
    if (accountId === '9999') return { ok: false, error: 'لا يمكن حذف حساب الأرباح' };

    const accounts = await getAccounts();
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return { ok: false, error: 'الحساب غير موجود' };

    const usd = parseFloat(acc.bal_usd || 0);
    const eur = parseFloat(acc.bal_eur || 0);

    // تسوية الرصيد مع حساب الأرباح
    if (usd !== 0) await updateBalance('9999', 'usd', usd);
    if (eur !== 0) await updateBalance('9999', 'eur', eur);

    // تسجيل في المحذوفات
    await _sb.from('deleted_accounts').insert({
      id: acc.id, name: acc.name, type: acc.type,
      bal_usd: usd, bal_eur: eur, deleted_by: deletedBy,
      transfer_note: (usd !== 0 || eur !== 0)
        ? `تم تحويل ($${usd.toFixed(2)} | €${eur.toFixed(2)}) لحساب الأرباح`
        : 'رصيد صفري'
    });

    const { error } = await _sb.from('accounts').delete().eq('id', accountId);
    if (error) return { ok: false, error: 'خطأ في الحذف: ' + error.message };

    invalidate('accounts');
    return { ok: true, usd, eur };
  }

  async function getRecyclableId(type) {
    const { data } = await _sb.from('deleted_accounts')
      .select('id').order('deleted_at', { ascending: true });
    if (!data || !data.length) return null;
    const match = data.find(r =>
      type === 'customer'
        ? !r.id.startsWith('4') && !r.id.startsWith('9')
        : r.id.startsWith('4')
    );
    if (!match) return null;
    await _sb.from('deleted_accounts').delete().eq('id', match.id);
    return match.id;
  }

  // ══ إعادة إنشاء حساب الأرباح إذا حُذف ══════════════
  async function ensureProfitAccount() {
    const accounts = await getAccounts();
    if (accounts.find(a => a.id === '9999')) return; // موجود
    await _sb.from('accounts').insert({
      id: '9999', name: 'حساب الأرباح', type: 'profit',
      bal_usd: 0, bal_eur: 0, commission_rate: 0
    });
    invalidate('accounts');
    console.log('✅ تم إعادة إنشاء حساب الأرباح');
  }

  // ══ إعدادات التنبيهات ════════════════════════════════
  async function getAlertSettings() {
    if (_fresh('settings')) return _cache.settings.data;
    const { data } = await _sb.from('alert_settings').select('*').single();
    const result = data || { debt_limit: -500 };
    _set('settings', result);
    return result;
  }

  async function saveAlertSettings(settings) {
    const { data: ex } = await _sb.from('alert_settings').select('id').single();
    let error;
    if (ex) {
      ({ error } = await _sb.from('alert_settings')
        .update({ ...settings, updated_at: new Date().toISOString() }).eq('id', ex.id));
    } else {
      ({ error } = await _sb.from('alert_settings').insert(settings));
    }
    if (!error) invalidate('settings');
    return !error;
  }

  // ══ بوابة الزبون ══════════════════════════════════════
  async function clientLogin(accountId, pin) {
    const accounts = await getAccounts();
    const acc = accounts.find(a => a.id === accountId.trim() && a.client_pin === pin.trim());
    if (!acc || acc.type !== 'customer') return null;
    return acc;
  }

  async function publishClientView(accountId, publishedBy) {
    const now = new Date().toISOString();
    const { error } = await _sb.from('accounts').update({
      client_published_at: now, client_published_by: publishedBy
    }).eq('id', accountId);
    if (!error) invalidate('accounts');
    return !error;
  }

  async function publishAllClients(publishedBy) {
    const now = new Date().toISOString();
    const { error } = await _sb.from('accounts').update({
      client_published_at: now, client_published_by: publishedBy
    }).eq('type', 'customer');
    if (!error) invalidate('accounts');
    return !error;
  }

  async function regeneratePin(accountId) {
    const pin = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const { error } = await _sb.from('accounts').update({ client_pin: pin }).eq('id', accountId);
    if (error) return null;
    invalidate('accounts');
    return pin;
  }

  async function getClientTxns(accountId, publishedAt) {
    let q = _sb.from('transactions')
      .select('*')
      .or(`acc.eq.${accountId},"from".eq.${accountId},to.eq.${accountId}`)
      .order('date', { ascending: false });
    if (publishedAt) q = q.lte('date', publishedAt);
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  }

  // ══ سجل التدقيق ═══════════════════════════════════════
  async function logAction(action, details) {
    const user = typeof Auth !== 'undefined' ? Auth.getUser() : null;
    try {
      await _sb.from('audit_log').insert({
        action,
        page: window.location.pathname.split('/').pop(),
        username: user?.user || 'system',
        details
      });
    } catch(e) {}
  }

  // ══ النسخ الاحتياطي ════════════════════════════════════
  async function exportBackup() {
    const [accounts, txns, users] = await Promise.all([getAccounts(), getTxns(), getUsers()]);
    const blob = new Blob([JSON.stringify({
      accounts, txns, users,
      exportedAt: new Date().toISOString(), version: '6.0'
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'SMGroup_Backup_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
  }

  return {
    // accounts
    getAccounts, saveAccount, updateAccount, getBalance, updateBalance,
    getTreasuryTotals, getProfitBalance, invalidate,
    deleteAccount, getRecyclableId, ensureProfitAccount,
    // transactions
    getTxns, saveTxn, updateTxn, deleteTxn, getTxnById, getTxnByParent,
    // users
    getUsers, saveUser, deleteUser, updateUserPass,
    updateUserPermissions, updateUserRole, findUser,
    // settings
    getAlertSettings, saveAlertSettings,
    // client portal
    clientLogin, publishClientView, publishAllClients, regeneratePin, getClientTxns,
    // misc
    logAction, exportBackup
  };
})();
