/**
 * transactions.js — SM-Group v5.2
 * العمولة تظهر كحركة مرئية منفصلة في الحساب
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

  // تسجيل العمولة كحركة مرئية في الحساب
  async function _saveCommissionEntry(accountId, currency, commission, parentId) {
    if (commission <= 0) return;
    const now = new Date().toISOString();
    const feeId = Date.now() + 1;
    // حركة fee في حساب الزبون (خصم)
    await Storage.saveTxn({
      id:                  feeId,
      type:                'fee',
      acc:                 accountId,
      cur:                 currency,
      amt:                 commission,
      commission_amt:      0,
      is_commission_entry: true,
      parent_id:           parentId,
      by:                  'system',
      date:                now,
      note:                'عمولة إيداع تلقائية'
    });
    // حركة dep في حساب الأرباح (إضافة)
    await Storage.saveTxn({
      id:                  feeId + 1,
      type:                'dep',
      acc:                 '9999',
      cur:                 currency,
      amt:                 commission,
      commission_amt:      0,
      is_commission_entry: false,
      parent_id:           parentId,
      by:                  'system',
      date:                now,
      note:                `عمولة من حساب ${accountId}`
    });
    // تحديث رصيد حساب الأرباح
    await Storage.updateBalance('9999', currency, commission);
  }

  async function deposit(accountId, currency, amount) {
    if (!accountId) return { ok:false, error:'اختر الحساب' };
    if (!amount || amount <= 0) return { ok:false, error:'أدخل مبلغاً صحيحاً' };

    const commission = await _calcCommission(accountId, amount);
    const netAmount  = parseFloat((amount - commission).toFixed(2));
    const txnId      = Date.now();

    const ok = await Storage.saveTxn({
      id: txnId, type:'dep', acc:accountId,
      cur:currency, amt:amount, commission_amt:commission,
      is_commission_entry:false, parent_id:null,
      by:Auth.getUser()?.user||'?',
      date:new Date().toISOString(), note:''
    });
    if (!ok) return { ok:false, error:'خطأ في الحفظ' };

    await Storage.updateBalance(accountId, currency, netAmount);

    // حركة العمولة المرئية
    if (commission > 0) {
      await _saveCommissionEntry(accountId, currency, commission, txnId);
    }

    // سجل التدقيق
    await Storage.logAction('deposit', { accountId, currency, amount, commission, netAmount });

    return { ok:true, commission, netAmount };
  }

  async function withdraw(accountId, currency, amount, forceOverdraft=false) {
    if (!accountId) return { ok:false, error:'اختر الحساب' };
    if (!amount || amount <= 0) return { ok:false, error:'أدخل مبلغاً صحيحاً' };
    const currentBal = await Storage.getBalance(accountId, currency);
    if (amount > currentBal && !forceOverdraft)
      return { ok:false, needsConfirm:true, currentBal,
               error:`رصيد الحساب (${currentBal.toFixed(2)}) غير كافٍ` };

    const txnId = Date.now();
    const ok = await Storage.saveTxn({
      id:txnId, type:'wit', acc:accountId,
      cur:currency, amt:amount, commission_amt:0,
      is_commission_entry:false, parent_id:null,
      by:Auth.getUser()?.user||'?',
      date:new Date().toISOString(), note:''
    });
    if (!ok) return { ok:false, error:'خطأ في الحفظ' };
    await Storage.updateBalance(accountId, currency, -amount);
    await Storage.logAction('withdraw', { accountId, currency, amount });
    return { ok:true };
  }

  async function transfer(fromId, toId, currency, amount, rate=1, forceOverdraft=false) {
    if (!fromId) return { ok:false, error:'اختر حساب المرسل' };
    if (!toId)   return { ok:false, error:'اختر حساب المستقبل' };
    if (fromId===toId) return { ok:false, error:'لا يمكن التحويل لنفس الحساب' };
    if (!amount||amount<=0) return { ok:false, error:'أدخل مبلغاً صحيحاً' };

    const currentBal = await Storage.getBalance(fromId, currency);
    if (amount > currentBal && !forceOverdraft)
      return { ok:false, needsConfirm:true, currentBal,
               error:`رصيد المرسل (${currentBal.toFixed(2)}) غير كافٍ` };

    const r           = parseFloat(rate)||1;
    const gross       = parseFloat((amount*r).toFixed(2));
    const commission  = await _calcCommission(toId, gross);
    const netReceived = parseFloat((gross-commission).toFixed(2));
    const txnId       = Date.now();

    const ok = await Storage.saveTxn({
      id:txnId, type:'trf', from:fromId, to:toId,
      cur:currency, amt:amount, rate:r, commission_amt:commission,
      is_commission_entry:false, parent_id:null,
      by:Auth.getUser()?.user||'?',
      date:new Date().toISOString(), note:''
    });
    if (!ok) return { ok:false, error:'خطأ في الحفظ' };

    await Promise.all([
      Storage.updateBalance(fromId, currency, -amount),
      Storage.updateBalance(toId,   currency,  netReceived)
    ]);

    if (commission > 0) {
      await _saveCommissionEntry(toId, currency, commission, txnId);
    }

    await Storage.logAction('transfer', { fromId, toId, currency, amount, rate:r, commission, netReceived });
    return { ok:true, commission, netReceived };
  }

  async function deleteTxn(txnId) {
    if (!Auth.can('canDelete')) return { ok:false, error:'ليس لديك صلاحية الحذف' };
    const t = await Storage.getTxnById(txnId);
    if (!t) return { ok:false, error:'العملية غير موجودة' };
    if (t.is_commission_entry) return { ok:false, error:'لا يمكن حذف حركة عمولة مباشرة — احذف العملية الأصلية' };

    const commission = parseFloat(t.commission_amt||0);

    if (t.type==='dep') {
      const net = parseFloat(t.amt) - commission;
      await Storage.updateBalance(t.acc, t.cur, -net);
      if (commission>0) await Storage.updateBalance('9999', t.cur, -commission);
    }
    if (t.type==='wit') {
      await Storage.updateBalance(t.acc, t.cur, parseFloat(t.amt));
    }
    if (t.type==='trf') {
      const r    = parseFloat(t.rate)||1;
      const gross = parseFloat(t.amt)*r;
      const net   = gross - commission;
      await Promise.all([
        Storage.updateBalance(t.from, t.cur,  parseFloat(t.amt)),
        Storage.updateBalance(t.to,   t.cur, -net)
      ]);
      if (commission>0) await Storage.updateBalance('9999', t.cur, -commission);
    }

    // احذف حركة العمولة المرتبطة إن وجدت
    const linked = await Storage.getTxnByParent(txnId);
    if (linked) await Storage.deleteTxn(linked.id);

    const ok = await Storage.deleteTxn(txnId);
    await Storage.logAction('delete', { txnId, type:t.type });
    return ok ? { ok:true } : { ok:false, error:'خطأ في الحذف' };
  }

  async function updateNote(txnId, note) {
    if (!Auth.can('canEdit')) return { ok:false, error:'ليس لديك صلاحية التعديل' };
    const ok = await Storage.updateTxn(txnId, { note });
    return ok ? { ok:true } : { ok:false, error:'خطأ في التعديل' };
  }

  async function getAll(filters={}) { return Storage.getTxns(filters); }

  return { getBalance, getTreasuryTotals, deposit, withdraw, transfer, deleteTxn, updateNote, getAll };
})();
