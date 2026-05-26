/**
 * transactions.js — SM-Group v5.1
 * العمولة بالنسبة المئوية (0.025 = 0.025%)
 * تُخصم من المبلغ المستلم — يدخل الحساب صافي
 */

const Transactions = (() => {

  async function getBalance(accountId, currency) {
    return Storage.getBalance(accountId, currency);
  }

  async function getTreasuryTotals() {
    return Storage.getTreasuryTotals();
  }

  /**
   * حساب العمولة وإرجاع الصافي
   * commission_rate مخزّن كنسبة مئوية: 0.025 تعني 0.025%
   * الحد الأدنى للعمولة: 0.01 (سنت واحد)
   */
  async function _calcCommission(accountId, amount) {
    const accounts = await Storage.getAccounts();
    const acc = accounts.find(a => a.id === accountId);
    // العمولة فقط على الزبائن
    if (!acc || acc.type !== 'customer') return 0;
    const ratePct = parseFloat(acc.commission_rate ?? 0.025);
    if (!ratePct) return 0;
    // تحويل النسبة المئوية: 0.025% → ×0.00025
    const raw = amount * (ratePct / 100);
    if (raw < 0.01) return 0; // أقل من الحد الأدنى — لا عمولة
    return parseFloat(raw.toFixed(2));
  }

  // الإيداع: يدخل الحساب (المبلغ - العمولة)
  async function deposit(accountId, currency, amount) {
    if (!accountId) return { ok:false, error:'اختر الحساب' };
    if (!amount || amount <= 0) return { ok:false, error:'أدخل مبلغاً صحيحاً' };

    const commission = await _calcCommission(accountId, amount);
    const netAmount  = parseFloat((amount - commission).toFixed(2));

    const ok = await Storage.saveTxn({
      id: Date.now(), type:'dep', acc:accountId,
      cur: currency, amt: amount,
      commission_amt: commission,
      by: Auth.getUser()?.user||'?',
      date: new Date().toISOString(), note:''
    });
    if (!ok) return { ok:false, error:'خطأ في الحفظ' };

    // يدخل الحساب الصافي فقط
    await Storage.updateBalance(accountId, currency, netAmount);
    // العمولة تذهب لحساب الأرباح
    if (commission > 0) await Storage.updateBalance('9999', currency, commission);

    return { ok:true, commission, netAmount };
  }

  // السحب: بدون عمولة
  async function withdraw(accountId, currency, amount, forceOverdraft=false) {
    if (!accountId) return { ok:false, error:'اختر الحساب' };
    if (!amount || amount <= 0) return { ok:false, error:'أدخل مبلغاً صحيحاً' };
    const currentBal = await Storage.getBalance(accountId, currency);
    if (amount > currentBal && !forceOverdraft)
      return { ok:false, needsConfirm:true, currentBal,
               error:`رصيد الحساب (${currentBal.toFixed(2)}) غير كافٍ` };
    const ok = await Storage.saveTxn({
      id:Date.now(), type:'wit', acc:accountId,
      cur:currency, amt:amount, commission_amt:0,
      by:Auth.getUser()?.user||'?',
      date:new Date().toISOString(), note:''
    });
    if (!ok) return { ok:false, error:'خطأ في الحفظ' };
    await Storage.updateBalance(accountId, currency, -amount);
    return { ok:true };
  }

  // التحويل: العمولة على المستقبل (إذا كان زبوناً)
  async function transfer(fromId, toId, currency, amount, rate=1, forceOverdraft=false) {
    if (!fromId) return { ok:false, error:'اختر حساب المرسل' };
    if (!toId)   return { ok:false, error:'اختر حساب المستقبل' };
    if (fromId === toId) return { ok:false, error:'لا يمكن التحويل لنفس الحساب' };
    if (!amount || amount <= 0) return { ok:false, error:'أدخل مبلغاً صحيحاً' };

    const currentBal = await Storage.getBalance(fromId, currency);
    if (amount > currentBal && !forceOverdraft)
      return { ok:false, needsConfirm:true, currentBal,
               error:`رصيد المرسل (${currentBal.toFixed(2)}) غير كافٍ` };

    const r = parseFloat(rate) || 1;
    const grossReceived = parseFloat((amount * r).toFixed(2));
    // العمولة على المستقبل
    const commission = await _calcCommission(toId, grossReceived);
    const netReceived = parseFloat((grossReceived - commission).toFixed(2));

    const ok = await Storage.saveTxn({
      id:Date.now(), type:'trf', from:fromId, to:toId,
      cur:currency, amt:amount, rate:r,
      commission_amt: commission,
      by:Auth.getUser()?.user||'?',
      date:new Date().toISOString(), note:''
    });
    if (!ok) return { ok:false, error:'خطأ في الحفظ' };

    await Promise.all([
      Storage.updateBalance(fromId, currency, -amount),
      Storage.updateBalance(toId,   currency,  netReceived)
    ]);
    if (commission > 0) await Storage.updateBalance('9999', currency, commission);

    return { ok:true, commission, netReceived };
  }

  // حذف عملية مع عكس تأثيرها الكامل
  async function deleteTxn(txnId) {
    if (!Auth.can('canDelete')) return { ok:false, error:'ليس لديك صلاحية الحذف' };
    const t = await Storage.getTxnById(txnId);
    if (!t) return { ok:false, error:'العملية غير موجودة' };

    const commission = parseFloat(t.commission_amt || 0);

    if (t.type === 'dep') {
      const net = parseFloat(t.amt) - commission;
      await Storage.updateBalance(t.acc, t.cur, -net);
      if (commission > 0) await Storage.updateBalance('9999', t.cur, -commission);
    }
    if (t.type === 'wit') {
      await Storage.updateBalance(t.acc, t.cur, parseFloat(t.amt));
    }
    if (t.type === 'trf') {
      const r = parseFloat(t.rate) || 1;
      const grossReceived = parseFloat(t.amt) * r;
      const net = grossReceived - commission;
      await Promise.all([
        Storage.updateBalance(t.from, t.cur,  parseFloat(t.amt)),
        Storage.updateBalance(t.to,   t.cur, -net)
      ]);
      if (commission > 0) await Storage.updateBalance('9999', t.cur, -commission);
    }

    const ok = await Storage.deleteTxn(txnId);
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
