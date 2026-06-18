/**
 * transactions.js — SM-Group v6.0
 * العمليات المالية ذرية — تنجح كاملاً أو تفشل كاملاً
 */

const Transactions = (() => {

  async function getBalance(accountId, currency) {
    return Storage.getBalance(accountId, currency);
  }

  async function getTreasuryTotals() {
    return Storage.getTreasuryTotals();
  }

  // حساب العمولة — المعدل بالنسبة المئوية (0.025 = 0.025%)
  async function _calcCommission(accountId, amount) {
    const accounts = await Storage.getAccounts();
    const acc = accounts.find(a => a.id === accountId);
    if (!acc || acc.type !== 'customer') return 0;
    const ratePct = parseFloat(acc.commission_rate ?? 0.025);
    if (!ratePct) return 0;
    const raw = parseFloat((amount * ratePct / 100).toFixed(2));
    return raw >= 0.01 ? raw : 0;
  }

  // تسجيل العمولة كحركة مرئية — تبقى منفصلة لأنها ليست جزء من العملية الأصلية
  async function _saveCommissionEntry(accountId, currency, commission, parentId) {
    if (commission <= 0) return;
    const now   = new Date().toISOString();
    const feeId = Date.now() + 1;
    await Storage.saveTxn({
      id: feeId, type: 'fee', acc: accountId,
      cur: currency, amt: commission, commission_amt: 0,
      is_commission_entry: true, parent_id: parentId,
      by: 'system', date: now, note: 'عمولة تلقائية'
    });
    await Storage.saveTxn({
      id: feeId + 1, type: 'dep', acc: '9999',
      cur: currency, amt: commission, commission_amt: 0,
      is_commission_entry: false, parent_id: parentId,
      by: 'system', date: now, note: `عمولة من حساب ${accountId}`
    });
    await Storage.updateBalance('9999', currency, commission);
  }

  // ══ إيداع ذري ═══════════════════════════════════════════
  async function deposit(accountId, currency, amount) {
    if (!accountId) return { ok:false, error:'اختر الحساب' };
    if (!amount || amount <= 0) return { ok:false, error:'أدخل مبلغاً صحيحاً' };

    const commission = await _calcCommission(accountId, amount);
    const netAmount  = parseFloat((amount - commission).toFixed(2));
    const txnId      = Date.now();
    const by         = Auth.getUser()?.user || '?';

    const { data, error } = await window._sb.rpc('atomic_deposit', {
      p_txn_id:     txnId,
      p_account_id: accountId,
      p_currency:   currency,
      p_amount:     amount,
      p_commission: commission,
      p_net_amount: netAmount,
      p_by:         by,
      p_date:       new Date().toISOString()
    });

    if (error || !data?.ok) {
      console.error('atomic_deposit:', error || data);
      return { ok:false, error:'خطأ في الحفظ' };
    }

    if (commission > 0) await _saveCommissionEntry(accountId, currency, commission, txnId);
    await Storage.logAction('deposit', { accountId, currency, amount, commission, netAmount });
    Storage.invalidate();
    return { ok:true, commission, netAmount };
  }

  // ══ سحب ذري ══════════════════════════════════════════════
  async function withdraw(accountId, currency, amount, forceOverdraft=false) {
    if (!accountId) return { ok:false, error:'اختر الحساب' };
    if (!amount || amount <= 0) return { ok:false, error:'أدخل مبلغاً صحيحاً' };

    const by = Auth.getUser()?.user || '?';

    const { data, error } = await window._sb.rpc('atomic_withdraw', {
      p_txn_id:     Date.now(),
      p_account_id: accountId,
      p_currency:   currency,
      p_amount:     amount,
      p_by:         by,
      p_date:       new Date().toISOString(),
      p_force:      forceOverdraft
    });

    if (error) {
      console.error('atomic_withdraw:', error);
      return { ok:false, error:'خطأ في الحفظ' };
    }

    if (!data?.ok) {
      const currentBal = parseFloat(data?.balance || 0);
      return { ok:false, needsConfirm:true, currentBal,
               error:`رصيد الحساب (${currentBal.toFixed(2)}) غير كافٍ` };
    }

    await Storage.logAction('withdraw', { accountId, currency, amount });
    Storage.invalidate();
    return { ok:true };
  }

  // ══ تحويل ذري ════════════════════════════════════════════
  async function transfer(fromId, toId, currency, amount, rate=1, forceOverdraft=false) {
    if (!fromId) return { ok:false, error:'اختر حساب المرسل' };
    if (!toId)   return { ok:false, error:'اختر حساب المستقبل' };
    if (fromId === toId) return { ok:false, error:'لا يمكن التحويل لنفس الحساب' };
    if (!amount || amount <= 0) return { ok:false, error:'أدخل مبلغاً صحيحاً' };

    const r           = parseFloat(rate) || 1;
    const gross       = parseFloat((amount * r).toFixed(2));
    const commission  = await _calcCommission(toId, gross);
    const netReceived = parseFloat((gross - commission).toFixed(2));
    const txnId       = Date.now();
    const by          = Auth.getUser()?.user || '?';

    const { data, error } = await window._sb.rpc('atomic_transfer', {
      p_txn_id:       txnId,
      p_from_id:      fromId,
      p_to_id:        toId,
      p_currency:     currency,
      p_amount:       amount,
      p_rate:         r,
      p_commission:   commission,
      p_net_received: netReceived,
      p_by:           by,
      p_date:         new Date().toISOString(),
      p_force:        forceOverdraft
    });

    if (error) {
      console.error('atomic_transfer:', error);
      return { ok:false, error:'خطأ في الحفظ' };
    }

    if (!data?.ok) {
      const currentBal = parseFloat(data?.balance || 0);
      return { ok:false, needsConfirm:true, currentBal,
               error:`رصيد المرسل (${currentBal.toFixed(2)}) غير كافٍ` };
    }

    if (commission > 0) await _saveCommissionEntry(toId, currency, commission, txnId);
    await Storage.logAction('transfer', { fromId, toId, currency, amount, rate:r, commission, netReceived });
    Storage.invalidate();
    return { ok:true, commission, netReceived };
  }

  // ══ إلغاء عملية (soft delete + عكس الرصيد — ذري بالكامل) ══
  async function deleteTxn(txnId) {
    if (!Auth.can('canDelete')) return { ok:false, error:'ليس لديك صلاحية الحذف' };

    // تحقق مبدئي: هل العملية موجودة وليست حركة عمولة
    const t = await Storage.getTxnById(txnId);
    if (!t)                  return { ok:false, error:'العملية غير موجودة' };
    if (t.is_commission_entry)
      return { ok:false, error:'لا يمكن حذف حركة عمولة مباشرة — احذف العملية الأصلية' };

    const by = Auth.getUser()?.user || '?';

    // اختر الدالة الذرية المناسبة حسب نوع العملية
    const rpcMap = {
      dep: 'atomic_reverse_deposit',
      wit: 'atomic_reverse_withdraw',
      trf: 'atomic_reverse_transfer',
    };
    const fn = rpcMap[t.type];
    if (!fn) return { ok:false, error:`نوع عملية غير معروف: ${t.type}` };

    const { data, error } = await window._sb.rpc(fn, {
      p_txn_id:     parseInt(txnId),
      p_deleted_by: by,
    });

    if (error) {
      console.error(`${fn}:`, error);
      return { ok:false, error: error.message || 'خطأ في الإلغاء' };
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data;
    if (!result?.ok) return { ok:false, error: result?.error || 'خطأ في الإلغاء' };

    await Storage.logAction('delete', { txnId, type: t.type });
    Storage.invalidate();
    return { ok:true };
  }

  async function updateNote(txnId, note) {
    if (!Auth.can('canEdit')) return { ok:false, error:'ليس لديك صلاحية التعديل' };
    const ok = await Storage.updateTxn(txnId, { note });
    return ok ? { ok:true } : { ok:false, error:'خطأ في التعديل' };
  }

  async function getAll(filters={}) { return Storage.getTxns(filters); }

  return { getBalance, getTreasuryTotals, deposit, withdraw, transfer, deleteTxn, updateNote, getAll };
})();
