/**
 * ui.js — SM-Group v4.2
 * إضافة: Enter يختار أول نتيجة، initSearch محسّن
 */
const UI = (() => {

  function toast(msg, type='success') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className=''; }, 3200);
  }

  function showLoading(show) {
    let el = document.getElementById('loading-overlay');
    if (!el && show) {
      el = document.createElement('div');
      el.id = 'loading-overlay';
      el.innerHTML = `<div style="position:fixed;inset:0;background:rgba(7,9,15,0.7);z-index:9000;
        display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;">
        <div style="width:36px;height:36px;border:3px solid var(--border2);border-top-color:var(--gold);
          border-radius:50%;animation:spin .7s linear infinite;"></div>
        <div style="font-size:0.82rem;color:var(--text2);">جاري التحميل…</div>
      </div>`;
      document.body.appendChild(el);
      if (!document.getElementById('spin-style')) {
        const s = document.createElement('style');
        s.id = 'spin-style';
        s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
      }
    } else if (el && !show) { el.remove(); }
  }

  async function updateTreasury() {
    // جلب الخزينة والأرباح بالتوازي من الـ Cache
    const [totals, profit] = await Promise.all([
      Storage.getTreasuryTotals(),
      Storage.getProfitBalance()
    ]);

    const set = (id, val, pos, neg='var(--red)') => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      el.style.color = parseFloat(val) < 0 ? neg : pos;
    };

    // الخزينة الإجمالية (تشمل الأرباح)
    const netUsd = totals.usd;
    const netEur = totals.eur;
    set('t-usd',        '$' + netUsd.toFixed(2),       'var(--gold)');
    set('t-eur',        '€' + netEur.toFixed(2),       'var(--euro)');
    set('t-profit-usd', '$' + profit.usd.toFixed(2),   'var(--green)');
    set('t-profit-eur', '€' + profit.eur.toFixed(2),   'var(--green)');
  }

  function initSidebar() {
    const toggle  = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!toggle || !sidebar) return;
    toggle.addEventListener('click', () => toggleSidebar(true));
    if (overlay) overlay.addEventListener('click', () => toggleSidebar(false));
  }

  function toggleSidebar(open) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    if (overlay) overlay.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }

  function closeSidebarOnNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.innerWidth <= 640) toggleSidebar(false);
      });
    });
  }

  function fillUserInfo() {
    const user = Auth.getUser();
    if (!user) return;
    const avatar   = document.getElementById('nav-avatar');
    const username = document.getElementById('nav-username');
    const roleEl   = document.getElementById('nav-role');
    if (avatar)   avatar.textContent = user.user.charAt(0).toUpperCase();
    if (username) username.textContent = user.user;
    if (roleEl)   roleEl.textContent = user.role === 'admin' ? 'مدير نظام' : 'موظف';
  }

  function applyRoleUI() {
    const isAdmin = Auth.isAdmin();
    document.querySelectorAll('[data-admin-only]').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
  }

  /**
   * initSearch — بحث ذكي مع:
   * - Enter يختار أول نتيجة تلقائياً
   * - يُطلق حدث 'account-selected' عند الاختيار
   * - onSelect callback اختياري
   */
  function initSearch(prefix, onSelect) {
    const input    = document.getElementById(prefix + '-search');
    const resBox   = document.getElementById(prefix + '-res');
    const hiddenId = document.getElementById(prefix + '-id') ||
                     document.getElementById(prefix + '-acc-id');
    if (!input || !resBox) return;

    let _debounce;
    let _firstId = null; // أول نتيجة

    input.addEventListener('input', () => {
      clearTimeout(_debounce);
      _debounce = setTimeout(async () => {
        const q = input.value.trim();
        if (!q) { resBox.style.display='none'; _firstId=null; return; }
        const hits = await Accounts.search(q);
        if (!hits.length) { resBox.style.display='none'; _firstId=null; return; }
        _firstId = hits[0].id;
        resBox.innerHTML = hits.map((a,i) =>
          `<div class="s-item${i===0?' s-item-first':''}"
               data-id="${escapeHtml(a.id)}" data-name="${escapeHtml(a.name)}">
             ${escapeHtml(a.id)} — ${escapeHtml(a.name)}
           </div>`
        ).join('');
        resBox.style.display = 'block';
        // تمييز أول عنصر
        const first = resBox.querySelector('.s-item-first');
        if (first) first.style.background = 'var(--gold-dim)';
      }, 180);
    });

    // Enter = اختيار أول نتيجة
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = resBox.querySelector('.s-item');
        if (first) selectItem(first.dataset.id, first.dataset.name);
      }
    });

    resBox.addEventListener('click', (e) => {
      const item = e.target.closest('.s-item');
      if (!item) return;
      selectItem(item.dataset.id, item.dataset.name);
    });

    function selectItem(id, name) {
      input.value = id + ' — ' + name;
      if (hiddenId) hiddenId.value = id;
      resBox.style.display = 'none';
      _firstId = null;
      input.dispatchEvent(new CustomEvent('account-selected', { detail: { id, name } }));
      if (onSelect) onSelect(id, name);
    }

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !resBox.contains(e.target))
        resBox.style.display = 'none';
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function formatDate(isoStr) {
    try {
      return new Date(isoStr).toLocaleString('ar-SA', {
        year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit'
      });
    } catch(e) { return isoStr; }
  }

  // تاريخ اليوم بصيغة YYYY-MM-DD
  function todayStr() {
    return new Date().toISOString().slice(0,10);
  }

  // أول يوم في الشهر الحالي
  function firstOfMonth(offset=0) {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    d.setDate(1);
    return d.toISOString().slice(0,10);
  }

  // آخر يوم في الشهر
  function lastOfMonth(offset=0) {
    const d = new Date();
    d.setMonth(d.getMonth() + offset + 1);
    d.setDate(0);
    return d.toISOString().slice(0,10);
  }

  function exportExcel(tableId, filename) {
    if (typeof XLSX === 'undefined') { toast('مكتبة Excel غير محملة','error'); return; }
    const table = document.getElementById(tableId);
    if (!table) return;
    const wb = XLSX.utils.table_to_book(table, { sheet:'Sheet1' });
    XLSX.writeFile(wb, filename + '.xlsx');
  }

  return {
    toast, showLoading, updateTreasury,
    initSidebar, toggleSidebar, closeSidebarOnNav,
    fillUserInfo, applyRoleUI, initSearch,
    escapeHtml, formatDate, todayStr, firstOfMonth, lastOfMonth,
    exportExcel
  };
})();
