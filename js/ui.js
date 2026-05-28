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
    const [totals, profit, activeCurs] = await Promise.all([
      Storage.getTreasuryTotals(),
      Storage.getProfitBalance(),
      (typeof Currency !== 'undefined') ? Currency.getActive() : Promise.resolve([
        { code:'USD', symbol:'$' }, { code:'EUR', symbol:'€' }
      ])
    ]);

    // تحديث الخزينة الرئيسية
    const usd = totals.usd || 0;
    const eur = totals.eur || 0;
    const usdEl = document.getElementById('t-usd');
    const eurEl = document.getElementById('t-eur');
    if (usdEl) { usdEl.textContent = '$'+usd.toFixed(2); usdEl.style.color = usd<0?'var(--red)':'var(--gold)'; }
    if (eurEl) { eurEl.textContent = '€'+eur.toFixed(2); eurEl.style.color = eur<0?'var(--red)':'var(--euro)'; }

    // تحديث الأرباح
    const pusd = profit.usd || 0;
    const peur = profit.eur || 0;
    const pusdEl = document.getElementById('t-profit-usd');
    const peurEl = document.getElementById('t-profit-eur');
    if (pusdEl) { pusdEl.textContent = '$'+pusd.toFixed(2); pusdEl.style.color = pusd<0?'var(--red)':'var(--green)'; }
    if (peurEl) { peurEl.textContent = '€'+peur.toFixed(2); peurEl.style.color = peur<0?'var(--red)':'var(--green)'; }

    // تحديث العملات الإضافية
    const extraBar = document.getElementById('t-extra-currencies');
    if (extraBar) {
      const extraCurs = activeCurs.filter(c => c.code !== 'USD' && c.code !== 'EUR');
      extraBar.innerHTML = extraCurs.map(c => {
        const val = totals[c.code.toLowerCase()] || 0;
        return `<div class="stat-card" style="flex:1;min-width:120px;padding:12px 14px;border-right:2px solid var(--border2);">
          <div class="stat-label">${escapeHtml(c.symbol)} ${escapeHtml(c.name)}</div>
          <div class="stat-value" style="font-size:1rem;color:${val<0?'var(--red)':'var(--text2)'};">
            ${c.symbol}${val.toFixed(2)}
          </div>
        </div>`;
      }).join('');
      extraBar.style.display = extraCurs.length ? 'flex' : 'none';
    }
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
