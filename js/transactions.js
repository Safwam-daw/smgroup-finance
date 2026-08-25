/**
 * transactions.js — SM-Group v6.3
 * العمليات المالية — بدون atomic RPC، مع حذف العمولة المرتبطة
 */

const Transactions = (() => {

  async function getBalance(accountId, currency) {
    return Storage.getBalance(accountId, currency);
  }

  async function getTreasuryTotals() {
    return Storage.getTreasuryTotals();
  }

  // ── حساب العمولة ─────────────────────────────────────
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

  // ── تسجيل حركتَي العمولة ─────────────────────────────
  async function _saveCommissionEntry(accountId, currency, commission, parentId) {
    if (commission <= 0) return;
    const now   = new Date().toISOString();
    const feeId = Date.now() + 1;
    const by    = Auth.getUser()?.user || 'system';

    // خصم العمولة من المتلقي
    await Storage.saveTxn({
      id: feeId, type: 'fee', acc: accountId,
      cur: currency, amt: commission, commission_amt: 0,
      is_commission_entry: true, parent_id: parentId,
      by, date: now, note: 'عمولة تلقائية'
    });

    // إضافة العمولة لحساب الأرباح
    await Storage.saveTxn({
      id: feeId + 1, type: 'dep', acc: CONFIG.PROFIT_ACCOUNT_ID,
      cur: currency, amt: commission, commission_amt: 0,
      is_commission_entry: true, parent_id: parentId,
      by: 'system', date: now, note: 'عمولة من حساب ' + accountId
    });

    // تحديث رصيد الأرباح
    await Storage.updateBalance(CONFIG.PROFIT_ACCOUNT_ID, currency, commission);
  }

  // ── تسجيل حركة مرئية لحساب الخزينة (نفس فكرة حركة العمولة) ──
  // بدون هذا، تتحرك أرقام الخزينة لكن لا يظهر أي سجل حركات عند فتح
  // حسابها — فقط تحديث رصيد صامت.
  async function _saveTreasuryEntry(txType, currency, amount, parentId, note) {
    if (!amount || amount <= 0) return;
    const now = new Date().toISOString();
    const entryId = Date.now() + 3; // معرّف مختلف عن معرّفَي حركة العمولة (+1/+2) لتفادي التعارض
    await Storage.saveTxn({
      id: entryId, type: txType, acc: CONFIG.TREASURY_ACCOUNT_ID,
      cur: currency, amt: amount, commission_amt: 0,
      is_commission_entry: true, parent_id: parentId,
      by: 'system', date: now, note
    });
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

  // ══ إيداع ════════════════════════════════════════════
  async function deposit(accountId, currency, amount) {
    if (!accountId)             return { ok: false, error: 'اختر الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };
    if (accountId === CONFIG.TREASURY_ACCOUNT_ID)
      return { ok: false, error: 'رصيد الخزينة يتحرك تلقائياً مع كل عملية — لا يمكن الإيداع فيه مباشرة' };

    const commission = await _calcCommission(accountId, amount);
    const netAmount  = parseFloat((amount - commission).toFixed(2));
    const txnId      = Date.now();
    const by         = Auth.getUser()?.user || '?';
    const now        = new Date().toISOString();

    const saved = await Storage.saveTxn({
      id: txnId, type: 'dep', acc: accountId,
      cur: currency, amt: amount,
      commission_amt: commission,
      is_commission_entry: false, parent_id: null,
      by, date: now, note: ''
    });
    if (!saved) return { ok: false, error: 'خطأ في الحفظ' };

    const balOk = await Storage.updateBalance(accountId, currency, netAmount);
    if (!balOk) return { ok: false, error: 'خطأ في تحديث الرصيد' };

    // قيد الخزينة المقابل (double-entry): الخزينة استلمت المبلغ الكامل نقداً
    // من الزبون — تصبح أكثر سالبية (اصطلاح: سالب = الخزينة لديها نقد)
    await Storage.updateBalance(CONFIG.TREASURY_ACCOUNT_ID, currency, -amount);
    await _saveTreasuryEntry('dep', currency, amount, txnId, 'إيداع من حساب ' + accountId);

    if (commission > 0) await _saveCommissionEntry(accountId, currency, commission, txnId);

    await Storage.logAction('deposit', { accountId, currency, amount, commission, netAmount });
    Storage.invalidate();
    _checkTxnAlerts('إيداع', accountId, currency, amount);
    return { ok: true, id: txnId, commission, netAmount };
  }

  // ══ سحب ══════════════════════════════════════════════
  async function withdraw(accountId, currency, amount, forceOverdraft = false) {
    if (!accountId)             return { ok: false, error: 'اختر الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };
    if (accountId === CONFIG.TREASURY_ACCOUNT_ID)
      return { ok: false, error: 'رصيد الخزينة يتحرك تلقائياً مع كل عملية — لا يمكن السحب منه مباشرة' };

    const currentBal = await Storage.getBalance(accountId, currency);
    if (!forceOverdraft && currentBal < amount) {
      return {
        ok: false, needsConfirm: true, currentBal,
        error: 'رصيد الحساب (' + (typeof Currency !== 'undefined' ? Currency.formatNumber(currentBal) : currentBal.toFixed(2)) + ') غير كافٍ'
      };
    }

    const txnId = Date.now();
    const by    = Auth.getUser()?.user || '?';
    const now   = new Date().toISOString();

    const saved = await Storage.saveTxn({
      id: txnId, type: 'wit', acc: accountId,
      cur: currency, amt: amount,
      commission_amt: 0,
      is_commission_entry: false, parent_id: null,
      by, date: now, note: ''
    });
    if (!saved) return { ok: false, error: 'خطأ في الحفظ' };

    const balOk = await Storage.updateBalance(accountId, currency, -amount);
    if (!balOk) return { ok: false, error: 'خطأ في تحديث الرصيد' };

    // قيد الخزينة المقابل: الخزينة دفعت المبلغ نقداً للزبون —
    // تصبح أكثر إيجابية (اصطلاح: موجب = الخزينة تحتاج نقداً)
    await Storage.updateBalance(CONFIG.TREASURY_ACCOUNT_ID, currency, amount);
    await _saveTreasuryEntry('wit', currency, amount, txnId, 'سحب من حساب ' + accountId);

    await Storage.logAction('withdraw', { accountId, currency, amount });
    Storage.invalidate();
    _checkTxnAlerts('سحب', accountId, currency, amount, currentBal - amount);
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

    const r           = parseFloat(rate) || 1;
    const gross       = parseFloat((amount * r).toFixed(2));
    const commission  = await _calcCommission(toId, gross);
    const netReceived = parseFloat((gross - commission).toFixed(2));
    const txnId       = Date.now();
    const by          = Auth.getUser()?.user || '?';
    const now         = new Date().toISOString();

    const senderBal = await Storage.getBalance(fromId, currency);
    if (!forceOverdraft && senderBal < amount) {
      return {
        ok: false, needsConfirm: true, currentBal: senderBal,
        error: 'رصيد المرسل (' + (typeof Currency !== 'undefined' ? Currency.formatNumber(senderBal) : senderBal.toFixed(2)) + ') غير كافٍ'
      };
    }

    // تسجيل العملية — from وto مطلوبان لعرض الطرف الآخر في كشف الحساب
    const saved = await Storage.saveTxn({
      id: txnId, type: 'trf',
      acc: fromId, from: fromId, to: toId,
      cur: currency, amt: amount,
      rate: r, commission_amt: commission,
      is_commission_entry: false, parent_id: null,
      by, date: now, note: ''
    });
    if (!saved) return { ok: false, error: 'خطأ في الحفظ' };

    const debitOk = await Storage.updateBalance(fromId, currency, -amount);
    if (!debitOk) return { ok: false, error: 'خطأ في خصم رصيد المرسل' };

    const creditOk = await Storage.updateBalance(toId, currency, netReceived);
    if (!creditOk) return { ok: false, error: 'خطأ في إضافة رصيد المستقبل' };

    if (commission > 0) await _saveCommissionEntry(toId, currency, commission, txnId);

    await Storage.logAction('transfer', { fromId, toId, currency, amount, rate: r, commission, netReceived });
    Storage.invalidate();
    _checkTxnAlerts('تحويل', fromId, currency, amount, senderBal - amount);
    return { ok: true, id: txnId, commission, netReceived };
  }

  // ══ حذف عملية — soft delete + عكس الرصيد + حذف العمولة المرتبطة ══
  async function deleteTxn(txnId) {
    if (!Auth.can('canDelete')) return { ok: false, error: 'ليس لديك صلاحية الحذف' };

    const t = await Storage.getTxnById(txnId);
    if (!t)               return { ok: false, error: 'العملية غير موجودة' };
    if (t.is_commission_entry)
      return { ok: false, error: 'لا يمكن حذف حركة عمولة مباشرة — احذف العملية الأصلية' };
    if (t.is_deleted)     return { ok: false, error: 'العملية محذوفة مسبقاً' };

    const by  = Auth.getUser()?.user || '?';
    const cur = t.cur;
    const amt = parseFloat(t.amt);

    // ── 1. عكس الرصيد الرئيسي ────────────────────────
    if (t.type === 'dep') {
      const net = parseFloat((amt - parseFloat(t.commission_amt || 0)).toFixed(2));
      await Storage.updateBalance(t.acc, cur, -net);
      // عكس قيد الخزينة المقابل (كانت قد نقصت بالمبلغ الكامل عند الإيداع)
      await Storage.updateBalance(CONFIG.TREASURY_ACCOUNT_ID, cur, amt);

    } else if (t.type === 'wit') {
      await Storage.updateBalance(t.acc, cur, amt);
      // عكس قيد الخزينة المقابل (كانت قد زادت بالمبلغ عند السحب)
      await Storage.updateBalance(CONFIG.TREASURY_ACCOUNT_ID, cur, -amt);

    } else if (t.type === 'trf') {
      const r           = parseFloat(t.rate || 1);
      const gross       = parseFloat((amt * r).toFixed(2));
      const commission  = parseFloat(t.commission_amt || 0);
      const netReceived = parseFloat((gross - commission).toFixed(2));
      await Storage.updateBalance(t.acc || t.from, cur,  amt);
      await Storage.updateBalance(t.to,             cur, -netReceived);
    }

    // ── 2. عكس أي حركات فرعية مرتبطة (عمولة و/أو حركة خزينة) ──
    // بلا شرط على وجود عمولة — حركة الخزينة تُنشأ في كل إيداع/سحب بغض
    // النظر عن العمولة، ويجب تنظيفها دائماً عند حذف العملية الأصلية.
    const linkedEntries = await Storage.getTxnByParent(txnId);
    for (const ce of linkedEntries) {
      if (ce.is_deleted) continue;
      // إذا كانت الحركة لحساب الأرباح — اعكس رصيده (حركة الخزينة عُكس
      // رصيدها بالفعل أعلاه ضمن الخطوة 1، فلا تحتاج عكساً إضافياً هنا)
      if (ce.acc === CONFIG.PROFIT_ACCOUNT_ID) {
        await Storage.updateBalance(CONFIG.PROFIT_ACCOUNT_ID, cur, -parseFloat(ce.amt || 0));
      }
      await Storage.deleteTxn(ce.id, by);
    }

    // ── 3. حذف العملية الأصلية ───────────────────────
    const ok = await Storage.deleteTxn(txnId, by);
    if (!ok) return { ok: false, error: 'خطأ في الإلغاء' };

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
