/**
 * storage.js — SM-Group v6.1
 * Cache مركزي قوي + طلبات متوازية = أسرع تحميل ممكن
 */

const SUPABASE_URL = DB_CONFIG.url;

// ══ تعليمات تفعيل RLS (مطلوب مرة واحدة) ══════════════════════
// 1. اذهب إلى Supabase Dashboard → Project Settings → API
// 2. انسخ JWT Secret
// 3. اذهب إلى jwt.io وأنشئ token جديد بهذا الـ payload:
//    { "iss":"supabase", "ref":"qrdasgkegudvnobjwafc",
//      "role":"anon", "app_role":"smgroup_app",
//      "iat":1780662753, "exp":2096238753 }
//    وقّعه بنفس الـ JWT Secret
// 4. حدّث القيمة في js/db-config.js
// 5. شغّل MIGRATION_V13.sql في SQL Editor
// ════════════════════════════════════════════════════════════
const SUPABASE_KEY = DB_CONFIG.key;
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
window._sb = _sb;

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

  // ══ تشفير كلمة المرور بـ SHA-256 ══════════════════════
  // يستبدل btoa() تماماً — لا يمكن عكسه
  async function hashPassword(plainText) {
    const encoder = new TextEncoder();
    const data    = encoder.encode(plainText.trim());
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
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
    // استدعاء الدالة الذرية في PostgreSQL — تمنع race condition تماماً
    const { data, error } = await _sb.rpc('update_balance', {
      p_account_id: accountId,
      p_currency:   currency,
      p_delta:      delta
    });
    if (error) { console.error('updateBalance:', error); return false; }
    // تحديث الـ Cache المحلي بالقيمة الجديدة الفعلية من قاعدة البيانات
    if (_cache.accounts.data) {
      const a = _cache.accounts.data.find(x => x.id === accountId);
      if (a) a[col] = data;
    }
    return true;
  }

  // الخزينة = مجموع كل الأرصدة لكل العملات (شاملة الأرباح)
  // حساب الأرباح حساب عادي — رصيده يُحسب ضمن الخزينة
  async function getTreasuryTotals() {
    const accounts = await getAccounts();
    const totals = {};
    accounts.forEach(a => {
      Object.keys(a).filter(k => k.startsWith('bal_')).forEach(k => {
        const cur = k.replace('bal_', '');
        if (!isNaN(parseFloat(a[k])))
          totals[cur] = (totals[cur] || 0) + parseFloat(a[k] || 0);
      });
    });
    return totals;
  }

  // الخزينة بدون الأرباح (للعرض المنفصل)
  async function getTreasuryWithoutProfit() {
    const accounts = await getAccounts();
    const totals = {};
    accounts.filter(a => a.id !== '9999').forEach(a => {
      Object.keys(a).filter(k => k.startsWith('bal_')).forEach(k => {
        const cur = k.replace('bal_', '');
        if (!isNaN(parseFloat(a[k])))
          totals[cur] = (totals[cur] || 0) + parseFloat(a[k] || 0);
      });
    });
    return totals;
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
    // استثناء المحذوفات دائماً — ما لم يُطلب عرضها صراحةً
    if (!filters.include_deleted) q = q.eq('is_deleted', false);
    if (filters.type)      q = q.eq('type', filters.type);
    if (filters.cur)       q = q.eq('cur', filters.cur);
    if (filters.acc) {
      q = q.or(`acc.eq.${filters.acc},to.eq.${filters.acc}`);
    }
    if (filters.from_date) q = q.gte('date', filters.from_date);
    if (filters.to_date)   q = q.lte('date', filters.to_date);
    if (filters.limit)     q = q.limit(filters.limit);
    const { data, error } = await q;
    if (error) { console.error('getTxns:', error); return []; }
    let result = data || [];
    // فلترة from محلياً (reserved word في PostgreSQL)
    if (filters.acc) {
      result = result.filter(t =>
        t.acc === filters.acc || t.to === filters.acc || t.from === filters.acc
      );
    }
    return result;
  }

  async function saveTxn(txn) {
    const { error } = await _sb.from('transactions').insert({ ...txn, is_deleted: false });
    return !error;
  }

  async function updateTxn(id, changes) {
    const { error } = await _sb.from('transactions').update(changes).eq('id', id);
    return !error;
  }

  // soft delete — لا حذف نهائي أبداً
  async function deleteTxn(id) {
    const user = typeof Auth !== 'undefined' ? Auth.getUser() : null;
    const { error } = await _sb.from('transactions').update({
      is_deleted:  true,
      deleted_by:  user?.user || 'system',
      deleted_at:  new Date().toISOString()
    }).eq('id', id);
    return !error;
  }

  async function getTxnById(id) {
    const { data, error } = await _sb.from('transactions').select('*').eq('id', id).single();
    if (error) return null;
    return data;
  }

  async function getTxnByParent(parentId) {
    const { data, error } = await _sb.from('transactions')
      .select('*').eq('parent_id', parentId).eq('is_commission_entry', true);
    if (error) return [];
    return data || [];
  }

  // ══ Users ══════════════════════════════════════════════

  async function getUsers() {
    const { data, error } = await _sb.rpc('admin_list_users', {
      p_caller_username: '',
      p_caller_password: ''
    });
    if (error) { console.error('admin_list_users:', error); return []; }
    return data || [];
  }

  async function saveUser(user) {
    const { data, error } = await _sb.rpc('admin_create_user', {
      p_caller_username: '',
      p_caller_password: '',
      p_new_username:    user.user,
      p_new_password:    user.pass,
      p_new_role:        user.role,
      p_new_permissions: user.permissions || null
    });
    if (error) { console.error('admin_create_user:', error); return false; }
    return !!data?.ok;
  }

  async function deleteUser(id) {
    const { data, error } = await _sb.rpc('admin_delete_user', {
      p_caller_username: '',
      p_caller_password: '',
      p_target_id:       id
    });
    if (error) { console.error('admin_delete_user:', error); return false; }
    return !!data?.ok;
  }

  async function updateUserPass(id, plainText) {
    const { data, error } = await _sb.rpc('admin_set_user_password', {
      p_caller_username: '',
      p_caller_password: '',
      p_target_id:       id,
      p_new_password:    plainText
    });
    if (error) { console.error('admin_set_user_password:', error); return false; }
    return !!data?.ok;
  }

  async function updateOwnPass(username, currentPass, newPass) {
    const { data, error } = await _sb.rpc('self_set_password', {
      p_username:     username,
      p_current_pass: currentPass,
      p_new_pass:     newPass
    });
    if (error) { console.error('self_set_password:', error); return false; }
    return !!data?.ok;
  }

  async function updateUserPermissions(id, permissions) {
    const { data, error } = await _sb.rpc('admin_set_user_permissions', {
      p_caller_username: '',
      p_caller_password: '',
      p_target_id:       id,
      p_permissions:     permissions
    });
    if (error) { console.error('admin_set_user_permissions:', error); return false; }
    return !!data?.ok;
  }

  async function updateUserRole(id, role) {
    const { data, error } = await _sb.rpc('admin_set_user_role', {
      p_caller_username: '',
      p_caller_password: '',
      p_target_id:       id,
      p_role:            role
    });
    if (error) { console.error('admin_set_user_role:', error); return false; }
    return !!data?.ok;
  }

  // تسجيل الدخول — يتحقق من كلمة المرور داخل قاعدة البيانات
  async function findUser(username, plainText) {
    const { data, error } = await _sb.rpc('login_verify', {
      p_username: username,
      p_password: plainText
    });
    if (error || !data?.ok) return null;
    return { user: data.username, role: data.role, id: data.id, permissions: data.permissions || null };
  }

  // ══ حذف الحساب مع تسوية الرصيد وأرشفته ═══════════════
  async function deleteAccount(accountId, deletedBy) {
    if (accountId === '9999') return { ok: false, error: 'لا يمكن حذف حساب الأرباح' };
    if (accountId.startsWith('7')) return { ok: false, error: 'هذا حساب أرشيفي محذوف مسبقاً' };

    const accounts = await getAccounts();
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return { ok: false, error: 'الحساب غير موجود' };

    // تسوية جميع العملات مع حساب الأرباح
    const balances = {};
    let transferNote = [];
    const currencies = ['usd','eur','try','gbp','sar','aed','egp','jod','kwd','qar','mad','lyd'];
    for (const cur of currencies) {
      const val = parseFloat(acc['bal_'+cur] || 0);
      balances[cur] = val;
      if (val !== 0) {
        await updateBalance('9999', cur, val);
        transferNote.push(`${cur.toUpperCase()}:${val.toFixed(2)}`);
      }
    }

    // توليد رقم أرشيفي (7000+)
    const { data: existing } = await _sb.from('deleted_accounts')
      .select('archive_id').not('archive_id','is',null).order('archive_id', { ascending: false }).limit(1);
    let nextArchive = '7001';
    if (existing && existing.length > 0) {
      const last = parseInt(existing[0].archive_id || '7000');
      nextArchive = String(last + 1);
    }

    // تسجيل في المحذوفات مع الرقم الأرشيفي
    await _sb.from('deleted_accounts').insert({
      id:           nextArchive,
      name:         acc.name,
      type:         acc.type,
      bal_usd:      balances.usd || 0,
      bal_eur:      balances.eur || 0,
      deleted_by:   deletedBy,
      deleted_at:   new Date().toISOString(),
      archive_id:   nextArchive,
      transfer_note: transferNote.length
        ? `تم تحويل (${transferNote.join(' | ')}) لحساب الأرباح`
        : 'رصيد صفري — لا تحويل'
    });

    // تحديث رقم الحساب في العمليات المباشرة فقط (إيداع/سحب)
    // التحويلات تبقى كما هي في حسابات الأطراف الأخرى
    await _sb.from('transactions')
      .update({ acc: nextArchive })
      .eq('acc', accountId);
    // تحديث from وto فقط في حالة التحويلات بين نفس الحسابات
    await _sb.from('transactions')
      .update({ from: nextArchive })
      .eq('type', 'trf')
      .eq('from', accountId);
    await _sb.from('transactions')
      .update({ to: nextArchive })
      .eq('type', 'trf')
      .eq('to', accountId);

    const { error } = await _sb.from('accounts').delete().eq('id', accountId);
    if (error) return { ok: false, error: 'خطأ في الحذف: ' + error.message };

    invalidate('accounts');
    await addNotification('delete', '🗑️ حذف حساب', `تم حذف حساب ${acc.name} (${accountId}) وأرشفته برقم ${nextArchive}`, '🗑️');
    await logAction('delete_account', { accountId, name: acc.name, archiveId: nextArchive, deletedBy });
    return { ok: true, usd: balances.usd || 0, eur: balances.eur || 0, archiveId: nextArchive };
  }

  async function getRecyclableId(type) {
    // نبحث فقط في السجلات التي ليس لها archive_id (أي أرقام قابلة لإعادة الاستخدام)
    // السجلات ذات archive_id هي أرشيف محذوفات — لا نعيد استخدامها
    return null; // معطّل — نولّد أرقاماً جديدة دائماً
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
    const hashedPin = await hashPassword(pin.trim());
    const acc = accounts.find(a =>
      a.id === accountId.trim() &&
      a.client_pin === hashedPin &&
      a.type === 'customer'
    );
    if (!acc) return null;
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
    const plain = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const hashed = await hashPassword(plain);
    const { error } = await _sb.from('accounts').update({ client_pin: hashed }).eq('id', accountId);
    if (error) return null;
    invalidate('accounts');
    // نعيد الـ PIN كـ plain text مرة واحدة فقط لعرضه للموظف
    return plain;
  }

  async function getClientTxns(accountId, publishedAt) {
    let q = _sb.from('transactions')
      .select('*')
      .or(`acc.eq.${accountId},to.eq.${accountId}`)
      .order('date', { ascending: false });
    if (publishedAt) q = q.lte('date', publishedAt);
    const { data, error } = await q;
    if (error) return [];
    // Post-filter to include 'from' column
    return (data || []).filter(t =>
      t.acc === accountId || t.to === accountId || t.from === accountId
    );
  }


  // ══ السجل الإحصائي اليومي ══════════════════════════════
  async function saveDailySnapshot() {
    const today = new Date().toISOString().slice(0, 10);

    // تحقق إذا حُفظ اليوم مسبقاً
    const { data: existing } = await _sb
      .from('daily_snapshots')
      .select('id')
      .eq('snapshot_date', today)
      .single();
    if (existing) return; // حُفظ مسبقاً اليوم

    const [accounts, txns] = await Promise.all([
      getAccounts(),
      getTxns()
    ]);

    const profit = accounts.find(a => a.id === '9999');
    const customers = accounts.filter(a => a.type === 'customer');
    const companies = accounts.filter(a => a.type === 'company');

    // حساب الخزينة بدون الأرباح
    let tUsd = 0, tEur = 0;
    accounts.filter(a => a.id !== '9999').forEach(a => {
      tUsd += parseFloat(a.bal_usd || 0);
      tEur += parseFloat(a.bal_eur || 0);
    });

    const debtors   = accounts.filter(a => parseFloat(a.bal_usd||0) < 0 || parseFloat(a.bal_eur||0) < 0).length;
    const creditors = accounts.filter(a => parseFloat(a.bal_usd||0) > 0 || parseFloat(a.bal_eur||0) > 0).length;

    await _sb.from('daily_snapshots').insert({
      snapshot_date:   today,
      treasury_usd:    parseFloat(tUsd.toFixed(2)),
      treasury_eur:    parseFloat(tEur.toFixed(2)),
      profit_usd:      parseFloat(profit?.bal_usd || 0),
      profit_eur:      parseFloat(profit?.bal_eur || 0),
      total_accounts:  accounts.filter(a => a.id !== '9999').length,
      total_customers: customers.length,
      total_companies: companies.length,
      total_txns:      txns.length,
      total_debtors:   debtors,
      total_creditors: creditors
    });

    console.log('✅ تم حفظ السجل اليومي:', today);
  }

  async function getSnapshots(limit = 30) {
    const { data } = await _sb
      .from('daily_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(limit);
    return data || [];
  }


  // ══ الإشعارات ══════════════════════════════════════════
  async function addNotification(type, title, body, icon='🔔') {
    const user = typeof Auth !== 'undefined' ? Auth.getUser() : null;
    try {
      await _sb.from('notifications').insert({
        type, title, body, icon,
        is_read: false,
        created_by: user?.user || 'system'
      });
    } catch(e) { console.error('notification:', e); }
  }

  async function getNotifications(limit=30) {
    const { data } = await _sb
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  }

  async function markNotifRead(id) {
    await _sb.from('notifications').update({ is_read: true }).eq('id', id);
  }

  async function markAllNotifsRead() {
    await _sb.from('notifications').update({ is_read: true }).eq('is_read', false);
  }

  // ══ سجل التدقيق ═══════════════════════════════════════
  async function logAction(action, details, oldValue = null, newValue = null) {
    const user = typeof Auth !== 'undefined' ? Auth.getUser() : null;
    try {
      await _sb.from('audit_log').insert({
        action,
        page:      window.location.pathname.split('/').pop(),
        username:  user?.user || 'system',
        details,
        old_value: oldValue,
        new_value: newValue
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

  async function getAuditLogs(filters = {}) {
  let q = _sb
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (filters.from) q = q.gte('created_at', filters.from);
  if (filters.to) q = q.lte('created_at', filters.to + 'T23:59:59');

  const { data, error } = await q;

  if (error) {
    console.error('audit_log:', error);
    return [];
  }

  return data || [];
}

  async function getDeletedAccounts(filters = {}) {
  const { data } = await _sb
    .from('deleted_accounts')
    .select('*')
    .order('archive_id', { ascending: false });
  return data || [];
}
  
  return {
  // accounts
  getAccounts, saveAccount, updateAccount, getBalance, updateBalance,
  getTreasuryTotals, getTreasuryWithoutProfit, getProfitBalance, invalidate,
  deleteAccount, getRecyclableId, ensureProfitAccount,

  // transactions
  getTxns, saveTxn, updateTxn, deleteTxn, getTxnById, getTxnByParent,

  // users
  getUsers, saveUser, deleteUser, updateUserPass, updateOwnPass,
  updateUserPermissions, updateUserRole, findUser, hashPassword,

  // settings
  getAlertSettings, saveAlertSettings,

  // client portal
  clientLogin, publishClientView, publishAllClients, regeneratePin, getClientTxns,

  // daily snapshots
  saveDailySnapshot, getSnapshots,

  // notifications
  addNotification, getNotifications, markNotifRead, markAllNotifsRead,

  // misc
  logAction,
  exportBackup,
  getAuditLogs,
  getDeletedAccounts
};
})();
