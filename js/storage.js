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
    const { error } = await _sb.from('accounts').insert({
      id: account.id, name: account.name, type: account.type,
      bal_usd: 0, bal_eur: 0, commission_rate: account.type === 'customer' ? 0.025 : 0
    });
    if (!error) { invalidate('accounts'); return { ok:true }; }
    // 23505 = unique_violation (Postgres)
    if (error.code === '23505') {
      const isProfitDupe = /one_profit_account_only/i.test(error.message || '') ||
                            /one_profit_account_only/i.test(error.details || '');
      return { ok:false, error: isProfitDupe ? 'duplicate_profit' : 'duplicate' };
    }
    console.error('saveAccount:', error);
    return { ok:false, error:'generic' };
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

  // ══ عمليات مالية ذرّية (MIGRATION_V32) ═══════════════════
  // كل عملية = استدعاء RPC واحد ينفّذ (الحركة الرئيسية + قيد الخزينة
  // المقابل + قيد العمولة) داخل نفس الـ transaction في القاعدة —
  // إما ينجح كل شيء أو يفشل كل شيء، بلا حالات وسطى.
  async function atomicDeposit(txnId, accId, currency, amount, commission, by, dateIso, note) {
    const { data, error } = await _sb.rpc('atomic_deposit', {
      p_txn_id: txnId, p_acc_id: accId, p_currency: currency,
      p_amount: amount, p_commission: commission,
      p_by: by, p_date: dateIso, p_note: note || null
    });
    if (error) { console.error('atomic_deposit:', error); return { ok:false, error:'db_error' }; }
    return data;
  }

  async function atomicWithdraw(txnId, accId, currency, amount, by, dateIso, force, note) {
    const { data, error } = await _sb.rpc('atomic_withdraw', {
      p_txn_id: txnId, p_acc_id: accId, p_currency: currency,
      p_amount: amount, p_by: by, p_date: dateIso,
      p_force: !!force, p_note: note || null
    });
    if (error) { console.error('atomic_withdraw:', error); return { ok:false, error:'db_error' }; }
    return data;
  }

  async function atomicTransfer(txnId, fromId, toId, currency, amount, rate, commission, by, dateIso, force) {
    const { data, error } = await _sb.rpc('atomic_transfer', {
      p_txn_id: txnId, p_from_id: fromId, p_to_id: toId, p_currency: currency,
      p_amount: amount, p_rate: rate, p_commission: commission,
      p_by: by, p_date: dateIso, p_force: !!force
    });
    if (error) { console.error('atomic_transfer:', error); return { ok:false, error:'db_error' }; }
    return data;
  }

  async function atomicReverseDeposit(txnId, deletedBy) {
    const { data, error } = await _sb.rpc('atomic_reverse_deposit', { p_txn_id: txnId, p_deleted_by: deletedBy });
    if (error) { console.error('atomic_reverse_deposit:', error); return { ok:false, error:'db_error' }; }
    return data;
  }

  async function atomicReverseWithdraw(txnId, deletedBy) {
    const { data, error } = await _sb.rpc('atomic_reverse_withdraw', { p_txn_id: txnId, p_deleted_by: deletedBy });
    if (error) { console.error('atomic_reverse_withdraw:', error); return { ok:false, error:'db_error' }; }
    return data;
  }

  async function atomicReverseTransfer(txnId, deletedBy) {
    const { data, error } = await _sb.rpc('atomic_reverse_transfer', { p_txn_id: txnId, p_deleted_by: deletedBy });
    if (error) { console.error('atomic_reverse_transfer:', error); return { ok:false, error:'db_error' }; }
    return data;
  }

  // تعديل كود حساب الأرباح/الخزينة فقط (MIGRATION_V34)
  async function renameStructuralAccountId(oldId, newId) {
    const { data, error } = await _sb.rpc('atomic_rename_structural_account', {
      p_old_id: oldId, p_new_id: newId
    });
    if (error) { console.error('atomic_rename_structural_account:', error); return { ok:false, error:'db_error' }; }
    return data;
  }

  // الخزينة = مجموع كل الأرصدة لكل العملات (شاملة الأرباح)
  // حساب الأرباح حساب عادي — رصيده يُحسب ضمن الخزينة
  async function getTreasuryTotals() {
    const accounts = await getAccounts();
    const totals = {};
    // نستبعد حساب الخزينة الفعلي (القيد المزدوج — MIGRATION_V29) من هذا
    // المجموع: هو رصيد نقد فعلي (مركز نقدية)، وليس التزاماً تجاه زبون
    // كبقية الحسابات — خلطه هنا كان سيُفسد معنى هذه البطاقة تماماً.
    accounts.filter(a => a.id !== CONFIG.TREASURY_ACCOUNT_ID).forEach(a => {
      Object.keys(a).filter(k => k.startsWith('bal_')).forEach(k => {
        const cur = k.replace('bal_', '');
        if (!isNaN(parseFloat(a[k])))
          totals[cur] = (totals[cur] || 0) + parseFloat(a[k] || 0);
      });
    });
    return totals;
  }

  // الخزينة بدون الأرباح ولا حساب الخزينة الفعلي (للعرض المنفصل)
  async function getTreasuryWithoutProfit() {
    const accounts = await getAccounts();
    const totals = {};
    accounts.filter(a => a.id !== CONFIG.PROFIT_ACCOUNT_ID && a.id !== CONFIG.TREASURY_ACCOUNT_ID).forEach(a => {
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
    const p = accounts.find(a => a.id === CONFIG.PROFIT_ACCOUNT_ID);
    if (!p) return { usd:0, eur:0 };
    const result = {};
    Object.keys(p).filter(k => k.startsWith('bal_')).forEach(k => {
      const cur = k.replace('bal_','').toUpperCase();
      result[cur.toLowerCase()] = parseFloat(p[k] || 0);
    });
    return result;
  }

  // رصيد حساب الخزينة الفعلي (القيد المزدوج — MIGRATION_V29)
  // لا يُخلط مع getTreasuryTotals() التي تجمع أرصدة كل الزبائن/الشركات
  async function getCashboxBalance() {
    const accounts = await getAccounts();
    const cb = accounts.find(a => a.id === CONFIG.TREASURY_ACCOUNT_ID);
    if (!cb) return { usd:0, eur:0 };
    const result = {};
    Object.keys(cb).filter(k => k.startsWith('bal_')).forEach(k => {
      const cur = k.replace('bal_','').toUpperCase();
      result[cur.toLowerCase()] = parseFloat(cb[k] || 0);
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

  function _callerCreds() {
    try {
      const u = typeof Auth !== 'undefined' ? Auth.getUser() : null;
      return {
        p_caller_username: u?.user || '',
        p_caller_password: u?._pass || ''
      };
    } catch(e) { return { p_caller_username: '', p_caller_password: '' }; }
  }

  async function getUsers() {
    const { data, error } = await _sb.rpc('admin_list_users', {
      ..._callerCreds()
    });
    if (error) { console.error('admin_list_users:', error); return []; }
    return data || [];
  }

  async function saveUser(user) {
    const { data, error } = await _sb.rpc('admin_create_user', {
      ..._callerCreds(),
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
      ..._callerCreds(),
      p_target_id: id
    });
    if (error) { console.error('admin_delete_user:', error); return false; }
    return !!data?.ok;
  }

  async function updateUserPass(id, plainText) {
    const { data, error } = await _sb.rpc('admin_set_user_password', {
      ..._callerCreds(),
      p_target_id:   id,
      p_new_password: plainText
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
      ..._callerCreds(),
      p_target_id:   id,
      p_permissions: permissions
    });
    if (error) { console.error('admin_set_user_permissions:', error); return false; }
    return !!data?.ok;
  }

  async function updateUserRole(id, role) {
    const { data, error } = await _sb.rpc('admin_set_user_role', {
      ..._callerCreds(),
      p_target_id: id,
      p_role:      role
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
    return {
      user: data.username, role: data.role, id: data.id,
      permissions: data.permissions || null,
      nav_style: data.nav_style || null
    };
  }

  // ══ حفظ تفضيل نمط التنقل (سايدبار/توب بار) على كل الأجهزة ══
  async function setNavStyleRemote(username, navStyle) {
    const { data, error } = await _sb.rpc('self_set_nav_style', {
      p_username: username,
      p_nav_style: navStyle
    });
    if (error) { console.error('setNavStyleRemote:', error); return false; }
    return !!data?.ok;
  }

  // ══ حذف الحساب مع تسوية الرصيد وأرشفته ═══════════════
  async function deleteAccount(accountId, deletedBy) {
    if (accountId === CONFIG.PROFIT_ACCOUNT_ID) return { ok: false, error: 'لا يمكن حذف حساب الأرباح' };
    if (accountId === CONFIG.TREASURY_ACCOUNT_ID) return { ok: false, error: 'لا يمكن حذف حساب الخزينة' };

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
        await updateBalance(CONFIG.PROFIT_ACCOUNT_ID, cur, val);
        transferNote.push(`${cur.toUpperCase()}:${val.toFixed(2)}`);
      }
    }

    // توليد رقم أرشيفي حسب نوع الحساب الأصلي (تسلسل مستقل لكل نوع)
    // مثال: زبون مؤرشف => AC-CU-0001 ، شركة مؤرشفة => AC-CO-0001
    const typePrefix    = CONFIG.TYPE_PREFIXES[acc.type] || 'XX';
    const archivePrefix = CONFIG.ARCHIVE_PREFIX + '-' + typePrefix + '-';
    const { data: existing } = await _sb.from('deleted_accounts')
      .select('archive_id').like('archive_id', archivePrefix + '%')
      .order('archive_id', { ascending: false }).limit(1);
    let nextNum = 1;
    if (existing && existing.length > 0) {
      const lastNum = parseInt(String(existing[0].archive_id || '').slice(archivePrefix.length), 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    const nextArchive = archivePrefix + String(nextNum).padStart(4, '0');

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
    if (accounts.find(a => a.type === 'profit')) return; // موجود بالفعل (بأي كود)
    await _sb.from('accounts').insert({
      id: CONFIG.PROFIT_ACCOUNT_ID, name: 'حساب الأرباح', type: 'profit',
      bal_usd: 0, bal_eur: 0, commission_rate: 0
    });
    invalidate('accounts');
    console.log('✅ تم إعادة إنشاء حساب الأرباح');
  }

  // ══ إعادة إنشاء حساب الخزينة إذا حُذف ══════════════
  // خزينة واحدة فقط في النظام — القيد المزدوج (إيداع/سحب) يفترض وجودها دائماً
  async function ensureTreasuryAccount() {
    const accounts = await getAccounts();
    if (accounts.find(a => a.type === 'treasury')) return; // موجودة بالفعل
    await _sb.from('accounts').insert({
      id: CONFIG.TREASURY_ACCOUNT_ID, name: 'الخزينة', type: 'treasury',
      bal_usd: 0, bal_eur: 0, commission_rate: 0
    });
    invalidate('accounts');
    console.log('✅ تم إعادة إنشاء حساب الخزينة');
  }

  // يجلب كود حساب الأرباح الفعلي من قاعدة البيانات (ديناميكي — MIGRATION_V22)
  // يُستخدم لتحديث CONFIG.PROFIT_ACCOUNT_ID في كل صفحة عند initApp
  let _profitIdCache = null;
  async function getProfitAccountId() {
    if (_profitIdCache) return _profitIdCache;
    const { data, error } = await _sb.rpc('get_profit_account_id');
    if (error || !data) return CONFIG.PROFIT_ACCOUNT_ID; // احتياط: القيمة الثابتة القديمة
    _profitIdCache = data;
    return data;
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

  // ══ بوابة الزبون (MIGRATION_V34 — تحقق داخل القاعدة فقط) ══════
  // لا نجلب جدول accounts كاملاً هنا أبداً — كان هذا يُسرّب أرصدة
  // وPIN كل الزبائن لأي زائر لصفحة الدخول قبل أي تحقق. المقارنة
  // الآن تتم بالكامل داخل client_login()، ولا تُعاد سوى بيانات
  // الحساب المطابق نفسه.
  async function clientLogin(accountId, pin) {
    const { data, error } = await _sb.rpc('client_login', {
      p_account_id: accountId.trim(), p_pin: pin.trim()
    });
    if (error) { console.error('clientLogin:', error); return null; }
    return (data && data.ok) ? data.account : null;
  }

  // استعادة جلسة الزبون بعد أول دخول (تحديث الصفحة) — حساب واحد
  // فقط بلا PIN، وليس الجدول كاملاً (نفس مبدأ clientLogin أعلاه)
  async function getClientAccount(accountId) {
    const { data, error } = await _sb.rpc('client_get_account', { p_account_id: accountId });
    if (error) { console.error('getClientAccount:', error); return null; }
    return (data && data.ok) ? data.account : null;
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
    const { error } = await _sb.from('accounts')
      .update({ client_pin: hashed, client_pin_plain: plain })
      .eq('id', accountId);
    if (error) { console.error('regeneratePin update error:', error); return null; }
    invalidate('accounts');
    // تحقق فعلي بقراءة السطر من جديد — لا نكتفي بعدم وجود خطأ من Supabase،
    // لأن أعمدة مضافة حديثاً قد تُقبل صورياً دون أن تُخزَّن فعلياً إن لم يُحدَّث
    // Supabase schema cache بعد تشغيل الـ migration
    const { data: verify, error: vErr } = await _sb.from('accounts')
      .select('client_pin_plain').eq('id', accountId).single();
    if (vErr || !verify || verify.client_pin_plain !== plain) {
      console.error('regeneratePin: verification failed — القيمة لم تُحفظ فعلياً في قاعدة البيانات', vErr, verify);
      return null;
    }
    // نعيد الـ PIN كـ plain text — كما أنه محفوظ الآن أيضاً في client_pin_plain لعرضه لاحقاً
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
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

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

    const profit = accounts.find(a => a.id === CONFIG.PROFIT_ACCOUNT_ID);
    const customers = accounts.filter(a => a.type === 'customer');
    const companies = accounts.filter(a => a.type === 'company');

    // حساب الخزينة بدون الأرباح ولا حساب الخزينة الفعلي (القيد المزدوج)
    // — هذا المجموع يمثّل أرصدة الزبائن/الشركات فقط، وليس النقد الفعلي
    let tUsd = 0, tEur = 0;
    accounts.filter(a => a.id !== CONFIG.PROFIT_ACCOUNT_ID && a.id !== CONFIG.TREASURY_ACCOUNT_ID).forEach(a => {
      tUsd += parseFloat(a.bal_usd || 0);
      tEur += parseFloat(a.bal_eur || 0);
    });

    const nonStructural = a => a.id !== CONFIG.PROFIT_ACCOUNT_ID && a.id !== CONFIG.TREASURY_ACCOUNT_ID;
    const debtors   = accounts.filter(a => nonStructural(a) && (parseFloat(a.bal_usd||0) < 0 || parseFloat(a.bal_eur||0) < 0)).length;
    const creditors = accounts.filter(a => nonStructural(a) && (parseFloat(a.bal_usd||0) > 0 || parseFloat(a.bal_eur||0) > 0)).length;

    await _sb.from('daily_snapshots').insert({
      snapshot_date:   today,
      treasury_usd:    parseFloat(tUsd.toFixed(2)),
      treasury_eur:    parseFloat(tEur.toFixed(2)),
      profit_usd:      parseFloat(profit?.bal_usd || 0),
      profit_eur:      parseFloat(profit?.bal_eur || 0),
      total_accounts:  accounts.filter(a => a.id !== CONFIG.PROFIT_ACCOUNT_ID).length,
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

  // يجلب أقرب سجل رصيد محفوظ بتاريخ = اليوم المطلوب، أو أقرب يوم سابق له إن لم يوجد
  // (السجل يُحفظ عند أول دخول للوحة التحكم في ذلك اليوم، فهو يمثّل تقريباً
  // الرصيد الافتتاحي لذلك اليوم قبل بدء العمل)
  async function getSnapshotOnOrBefore(dateStr) {
    const { data } = await _sb
      .from('daily_snapshots')
      .select('*')
      .lte('snapshot_date', dateStr)
      .order('snapshot_date', { ascending: false })
      .limit(1);
    return (data && data[0]) || null;
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

  // تنبيه انخفاض رصيد الخزينة — بفحص "تبريد" 4 ساعات لتفادي التكرار
  // على كل تحميل صفحة (يُستدعى من UI.updateTreasury في كل صفحة)
  const _TREASURY_COOLDOWN_MS = 4 * 60 * 60 * 1000;
  async function checkTreasuryAlerts(usd, eur) {
    try {
      const settings = await getAlertSettings();
      const checks = [
        { cur: 'usd', sym: '$', val: usd, min: parseFloat(settings.treasury_min_usd || 0) },
        { cur: 'eur', sym: '€', val: eur, min: parseFloat(settings.treasury_min_eur || 0) }
      ];
      for (const c of checks) {
        if (c.min <= 0 || c.val >= c.min) continue;
        const type = 'treasury_low_' + c.cur;
        const { data: last } = await _sb.from('notifications')
          .select('created_at').eq('type', type)
          .order('created_at', { ascending: false }).limit(1).single();
        if (last && (Date.now() - new Date(last.created_at).getTime()) < _TREASURY_COOLDOWN_MS) continue;
        const shown = (typeof Currency !== 'undefined') ? Currency.formatMoney(c.val, c.sym) : c.sym + c.val.toFixed(2);
        const minShown = (typeof Currency !== 'undefined') ? Currency.formatMoney(c.min, c.sym) : c.sym + c.min.toFixed(2);
        await addNotification(type, '📉 انخفاض رصيد الخزينة',
          `رصيد الخزينة (${c.cur.toUpperCase()}) أصبح ${shown} — أقل من الحد الأدنى المحدد (${minShown})`, '📉');
      }
    } catch(e) { console.error('checkTreasuryAlerts:', e); }
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
    const [accounts, txns, deletedAccounts, notifications, alertSettings, currencies] = await Promise.all([
      getAccounts(), getTxns(),
      _sb.from('deleted_accounts').select('*').then(r => r.data || []),
      _sb.from('notifications').select('*').then(r => r.data || []),
      _sb.from('alert_settings').select('*').then(r => r.data || []),
      _sb.from('currencies').select('*').then(r => r.data || [])
    ]);
    const blob = new Blob([JSON.stringify({
      accounts, txns,
      deleted_accounts: deletedAccounts, notifications,
      alert_settings: alertSettings, currencies,
      exportedAt: new Date().toISOString(), version: '7.0'
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const _n = new Date();
    const _localToday = `${_n.getFullYear()}-${String(_n.getMonth()+1).padStart(2,'0')}-${String(_n.getDate()).padStart(2,'0')}`;
    a.download = 'SMGroup_Backup_' + _localToday + '.json';
    a.click();
  }

  // استعادة نسخة احتياطية عبر RPC آمنة (MIGRATION_V23) — ذرية،
  // تتحقق من admin فعلياً، وتحفظ لقطة أمان قبل أي حذف.
  async function restoreBackup(payload) {
    const { data, error } = await _sb.rpc('admin_restore_backup', {
      ..._callerCreds(),
      p_payload: payload
    });
    if (error) return { ok: false, error: error.message };
    invalidate();
    return data;
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
  getTreasuryTotals, getTreasuryWithoutProfit, getProfitBalance, getCashboxBalance, invalidate,
  deleteAccount, getRecyclableId, ensureProfitAccount, ensureTreasuryAccount, getProfitAccountId,

  // عمليات مالية ذرّية (V32)
  atomicDeposit, atomicWithdraw, atomicTransfer,
  atomicReverseDeposit, atomicReverseWithdraw, atomicReverseTransfer,
  renameStructuralAccountId,

  // transactions
  getTxns, saveTxn, updateTxn, deleteTxn, getTxnById, getTxnByParent,

  // users
  getUsers, saveUser, deleteUser, updateUserPass, updateOwnPass,
  updateUserPermissions, updateUserRole, findUser, hashPassword, setNavStyleRemote,

  // settings
  getAlertSettings, saveAlertSettings,

  // client portal
  clientLogin, getClientAccount, publishClientView, publishAllClients, regeneratePin, getClientTxns,

  // daily snapshots
  saveDailySnapshot, getSnapshots, getSnapshotOnOrBefore,

  // notifications
  addNotification, getNotifications, markNotifRead, markAllNotifsRead, checkTreasuryAlerts,

  // misc
  logAction,
  exportBackup, restoreBackup,
  getAuditLogs,
  getDeletedAccounts
};
})();
