/**
 * currency.js — SM-Group v6.1
 * إدارة العملات المتعددة — Cache + تحديث ديناميكي
 */

const Currency = (() => {

  let _currencies = null; // Cache محلي

  // ── جلب العملات ─────────────────────────────────────
  async function getAll() {
    if (_currencies) return _currencies;
    const sb = supabase.createClient(DB_CONFIG.url, DB_CONFIG.key);
    const { data, error } = await sb.from('currencies')
      .select('*').order('sort_order');
    if (error || !data) {
      // افتراضي إذا فشل الجلب
      _currencies = [
        { code:'USD', name:'دولار أمريكي', symbol:'$', is_active:true, is_fixed:true },
        { code:'EUR', name:'يورو',          symbol:'€', is_active:true, is_fixed:true }
      ];
    } else {
      _currencies = data;
    }
    return _currencies;
  }

  // العملات المفعّلة فقط
  async function getActive() {
    const all = await getAll();
    return all.filter(c => c.is_active);
  }

  // تفعيل/تعطيل عملة
  async function toggle(code, active) {
    const sb = supabase.createClient(DB_CONFIG.url, DB_CONFIG.key);
    const { error } = await sb.from('currencies')
      .update({ is_active: active }).eq('code', code);
    if (!error) _currencies = null; // إعادة تحميل
    return !error;
  }

  // رمز العملة
  async function symbol(code) {
    const all = await getAll();
    return all.find(c => c.code.toLowerCase() === String(code).toLowerCase())?.symbol || code;
  }

  // اسم العملة
  async function name(code) {
    const all = await getAll();
    return all.find(c => c.code.toLowerCase() === String(code).toLowerCase())?.name || code;
  }

  // ── تنسيق موحّد للأرقام والعملات (المرجع الوحيد في كل النظام) ──
  // formatNumber(1000.5)      -> "1,000.50"
  // formatMoney(1000.5, '$')  -> "$1,000.50"      (نفس ترتيب الرمز الحالي في كل الصفحات)
  // formatMoney(-1000.5, '$') -> "-$1,000.50"
  function formatNumber(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatMoney(n, symbol = '') {
    const v = Number(n) || 0;
    const sign = v < 0 ? '-' : '';
    return `${sign}${symbol}${formatNumber(Math.abs(v))}`;
  }

  // بناء خيارات select للعملات المفعّلة
  // ملاحظة: نستخدم كود العملة بأحرف صغيرة كقيمة دائماً — لأن باقي النظام
  // (دفتر اليومية، التقارير، كشف الحساب...) يفترض 'usd'/'eur' بأحرف صغيرة
  // كمفاتيح كائنات وحقول أعمدة، بينما جدول currencies يخزّن الكود بأحرف كبيرة
  async function buildSelectOptions(selectedCode = 'usd') {
    const active = await getActive();
    const selLower = String(selectedCode).toLowerCase();
    return active.map(c =>
      `<option value="${c.code.toLowerCase()}" ${c.code.toLowerCase() === selLower ? 'selected' : ''}>
         ${c.symbol} ${c.name} (${c.code})
       </option>`
    ).join('');
  }

  // تحديث كل حقول اختيار العملة في الصفحة
  async function refreshSelects(selectedCode = 'usd') {
    const opts = await buildSelectOptions(selectedCode);
    document.querySelectorAll('.currency-select').forEach(sel => {
      const val = sel.value || selectedCode;
      sel.innerHTML = opts;
      sel.value = val;
    });
  }

  // إعادة تعيين الـ Cache
  function invalidate() { _currencies = null; }

  // تحديث select من نوع "فلتر" (به خيار "الكل" أولاً) بمعرّف محدد —
  // لا نستخدم .currency-select هنا لأن refreshSelects() تلك تمسح
  // أي خيار غير مرتبط بعملة (مثل "الكل") بالكامل. تُستخدم في فلاتر
  // العملة بصفحات الحساب/دفتر اليومية/كشف الحساب.
  async function refreshFilterSelect(selectId, allLabel = 'الكل') {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const active = await getActive();
    const cur = sel.value || 'all';
    sel.innerHTML = `<option value="all">${allLabel}</option>` + active.map(c =>
      `<option value="${c.code.toLowerCase()}">${c.symbol} ${c.name} (${c.code})</option>`
    ).join('');
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : 'all';
  }

  return {
    getAll, getActive, toggle, symbol, name, buildSelectOptions, refreshSelects,
    refreshFilterSelect, invalidate, formatNumber, formatMoney
  };
})();
