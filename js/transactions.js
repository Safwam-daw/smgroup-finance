/**
 * transactions.js — SM-Group v4
 * الأرصدة تُحدَّث مباشرة في accounts — سريع جداً
 */

const Transactions = (() => {

  async function getBalance(accountId, currency) {
    return Storage.getBalance(accountId, currency);
  }

  async function getTreasuryTotals() {
    return Storage.getTreasuryTotals();
  }

  async function deposit(accountId, currency, amount) {
    if (!accountId) return { ok: false, error: 'اختر الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };
    const ok = await Storage.saveTxn({
      id: Date.now(), type: 'dep', acc: accountId,
      cur: currency, amt: amount,
      by: Auth.getUser()?.user || '?', date: new Date().toISOString(), note: ''
    });
    if (!ok) return { ok: false, error: 'خطأ في الحفظ' };
    await Storage.updateBalance(accountId, currency, amount);
    return { ok: true };
  }

  async function withdraw(accountId, currency, amount, forceOverdraft = false) {
    if (!accountId) return { ok: false, error: 'اختر الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };
    const currentBal = await Storage.getBalance(accountId, currency);
    if (amount > currentBal && !forceOverdraft)
      return { ok: false, needsConfirm: true, currentBal,
               error: `رصيد الحساب (${currentBal.toFixed(2)}) غير كافٍ` };
    const ok = await Storage.saveTxn({
      id: Date.now(), type: 'wit', acc: accountId,
      cur: currency, amt: amount,
      by: Auth.getUser()?.user || '?', date: new Date().toISOString(), note: ''
    });
    if (!ok) return { ok: false, error: 'خطأ في الحفظ' };
    await Storage.updateBalance(accountId, currency, -amount);
    return { ok: true };
  }

  async function transfer(fromId, toId, currency, amount, rate = 1, forceOverdraft = false) {
    if (!fromId) return { ok: false, error: 'اختر حساب المرسل' };
    if (!toId)   return { ok: false, error: 'اختر حساب المستقبل' };
    if (fromId === toId) return { ok: false, error: 'لا يمكن التحويل لنفس الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };
    const currentBal = await Storage.getBalance(fromId, currency);
    if (amount > currentBal && !forceOverdraft)
      return { ok: false, needsConfirm: true, currentBal,
               error: `رصيد المرسل (${currentBal.toFixed(2)}) غير كافٍ` };
    const r = parseFloat(rate) || 1;
    const ok = await Storage.saveTxn({
      id: Date.now(), type: 'trf', from: fromId, to: toId,
      cur: currency, amt: amount, rate: r,
      by: Auth.getUser()?.user || '?', date: new Date().toISOString(), note: ''
    });
    if (!ok) return { ok: false, error: 'خطأ في الحفظ' };
    await Storage.updateBalance(fromId, currency, -amount);
    await Storage.updateBalance(toId, currency, amount * r);
    return { ok: true };
  }

  // حذف عملية مع عكس تأثيرها على الرصيد
  async function deleteTxn(txnId) {
    const t = await Storage.getTxnById(txnId);
    if (!t) return { ok: false, error: 'العملية غير موجودة' };
    // عكس تأثير الرصيد
    if (t.type === 'dep') await Storage.updateBalance(t.acc, t.cur, -parseFloat(t.amt));
    if (t.type === 'wit') await Storage.updateBalance(t.acc, t.cur, parseFloat(t.amt));
    if (t.type === 'trf') {
      await Storage.updateBalance(t.from, t.cur, parseFloat(t.amt));
      await Storage.updateBalance(t.to, t.cur, -parseFloat(t.amt) * (parseFloat(t.rate)||1));
    }
    const ok = await Storage.deleteTxn(txnId);
    return ok ? { ok: true } : { ok: false, error: 'خطأ في الحذف' };
  }

  // تعديل ملاحظة العملية فقط (الملاحظات آمنة للتعديل)
  async function updateNote(txnId, note) {
    const ok = await Storage.updateTxn(txnId, { note });
    return ok ? { ok: true } : { ok: false, error: 'خطأ في التعديل' };
  }

  async function getAll(filters = {}) { return Storage.getTxns(filters); }

  return { getBalance, getTreasuryTotals, deposit, withdraw, transfer, deleteTxn, updateNote, getAll };
})();
