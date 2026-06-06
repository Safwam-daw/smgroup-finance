/**
 * currency.js — SM-Group v6.1
 * إدارة العملات المتعددة — Cache + تحديث ديناميكي
 */

const Currency = (() => {

  let _currencies = null; // Cache محلي

  // ── جلب العملات ─────────────────────────────────────
  async function getAll() {
    if (_currencies) return _currencies;
    const SUPABASE_URL = 'https://qrdasgkegudvnobjwafc.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyZGFzZ2tlZ3Vkdm5vYmp3YWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NjI3NTMsImV4cCI6MjA5NjIzODc1M30.aFTETaS0MrbrL9G7GJ8nXM4-sJO-1l9NpKST-KAvnNU
      ';
    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
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
    const SUPABASE_URL = 'https://jmmikuprhitwundsuplt.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptbWlrdXByaGl0d3VuZHN1cGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDQ2MjgsImV4cCI6MjA5NTIyMDYyOH0.wcvQZfQUwratKCOWXiBeK3lWHGgbMycJiS4GS-I0eZ0';
    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const { error } = await sb.from('currencies')
      .update({ is_active: active }).eq('code', code);
    if (!error) _currencies = null; // إعادة تحميل
    return !error;
  }

  // رمز العملة
  async function symbol(code) {
    const all = await getAll();
    return all.find(c => c.code === code)?.symbol || code;
  }

  // اسم العملة
  async function name(code) {
    const all = await getAll();
    return all.find(c => c.code === code)?.name || code;
  }

  // بناء خيارات select للعملات المفعّلة
  async function buildSelectOptions(selectedCode = 'USD') {
    const active = await getActive();
    return active.map(c =>
      `<option value="${c.code}" ${c.code === selectedCode ? 'selected' : ''}>
         ${c.symbol} ${c.name} (${c.code})
       </option>`
    ).join('');
  }

  // تحديث كل حقول اختيار العملة في الصفحة
  async function refreshSelects(selectedCode = 'USD') {
    const opts = await buildSelectOptions(selectedCode);
    document.querySelectorAll('.currency-select').forEach(sel => {
      const val = sel.value || selectedCode;
      sel.innerHTML = opts;
      sel.value = val;
    });
  }

  // إعادة تعيين الـ Cache
  function invalidate() { _currencies = null; }

  return { getAll, getActive, toggle, symbol, name, buildSelectOptions, refreshSelects, invalidate };
})();
