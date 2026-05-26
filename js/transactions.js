/**
 * transactions.js — SM-Group v5
 * عمولة تلقائية على إيداعات الزبائن + صلاحيات
 */

const Transactions = (() => {

  async function getBalance(accountId, currency) {
    return Storage.getBalance(accountId, currency);
  }

  async function getTreasuryTotals() {
    return Storage.getTreasuryTotals();
  }

  // حساب العمولة وإرسالها لحساب الأرباح
  async function _applyCommission(accountId, currency, amount) {
    const accounts = await Storage.getAccounts();
    const acc = accounts.find(a => a.id === accountId);
    if (!acc || acc.type !== 'customer') return 0;
    const rate = parseFloat(acc.commission_rate ?? 0.00025);
    if (!rate) return 0;
    const commission = parseFloat((amount * rate).toFixed(6));
    if (commission <= 0) return 0;
    // أضف العمولة لحساب الأرباح 9999
    await Storage.updateBalance('9999', currency, commission);
    return commission;
  }

  async function deposit(accountId, currency, amount) {
    if (!accountId) return { ok:false, error:'اختر الحساب' };
    if (!amount||amount<=0) return { ok:false, error:'أدخل مبلغاً صحيحاً' };

    // احسب العمولة قبل الحفظ
    const commission = await _applyCommission(accountId, currency, amount);

    const ok = await Storage.saveTxn({
      id:Date.now(), type:'dep', acc:accountId, cur:currency,
      amt:amount, commission_amt:commission,
      by:Auth.getUser()?.user||'?', date:new Date().toISOString(), note:''
    });
    if (!ok) return { ok:false, error:'خطأ في الحفظ' };
    await Storage.updateBalance(accountId, currency, amount);
    return { ok:true, commission };
  }

  async function withdraw(accountId, currency, amount, forceOverdraft=false) {
    if (!accountId) return { ok:false, error:'اختر الحساب' };
    if (!amount||amount<=0) return { ok:false, error:'أدخل مبلغاً صحيحاً' };
    const currentBal = await Storage.getBalance(accountId, currency);
    if (amount>currentBal && !forceOverdraft)
      return { ok:false, needsConfirm:true, currentBal,
               error:`رصيد الحساب (${currentBal.toFixed(2)}) غير كافٍ` };
    const ok = await Storage.saveTxn({
      id:Date.now(), type:'wit', acc:accountId, cur:currency, amt:amount,
      commission_amt:0, by:Auth.getUser()?.user||'?',
      date:new Date().toISOString(), note:''
    });
    if (!ok) return { ok:false, error:'خطأ في الحفظ' };
    await Storage.updateBalance(accountId, currency, -amount);
    return { ok:true };
  }

  async function transfer(fromId, toId, currency, amount, rate=1, forceOverdraft=false) {
    if (!fromId) return { ok:false, error:'اختر حساب المرسل' };
    if (!toId)   return { ok:false, error:'اختر حساب المستقبل' };
    if (fromId===toId) return { ok:false, error:'لا يمكن التحويل لنفس الحساب' };
    if (!amount||amount<=0) return { ok:false, error:'أدخل مبلغاً صحيحاً' };
    const currentBal = await Storage.getBalance(fromId, currency);
    if (amount>currentBal && !forceOverdraft)
      return { ok:false, needsConfirm:true, currentBal,
               error:`رصيد المرسل (${currentBal.toFixed(2)}) غير كافٍ` };
    const r = parseFloat(rate)||1;
    const ok = await Storage.saveTxn({
      id:Date.now(), type:'trf', from:fromId, to:toId,
      cur:currency, amt:amount, rate:r, commission_amt:0,
      by:Auth.getUser()?.user||'?', date:new Date().toISOString(), note:''
    });
    if (!ok) return { ok:false, error:'خطأ في الحفظ' };
    await Promise.all([
      Storage.updateBalance(fromId, currency, -amount),
      Storage.updateBalance(toId,   currency,  amount*r)
    ]);
    return { ok:true };
  }

  async function deleteTxn(txnId) {
    if (!Auth.can('canDelete')) return { ok:false, error:'ليس لديك صلاحية الحذف' };
    const t = await Storage.getTxnById(txnId);
    if (!t) return { ok:false, error:'العملية غير موجودة' };
    if (t.type==='dep') {
      await Storage.updateBalance(t.acc, t.cur, -parseFloat(t.amt));
      // عكس العمولة من حساب الأرباح
      if (parseFloat(t.commission_amt||0)>0)
        await Storage.updateBalance('9999', t.cur, -parseFloat(t.commission_amt));
    }
    if (t.type==='wit') await Storage.updateBalance(t.acc, t.cur, parseFloat(t.amt));
    if (t.type==='trf') {
      await Promise.all([
        Storage.updateBalance(t.from, t.cur,  parseFloat(t.amt)),
        Storage.updateBalance(t.to,   t.cur, -parseFloat(t.amt)*(parseFloat(t.rate)||1))
      ]);
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
