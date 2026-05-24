/**
 * transactions.js — SM-Group Transaction Engine (Supabase)
 */

const Transactions = (() => {

  async function getBalance(accountId, currency) {
    const txns = await Storage.getTxns();
    let balance = 0;
    txns.forEach(t => {
      if (t.cur !== currency) return;
      if (t.type === 'dep' && t.acc === accountId) balance += parseFloat(t.amt);
      if (t.type === 'wit' && t.acc === accountId) balance -= parseFloat(t.amt);
      if (t.type === 'trf') {
        if (t.from === accountId) balance -= parseFloat(t.amt);
        if (t.to === accountId)   balance += parseFloat(t.amt) * (parseFloat(t.rate) || 1);
      }
    });
    return balance;
  }

  async function getTreasuryTotals() {
    const txns = await Storage.getTxns();
    let usd = 0, eur = 0;
    txns.forEach(t => {
      const dir = t.type === 'dep' ? 1 : t.type === 'wit' ? -1 : 0;
      if (t.cur === 'usd') usd += dir * parseFloat(t.amt);
      else if (t.cur === 'eur') eur += dir * parseFloat(t.amt);
    });
    return { usd, eur };
  }

  async function deposit(accountId, currency, amount) {
    if (!accountId) return { ok: false, error: 'اختر الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };
    const ok = await Storage.saveTxn({
      id: Date.now(),
      type: 'dep',
      acc: accountId,
      cur: currency,
      amt: amount,
      by: Auth.getUser()?.user || '?',
      date: new Date().toISOString()
    });
    return ok ? { ok: true } : { ok: false, error: 'خطأ في الحفظ' };
  }

  async function withdraw(accountId, currency, amount, forceOverdraft = false) {
    if (!accountId) return { ok: false, error: 'اختر الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };
    const currentBal = await getBalance(accountId, currency);
    if (amount > currentBal && !forceOverdraft) {
      return { ok: false, needsConfirm: true, currentBal, error: `رصيد الحساب (${currentBal.toFixed(2)}) غير كافٍ` };
    }
    const ok = await Storage.saveTxn({
      id: Date.now(),
      type: 'wit',
      acc: accountId,
      cur: currency,
      amt: amount,
      by: Auth.getUser()?.user || '?',
      date: new Date().toISOString()
    });
    return ok ? { ok: true } : { ok: false, error: 'خطأ في الحفظ' };
  }

  async function transfer(fromId, toId, currency, amount, rate = 1, forceOverdraft = false) {
    if (!fromId) return { ok: false, error: 'اختر حساب المرسل' };
    if (!toId)   return { ok: false, error: 'اختر حساب المستقبل' };
    if (fromId === toId) return { ok: false, error: 'لا يمكن التحويل لنفس الحساب' };
    if (!amount || amount <= 0) return { ok: false, error: 'أدخل مبلغاً صحيحاً' };
    const currentBal = await getBalance(fromId, currency);
    if (amount > currentBal && !forceOverdraft) {
      return { ok: false, needsConfirm: true, currentBal, error: `رصيد المرسل (${currentBal.toFixed(2)}) غير كافٍ` };
    }
    const ok = await Storage.saveTxn({
      id: Date.now(),
      type: 'trf',
      from: fromId,
      to: toId,
      cur: currency,
      amt: amount,
      rate: parseFloat(rate) || 1,
      by: Auth.getUser()?.user || '?',
      date: new Date().toISOString()
    });
    return ok ? { ok: true } : { ok: false, error: 'خطأ في الحفظ' };
  }

  async function getAll(filters = {}) { return Storage.getTxns(filters); }

  return { getBalance, getTreasuryTotals, deposit, withdraw, transfer, getAll };
})();
