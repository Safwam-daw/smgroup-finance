/**
 * transactions.js — SM-Group v7 (MIGRATION_V32 — عودة للـ atomic RPC)
 * كل عملية مالية = استدعاء RPC ذرّي واحد (راجع MIGRATION_V32_ATOMIC_RESTORE.sql):
 * الحركة الرئيسية + قيد الخزينة المقابل + قيد العمولة كلها داخل نفس
 * الـ transaction في القاعدة. لا سلسلة استدعاءات منفصلة من الواجهة،
 * ولا قراءة-ثم-تعديل — فحص الرصيد وتنفيذ التحديث يحدثان معاً داخل
 * نفس الدالة مع قفل صفوف (FOR UPDATE)، فلا race condition ممكن.
 */

const Transactions = (() => {

  async function getBalance(accountId, currency) {
    return Storage.getBalance(accountId, currency);
  }

  async function getTreasuryTotals() {
    return Storage.getTreasuryTotals();
  }

  // ── حساب العمولة (منطق عمل، يبقى في الواجهة كما كان سابقاً) ──
  async function _calcCommission(accountId, amount) {
    // حساب الأرباح لا يُفرض عليه عمولة أبداً — بغض النظر عن قيمة
    // حقل type في قاعدة البيانات (حماية إضافية بجانب التحقق من النوع)
    if (accountId === CONFIG.PROFIT_ACCOUNT_ID) return 0;
    const accounts = await Storage.getAccounts();
    const acc = accounts.find(a => a.id === accountId);
    if (!acc || acc.type !== 'customer') return 0;
    const ratePct = parseFloat(acc.commission_rate ?? 0.025);
    if (!ratePct) return 0;
    const raw = parseFloat((amount * ratePct / 100).toFixed(2));
    return raw >= 0.01 ? raw : 0;
  }

  // ── تنبيهات استباقية: رصيد سالب + عملية كبيرة (MIGRATION_V24) ──
  // resultingBal: مرّرها فقط عند عملية قد تُنتج رصيداً سالباً (سحب/تحويل)
  async function _checkTxnAlerts(kind, accountId, currency, amount, resultingBal) {
    try {
      const settings = await Storage.getAlertSettings();
      const by  = Auth.getUser()?.user || 'system';
      const sym = await Currency.symbol(currency);

      if (resultingBal !== undefined && resultingBal < 0) {
        const accounts = await Storage.getAccounts();
        const acc = accounts.find(a => a.id === accountId);
        await Storage.addNotification('negative_balance',
          '⚠️ رصيد سالب',
          `الحساب "${acc?.name || accountId}" أصبح برصيد ${Currency.formatMoney(resultingBal, sym)} بعد عملية ${kind} بواسطة ${by}`,
          '⚠️');
      }

      const threshold = parseFloat(settings.large_txn_threshold || 0);
      if (threshold > 0 && amount >= threshold) {
        await Storage.addNotification('large_txn',
          '💰 عملية مالية كبيرة',
          `عملية ${kind} بقيمة ${Currency.formatMoney(amount, sym)} بواسطة ${by}`,
          '💰');
      }
    } catch (e) { console.error('checkTxnAlerts:', e); }
  }

  // رسائل خطأ من القاعدة (RPC) إلى نص عربي مفهوم
  function _dbErrorMessage(code, fallback) {
    const map = {
      invalid_amount:        'أدخل مبلغاً صحيحاً',
      cannot_target_treasury:'حساب الخزينة يتحرك تلقائياً مع كل عملية — لا يمكن التعامل معه مباشرة',
      insufficient_balance:  'الرصيد غير كافٍ',
      no_profit_account:     'لا يوجد حساب أرباح — راجع الإعدادات',
      same_account:          'لا يمكن التحويل لنفس الحساب',
      db_error:              'خطأ في الاتصال بقاعدة البيانات',
    };
    return map[code] || fallback || 'خطأ في تنفيذ العملية';
  }

  // ══ إيداع ════════════════════════════════════════════
  async function deposit(accountId, currency, amount) {
    if (!accountId)             return { ok: false, error: 'اختر الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };
    if (accountId === CONFIG.TREASURY_ACCOUNT_ID)
      return { ok: false, error: 'رصيد الخزينة يتحرك تلقائياً مع كل عملية — لا يمكن الإيداع فيه مباشرة' };

    const commission = await _calcCommission(accountId, amount);
    const txnId       = Date.now();
    const by          = Auth.getUser()?.user || '?';
    const now         = new Date().toISOString();

    const result = await Storage.atomicDeposit(txnId, accountId, currency, amount, commission, by, now, '');
    if (!result.ok) return { ok: false, error: _dbErrorMessage(result.error) };

    await Storage.logAction('deposit', { accountId, currency, amount, commission, netAmount: result.net_amount });
    Storage.invalidate();
    _checkTxnAlerts('إيداع', accountId, currency, amount);
    return { ok: true, id: txnId, commission, netAmount: result.net_amount };
  }

  // ══ سحب ══════════════════════════════════════════════
  async function withdraw(accountId, currency, amount, forceOverdraft = false) {
    if (!accountId)             return { ok: false, error: 'اختر الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };
    if (accountId === CONFIG.TREASURY_ACCOUNT_ID)
      return { ok: false, error: 'رصيد الخزينة يتحرك تلقائياً مع كل عملية — لا يمكن السحب منه مباشرة' };

    const txnId = Date.now();
    const by    = Auth.getUser()?.user || '?';
    const now   = new Date().toISOString();

    const result = await Storage.atomicWithdraw(txnId, accountId, currency, amount, by, now, forceOverdraft, '');
    if (!result.ok) {
      if (result.error === 'insufficient_balance') {
        return {
          ok: false, needsConfirm: true, currentBal: result.balance,
          error: 'رصيد الحساب (' + (typeof Currency !== 'undefined' ? Currency.formatNumber(result.balance) : result.balance.toFixed(2)) + ') غير كافٍ'
        };
      }
      return { ok: false, error: _dbErrorMessage(result.error) };
    }

    await Storage.logAction('withdraw', { accountId, currency, amount });
    Storage.invalidate();
    const newBal = await Storage.getBalance(accountId, currency);
    _checkTxnAlerts('سحب', accountId, currency, amount, newBal);
    return { ok: true, id: txnId };
  }

  // ══ تحويل ════════════════════════════════════════════
  async function transfer(fromId, toId, currency, amount, rate = 1, forceOverdraft = false) {
    if (!fromId)                return { ok: false, error: 'اختر حساب المرسل' };
    if (!toId)                  return { ok: false, error: 'اختر حساب المستقبل' };
    if (fromId === toId)        return { ok: false, error: 'لا يمكن التحويل لنفس الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };
    if (fromId === CONFIG.TREASURY_ACCOUNT_ID || toId === CONFIG.TREASURY_ACCOUNT_ID)
      return { ok: false, error: 'حساب الخزينة يتحرك تلقائياً مع كل عملية — لا يمكن التحويل منه أو إليه مباشرة' };

    const r          = parseFloat(rate) || 1;
    const gross      = parseFloat((amount * r).toFixed(2));
    const commission = await _calcCommission(toId, gross);
    const txnId      = Date.now();
    const by         = Auth.getUser()?.user || '?';
    const now        = new Date().toISOString();

    const result = await Storage.atomicTransfer(txnId, fromId, toId, currency, amount, r, commission, by, now, forceOverdraft);
    if (!result.ok) {
      if (result.error === 'insufficient_balance') {
        return {
          ok: false, needsConfirm: true, currentBal: result.balance,
          error: 'رصيد المرسل (' + (typeof Currency !== 'undefined' ? Currency.formatNumber(result.balance) : result.balance.toFixed(2)) + ') غير كافٍ'
        };
      }
      return { ok: false, error: _dbErrorMessage(result.error) };
    }

    await Storage.logAction('transfer', { fromId, toId, currency, amount, rate: r, commission, netReceived: result.net_received });
    Storage.invalidate();
    const senderNewBal = await Storage.getBalance(fromId, currency);
    _checkTxnAlerts('تحويل', fromId, currency, amount, senderNewBal);
    return { ok: true, id: txnId, commission, netReceived: result.net_received };
  }

  // ══ حذف عملية — عكس ذرّي عبر RPC حسب النوع ═══════════════
  async function deleteTxn(txnId) {
    if (!Auth.can('canDelete')) return { ok: false, error: 'ليس لديك صلاحية الحذف' };

    const t = await Storage.getTxnById(txnId);
    if (!t)               return { ok: false, error: 'العملية غير موجودة' };
    if (t.is_commission_entry)
      return { ok: false, error: 'لا يمكن حذف حركة عمولة مباشرة — احذف العملية الأصلية' };
    if (t.is_deleted)     return { ok: false, error: 'العملية محذوفة مسبقاً' };

    const by = Auth.getUser()?.user || '?';
    let result;

    if (t.type === 'dep')      result = await Storage.atomicReverseDeposit(txnId, by);
    else if (t.type === 'wit') result = await Storage.atomicReverseWithdraw(txnId, by);
    else if (t.type === 'trf') result = await Storage.atomicReverseTransfer(txnId, by);
    else return { ok: false, error: 'نوع عملية غير مدعوم للحذف' };

    if (!result.ok) return { ok: false, error: _dbErrorMessage(result.error, 'خطأ في الإلغاء') };

    await Storage.logAction('delete', { txnId, type: t.type });
    Storage.invalidate();
    return { ok: true };
  }

  async function updateNote(txnId, note) {
    if (!Auth.can('canEdit')) return { ok: false, error: 'ليس لديك صلاحية التعديل' };
    const ok = await Storage.updateTxn(txnId, { note });
    return ok ? { ok: true } : { ok: false, error: 'خطأ في التعديل' };
  }

  async function updateDate(txnId, newDateIso, oldDateIso) {
    if (!Auth.can('canEdit')) return { ok: false, error: 'ليس لديك صلاحية التعديل' };
    const ok = await Storage.updateTxn(txnId, { date: newDateIso });
    if (ok) {
      await Storage.logAction('edit_txn_date', { txnId }, oldDateIso, newDateIso);
    }
    return ok ? { ok: true } : { ok: false, error: 'خطأ في تعديل التاريخ' };
  }

  async function getAll(filters = {}) { return Storage.getTxns(filters); }

  return { getBalance, getTreasuryTotals, deposit, withdraw, transfer, deleteTxn, updateNote, updateDate, getAll };
})();
