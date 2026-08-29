// ══════════════════════════════════════════════════════════
// Receipt — إيصال طباعة فردي لكل عملية إيداع/سحب/تحويل
// يفتح نافذة منفصلة بتصميم إيصال (Slip) جاهز للطباعة، مستقلة
// تماماً عن باقي الصفحة، تستخدم نفس الشعار/الختم/التوقيع
// المضبوطة في الإعدادات (PrintBrand).
// ══════════════════════════════════════════════════════════
const Receipt = (() => {

  const TYPE_LABEL = { dep: 'إيداع', wit: 'سحب', trf: 'تحويل' };
  const TYPE_COLOR  = { dep: '#16a34a', wit: '#dc2626', trf: '#2563eb' };

  function _sym(cur) {
    const map = {usd:'$',eur:'€',try:'₺',gbp:'£',sar:'﷼',aed:'د.إ',egp:'ج.م',jod:'د.أ',kwd:'د.ك',qar:'ر.ق',mad:'د.م',lyd:'ل.د'};
    return map[String(cur||'').toLowerCase()] || String(cur||'').toUpperCase();
  }

  function _fmtDate(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2,'0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} — ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // txn: سطر المعاملة كما هو مخزَّن (id, type, acc/from/to, amt, cur, rate, commission_amt, by, date, note)
  // accounts: مصفوفة كل الحسابات (لعرض الاسم بجانب الكود)
  async function _buildHTML(txn, accounts) {
    const [logo, sigBlock] = await Promise.all([
      (typeof PrintBrand !== 'undefined') ? PrintBrand.logoHTML(60) : '',
      (typeof PrintBrand !== 'undefined') ? PrintBrand.signatureBlockHTML() : ''
    ]);

    const sym   = _sym(txn.cur);
    const label = TYPE_LABEL[txn.type] || txn.type;
    const color = TYPE_COLOR[txn.type] || '#666';
    const findAcc = id => (accounts||[]).find(a => a.id === id);

    let partyRows = '';
    let grossReceived = null;
    if (txn.type === 'trf') {
      const fromAcc = findAcc(txn.from);
      const toAcc   = findAcc(txn.to);
      const hasRate = txn.rate && parseFloat(txn.rate) !== 1;
      grossReceived = hasRate ? parseFloat(txn.amt) * parseFloat(txn.rate) : parseFloat(txn.amt);
      partyRows = `
        <tr><td class="lbl">من حساب</td><td class="val">${_esc(fromAcc?fromAcc.name:txn.from)} <span class="code">(${_esc(txn.from)})</span></td></tr>
        <tr><td class="lbl">إلى حساب</td><td class="val">${_esc(toAcc?toAcc.name:txn.to)} <span class="code">(${_esc(txn.to)})</span></td></tr>
        ${hasRate ? `<tr><td class="lbl">سعر الصرف</td><td class="val">${parseFloat(txn.rate)}</td></tr>` : ''}`;
    } else {
      const acc = findAcc(txn.acc);
      partyRows = `<tr><td class="lbl">الحساب</td><td class="val">${_esc(acc?acc.name:txn.acc)} <span class="code">(${_esc(txn.acc)})</span></td></tr>`;
    }

    let commRows = '';
    const comm = parseFloat(txn.commission_amt || 0);
    const fmt  = (v) => (typeof Currency !== 'undefined') ? Currency.formatMoney(v, sym) : sym + v.toFixed(2);
    if (comm > 0) {
      // الصافي = الإجمالي بعد التحويل ناقص العمولة. في التحويل بسعر صرف
      // (rate) مختلف عن 1، العمولة تُحسب على القيمة المحوَّلة (gross) وليس
      // على المبلغ المُرسَل مباشرة — يجب مطابقة نفس الصيغة هنا تماماً كما
      // في Transactions.transfer()، وإلا يظهر "الصافي" خاطئاً في الإيصال.
      const gross = grossReceived !== null ? grossReceived : parseFloat(txn.amt);
      const net = gross - comm;
      commRows = `
        <tr><td class="lbl">العمولة</td><td class="val" style="color:#c9a84c;">${fmt(comm)}</td></tr>
        <tr><td class="lbl">الصافي</td><td class="val" style="font-weight:700;">${fmt(net)}</td></tr>`;
    } else if (grossReceived !== null && Math.abs(grossReceived - parseFloat(txn.amt)) > 0.0001) {
      // تحويل بسعر صرف مختلف عن 1 وبلا عمولة — نوضّح المبلغ الفعلي المستلم
      // بعد التحويل حتى لا يُترك القارئ ليحسبه يدوياً من سعر الصرف وحده
      commRows = `<tr><td class="lbl">المبلغ المستلم</td><td class="val" style="font-weight:700;">${fmt(grossReceived)}</td></tr>`;
    }

    const noteRow = txn.note ? `<tr><td class="lbl">ملاحظة</td><td class="val">${_esc(txn.note)}</td></tr>` : '';
    const brand   = (typeof brandName === 'function') ? brandName() : 'SM Group Finance';
    const footer  = (typeof brandPrintCopyright === 'function') ? brandPrintCopyright() : '';

    // اسم الملف عند الحفظ/الطباعة كـ PDF: إيصال_{النوع}_{الاسم}_كود_({الكود})_{التاريخ}
    // نفس تسمية الكشوفات (دفتر_الاستاذ_...) لكن ببادئة "إيصال" ونوع العملية.
    // الحساب المرجعي: حساب المرسل في التحويل، أو الحساب نفسه في الإيداع/السحب.
    const primaryId   = txn.type === 'trf' ? txn.from : txn.acc;
    const primaryAcc  = findAcc(primaryId);
    const primaryName = primaryAcc ? primaryAcc.name : primaryId;
    const d = new Date();
    const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
    const safeName = String(primaryName || '—').replace(/[\\/:*?"<>|]/g, '_').trim() || '—';
    const safeCode = String(primaryId ?? '').replace(/[\\/:*?"<>|]/g, '_').trim();
    const fileTitle = `إيصال_${label}_${safeName}_كود_(${safeCode})_${dateStr}`;

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${_esc(fileTitle)}</title>
<style>
  * { box-sizing:border-box; }
  body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; background:#f4f4f4; margin:0; padding:20px; color:#1a1a1a; }
  .receipt { max-width:380px; margin:0 auto; background:#fff; border:1px solid #ddd; border-radius:10px;
             padding:24px 22px; box-shadow:0 2px 10px rgba(0,0,0,0.08); }
  .brand { text-align:center; font-size:1.05rem; font-weight:700; color:#b8860b; margin-bottom:2px; }
  .sub { text-align:center; font-size:0.7rem; color:#888; margin-bottom:14px; }
  .badge { display:block; text-align:center; color:#fff; font-weight:700; font-size:0.85rem;
           padding:6px; border-radius:6px; margin-bottom:14px; background:${color}; }
  .amount { text-align:center; font-size:1.9rem; font-weight:800; margin:10px 0 16px; color:#1a1a1a; }
  table { width:100%; border-collapse:collapse; font-size:0.82rem; }
  td { padding:6px 2px; border-bottom:1px dashed #e2e2e2; vertical-align:top; }
  td.lbl { color:#888; width:38%; }
  td.val { font-weight:600; text-align:left; }
  .code { color:#aaa; font-weight:400; font-size:0.75rem; }
  .footer { text-align:center; font-size:0.68rem; color:#aaa; margin-top:20px; }
  .receipt-no { text-align:center; font-size:0.68rem; color:#aaa; margin-bottom:4px; }
  @media print {
    body { background:#fff; padding:0; }
    .receipt { box-shadow:none; border:none; max-width:100%; }
    .no-print { display:none; }
  }
  .print-btn { display:block; width:100%; margin:16px auto 0; max-width:380px; padding:10px;
    background:#c9a84c; color:#fff; border:none; border-radius:8px; font-size:0.9rem; cursor:pointer; }
</style></head>
<body>
  <div class="receipt">
    ${logo}
    <div class="brand">${_esc(brand)}</div>
    <div class="sub">إيصال عملية مالية</div>
    <div class="receipt-no">رقم الإيصال: #${txn.id}</div>
    <div class="badge">${label}</div>
    <div class="amount">${fmt(parseFloat(txn.amt))}</div>
    <table>
      <tr><td class="lbl">التاريخ</td><td class="val">${_fmtDate(txn.date)}</td></tr>
      ${partyRows}
      ${commRows}
      <tr><td class="lbl">بواسطة</td><td class="val">${_esc(txn.by || '—')}</td></tr>
      ${noteRow}
    </table>
    ${sigBlock}
    <div class="footer">${_esc(footer)}</div>
  </div>
  <button class="print-btn no-print" onclick="window.print()">🖨️ طباعة الإيصال</button>
</body></html>`;
  }

  function _esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  }

  // يفتح نافذة جديدة بتصميم الإيصال، جاهزة للطباعة
  async function print(txn, accounts) {
    const html = await _buildHTML(txn, accounts);
    const win = window.open('', '_blank', 'width=460,height=720');
    if (!win) {
      if (typeof UI !== 'undefined') UI.toast('يرجى السماح بالنوافذ المنبثقة لطباعة الإيصال', 'error');
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  return { print };
})();
