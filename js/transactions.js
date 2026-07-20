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

  // ══ إيداع ════════════════════════════════════════════
  async function deposit(accountId, currency, amount) {
    if (!accountId)             return { ok: false, error: 'اختر الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };

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

    if (commission > 0) await _saveCommissionEntry(accountId, currency, commission, txnId);

    await Storage.logAction('deposit', { accountId, currency, amount, commission, netAmount });
    Storage.invalidate();
    return { ok: true, commission, netAmount };
  }

  // ══ سحب ══════════════════════════════════════════════
  async function withdraw(accountId, currency, amount, forceOverdraft = false) {
    if (!accountId)             return { ok: false, error: 'اختر الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };

    const currentBal = await Storage.getBalance(accountId, currency);
    if (!forceOverdraft && currentBal < amount) {
      return {
        ok: false, needsConfirm: true, currentBal,
        error: 'رصيد الحساب (' + currentBal.toFixed(2) + ') غير كافٍ'
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

    await Storage.logAction('withdraw', { accountId, currency, amount });
    Storage.invalidate();
    return { ok: true };
  }

  // ══ تحويل ════════════════════════════════════════════
  async function transfer(fromId, toId, currency, amount, rate = 1, forceOverdraft = false) {
    if (!fromId)                return { ok: false, error: 'اختر حساب المرسل' };
    if (!toId)                  return { ok: false, error: 'اختر حساب المستقبل' };
    if (fromId === toId)        return { ok: false, error: 'لا يمكن التحويل لنفس الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };

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
        error: 'رصيد المرسل (' + senderBal.toFixed(2) + ') غير كافٍ'
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
    return { ok: true, commission, netReceived };
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

    } else if (t.type === 'wit') {
      await Storage.updateBalance(t.acc, cur, amt);

    } else if (t.type === 'trf') {
      const r           = parseFloat(t.rate || 1);
      const gross       = parseFloat((amt * r).toFixed(2));
      const commission  = parseFloat(t.commission_amt || 0);
      const netReceived = parseFloat((gross - commission).toFixed(2));
      await Storage.updateBalance(t.acc || t.from, cur,  amt);
      await Storage.updateBalance(t.to,             cur, -netReceived);
    }

    // ── 2. عكس العمولة المرتبطة ──────────────────────
    const commAmt = parseFloat(t.commission_amt || 0);
    if (commAmt > 0) {
      const commEntries = await Storage.getTxnByParent(txnId);
      for (const ce of commEntries) {
        if (ce.is_deleted) continue;
        // إذا كانت الحركة لحساب الأرباح — اعكس رصيده
        if (ce.acc === CONFIG.PROFIT_ACCOUNT_ID) {
          await Storage.updateBalance(CONFIG.PROFIT_ACCOUNT_ID, cur, -parseFloat(ce.amt || 0));
        }
        await Storage.deleteTxn(ce.id, by);
      }
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
