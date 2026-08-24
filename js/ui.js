/**
 * ui.js — SM-Group v4.2
 * إضافة: Enter يختار أول نتيجة، initSearch محسّن
 */
const UI = (() => {

  // ══ نمط التنقل (سايدبار / توب بار) ═══════════════════════
  // الأولوية: تفضيل مُتزامن من القاعدة (users.nav_style) إن وُجد،
  // وإلا القيمة المحلية لهذا الجهاز (localStorage)، وإلا افتراضي
  // حسب نوع الجهاز: قائمة جانبية على الهاتف، شريط علوي على الكمبيوتر.
  function getEffectiveNavStyle() {
    const remote = Auth.getUser()?.nav_style;
    if (remote === 'sidebar' || remote === 'topbar') return remote;
    const local = localStorage.getItem('sm_nav_style');
    if (local === 'sidebar' || local === 'topbar') return local;
    return window.innerWidth <= 900 ? 'sidebar' : 'topbar';
  }

  function applyNavStyle() {
    const style = getEffectiveNavStyle();
    document.body.classList.toggle('nav-topbar', style === 'topbar');
  }

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
        <div style="font-size:0.82rem;color:var(--text2);">${typeof t === 'function' ? t('loading') : 'جاري التحميل…'}</div>
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
    const [totals, profit, cashbox, activeCurs] = await Promise.all([
      Storage.getTreasuryTotals(),
      Storage.getProfitBalance(),
      (typeof Storage !== 'undefined' && Storage.getCashboxBalance) ? Storage.getCashboxBalance() : Promise.resolve({usd:0,eur:0}),
      (typeof Currency !== 'undefined') ? Currency.getActive() : Promise.resolve([
        { code:'USD', symbol:'$' }, { code:'EUR', symbol:'€' }
      ])
    ]);

    // تحديث الخزينة الرئيسية
    const fmtMoney = (v, s) => (typeof Currency !== 'undefined') ? Currency.formatMoney(v, s) : s + v.toFixed(2);
    const usd = totals.usd || 0;
    const eur = totals.eur || 0;
    const usdEl = document.getElementById('t-usd');
    const eurEl = document.getElementById('t-eur');
    if (usdEl) { usdEl.textContent = fmtMoney(usd,'$'); usdEl.style.color = usd<0?'var(--red)':'var(--gold)'; }
    if (eurEl) { eurEl.textContent = fmtMoney(eur,'€'); eurEl.style.color = eur<0?'var(--red)':'var(--euro)'; }
    if (typeof Storage !== 'undefined' && Storage.checkTreasuryAlerts) {
      Storage.checkTreasuryAlerts(usd, eur).catch(()=>{});
    }

    // تحديث الأرباح
    const pusd = profit.usd || 0;
    const peur = profit.eur || 0;
    const pusdEl = document.getElementById('t-profit-usd');
    const peurEl = document.getElementById('t-profit-eur');
    if (pusdEl) { pusdEl.textContent = fmtMoney(pusd,'$'); pusdEl.style.color = pusd<0?'var(--red)':'var(--green)'; }
    if (peurEl) { peurEl.textContent = fmtMoney(peur,'€'); peurEl.style.color = peur<0?'var(--red)':'var(--green)'; }

    // تحديث صندوق النقد الفعلي (القيد المزدوج — MIGRATION_V29)
    // اصطلاح: سالب = الخزينة لديها نقد (فائض) — موجب = الخزينة تحتاج نقداً (عجز)
    const _t = (k) => (typeof I18n !== 'undefined') ? I18n.t(k) : k;
    const fmtCashbox = (val, sym) => {
      const amt = fmtMoney(Math.abs(val), sym);
      if (val < 0) return { text: `🟢 ${_t('cashbox_has')} ${amt}`, color: 'var(--green)' };
      if (val > 0) return { text: `🔴 ${_t('cashbox_needs')} ${amt}`, color: 'var(--red)' };
      return { text: amt, color: 'var(--text2)' };
    };
    const cbUsdEl = document.getElementById('t-cashbox-usd');
    const cbEurEl = document.getElementById('t-cashbox-eur');
    if (cbUsdEl) { const r = fmtCashbox(cashbox.usd||0,'$'); cbUsdEl.textContent = r.text; cbUsdEl.style.color = r.color; }
    if (cbEurEl) { const r = fmtCashbox(cashbox.eur||0,'€'); cbEurEl.textContent = r.text; cbEurEl.style.color = r.color; }

    // تحديث العملات الإضافية
    const extraBar = document.getElementById('t-extra-currencies');
    if (extraBar) {
      const extraCurs = activeCurs.filter(c => c.code !== 'USD' && c.code !== 'EUR');
      extraBar.innerHTML = extraCurs.map(c => {
        const val = totals[c.code.toLowerCase()] || 0;
        return `<div class="stat-card" style="flex:1;min-width:120px;padding:12px 14px;border-right:2px solid var(--border2);">
          <div class="stat-label">${escapeHtml(c.symbol)} ${escapeHtml(c.name)}</div>
          <div class="stat-value" style="font-size:1rem;color:${val<0?'var(--red)':'var(--text2)'};">
            ${fmtMoney(val, c.symbol)}
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
      btn.addEventListener('click', () => toggleSidebar(false));
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
   * initSearch — بحث ذكي مُقسّم لحقلين منفصلين:
   * - بحث بالكود (يطابق بداية الكود فقط)
   * - بحث بالاسم (يحتوي على النص فقط، لا يلمس الكود)
   * يستبدل حقل البحث المدمج القديم تلقائياً بحقلين، دون الحاجة لتعديل HTML كل صفحة.
   * - Enter يختار أول نتيجة تلقائياً
   * - يُطلق حدث 'account-selected' عند الاختيار
   * - onSelect callback اختياري
   */
  function initSearch(prefix, onSelect) {
    const oldInput = document.getElementById(prefix + '-search');
    const resBox   = document.getElementById(prefix + '-res');
    const hiddenId = document.getElementById(prefix + '-id') ||
                     document.getElementById(prefix + '-acc-id');
    if (!oldInput || !resBox) return;

    // استبدال الحقل الواحد بحقلين منفصلين (كود / اسم)
    const row = document.createElement('div');
    row.className = 'dual-search-row';
    const codePh = (window.I18n && I18n.t('search_by_code_ph')) || 'بحث بالكود…';
    const namePh = (window.I18n && I18n.t('search_by_name_ph')) || 'بحث بالاسم…';
    row.innerHTML = `
      <input type="text" id="${prefix}-search-code" inputmode="numeric" pattern="[0-9]*" placeholder="${codePh}" autocomplete="off">
      <input type="text" id="${prefix}-search-name" placeholder="${namePh}" autocomplete="off">
    `;
    oldInput.replaceWith(row);
    const codeInput = document.getElementById(prefix + '-search-code');
    const nameInput = document.getElementById(prefix + '-search-name');

    let _debounce;

    async function runSearch(mode) {
      clearTimeout(_debounce);
      _debounce = setTimeout(async () => {
        const q = mode === 'code' ? codeInput.value.trim() : nameInput.value.trim();
        if (!q) { resBox.style.display='none'; return; }
        const hits = mode === 'code'
          ? await Accounts.searchByCode(q)
          : await Accounts.searchByName(q);
        if (!hits.length) { resBox.style.display='none'; return; }
        resBox.innerHTML = hits.map((a,i) =>
          `<div class="s-item${i===0?' s-item-first':''}"
               data-id="${escapeHtml(a.id)}" data-name="${escapeHtml(a.name)}">
             ${escapeHtml(a.id)} — ${escapeHtml(a.name)}
           </div>`
        ).join('');
        resBox.style.display = 'block';
        const first = resBox.querySelector('.s-item-first');
        if (first) first.style.background = 'var(--gold-dim)';
      }, 180);
    }

    codeInput.addEventListener('input', () => { nameInput.value=''; runSearch('code'); });
    nameInput.addEventListener('input', () => { codeInput.value=''; runSearch('name'); });

    [codeInput, nameInput].forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const first = resBox.querySelector('.s-item');
          if (first) selectItem(first.dataset.id, first.dataset.name);
        }
      });
    });

    resBox.addEventListener('click', (e) => {
      const item = e.target.closest('.s-item');
      if (!item) return;
      selectItem(item.dataset.id, item.dataset.name);
    });

    function selectItem(id, name) {
      codeInput.value = id;
      nameInput.value = name;
      if (hiddenId) hiddenId.value = id;
      resBox.style.display = 'none';
      codeInput.dispatchEvent(new CustomEvent('account-selected', { detail: { id, name } }));
      if (onSelect) onSelect(id, name);
    }

    document.addEventListener('click', (e) => {
      if (!row.contains(e.target) && !resBox.contains(e.target))
        resBox.style.display = 'none';
    });
  }

  // يملأ حقلي الكود/الاسم لبحث initSearch برمجياً (روابط مباشرة ?acc=XXXX مثلاً)
  function setSearchValue(prefix, id, name) {
    const codeInput = document.getElementById(prefix + '-search-code');
    const nameInput = document.getElementById(prefix + '-search-name');
    const hiddenId  = document.getElementById(prefix + '-id') ||
                      document.getElementById(prefix + '-acc-id');
    if (codeInput) codeInput.value = id;
    if (nameInput) nameInput.value = name;
    if (hiddenId)  hiddenId.value  = id;
  }

  // يفرّغ حقلي بحث initSearch والمعرّف المخفي (بعد إتمام عملية مثلاً)
  function clearSearch(prefix) {
    const codeInput = document.getElementById(prefix + '-search-code');
    const nameInput = document.getElementById(prefix + '-search-name');
    const hiddenId  = document.getElementById(prefix + '-id') ||
                      document.getElementById(prefix + '-acc-id');
    if (codeInput) codeInput.value = '';
    if (nameInput) nameInput.value = '';
    if (hiddenId)  hiddenId.value  = '';
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

  // يحوّل Date إلى نص YYYY-MM-DD بالتوقيت المحلي (وليس UTC)
  function _localDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  // تاريخ اليوم بصيغة YYYY-MM-DD (بالتوقيت المحلي للمتصفح)
  function todayStr() {
    return _localDateStr(new Date());
  }

  // أول يوم في الشهر الحالي
  function firstOfMonth(offset=0) {
    const d = new Date();
    d.setDate(1); // نضبط اليوم أولاً لتفادي مشاكل الأشهر ذات الأيام الأقل عند تغيير الشهر
    d.setMonth(d.getMonth() + offset);
    return _localDateStr(d);
  }

  // آخر يوم في الشهر
  function lastOfMonth(offset=0) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset + 1);
    d.setDate(0);
    return _localDateStr(d);
  }

  function exportExcel(tableId, filename) {
    if (typeof XLSX === 'undefined') { toast(typeof t==='function'?t('excel_not_loaded'):'مكتبة Excel غير محملة','error'); return; }
    const table = document.getElementById(tableId);
    if (!table) return;
    const wb = XLSX.utils.table_to_book(table, { sheet:'Sheet1' });
    XLSX.writeFile(wb, filename + '.xlsx');
  }

  // يستبعد حركات الحسابات المؤرشفة (المحذوفة) اعتماداً على وجود الحساب
  // فعلياً في قائمة الحسابات الحالية — وليس تخمين بادئة الكود (مثل '7')،
  // لأن حسابات قديمة مستوردة قد يكون كودها 707 أو 2014 دون أن تكون مؤرشفة
  function filterActiveTxns(txns, accounts) {
    const ids = new Set((accounts||[]).map(a => a.id));
    return (txns||[]).filter(t =>
      (!t.acc  || ids.has(t.acc))  &&
      (!t.from || ids.has(t.from)) &&
      (!t.to   || ids.has(t.to))
    );
  }

  // اسم ملف موحّد لأي مستند مالي محفوظ (كشف/إيصال):
  // {البادئة}_{الاسم}_كود_({الكود})_{التاريخ}
  // مثال: docFileName('دفتر_الاستاذ', 'صفوان', '0001') => "دفتر_الاستاذ_صفوان_كود_(0001)_2026.08.16"
  function docFileName(prefix, name, code) {
    const safeName = String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '—';
    const safeCode = String(code ?? '').replace(/[\\/:*?"<>|]/g, '_').trim();
    const d = new Date();
    const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
    return `${prefix}_${safeName}_كود_(${safeCode})_${dateStr}`;
  }

  return {
    toast, showLoading, updateTreasury,
    initSidebar, toggleSidebar, closeSidebarOnNav,
    fillUserInfo, applyRoleUI, initSearch, setSearchValue, clearSearch,
    escapeHtml, formatDate, todayStr, firstOfMonth, lastOfMonth, filterActiveTxns,
    exportExcel, getEffectiveNavStyle, applyNavStyle, docFileName
  };
})();
