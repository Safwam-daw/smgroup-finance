// ══ Theme (Dark/Light) ═══════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('smg_theme') || 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
  localStorage.setItem('smg_theme', theme);
  const icon = document.getElementById('theme-toggle-icon');
  if (icon) {
    icon.textContent = theme === 'light' ? '☀️' : '🌕';
  }
}

function toggleTheme() {
  const current = localStorage.getItem('smg_theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// مكتبة Supabase CDN
const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

function buildSidebar(activePage) {
  return `
    <nav id="sidebar">
      <div class="sidebar-logo">
        <h1>${brandName()}</h1>
        <p>${brandTagline()}</p>
      </div>
      
      <div class="sidebar-nav">
        <!-- زر تبديل الوضع (أيقونة صغيرة) -->
        <div class="theme-toggle-container">
          <button type="button" class="theme-toggle-btn" id="theme-toggle-btn" onclick="toggleTheme()" title="${t('theme_toggle')}">
            <span id="theme-toggle-icon">☀️</span>
          </button>
        </div>

        <div class="nav-section-label">${t('nav_main')}</div>
        <button class="nav-btn ${activePage==='dashboard'?'active':''}" data-page="dashboard" onclick="navTo('dashboard.html')">
          <span class="nav-icon">📊</span> ${t('nav_dashboard')}
        </button>
        <div class="nav-section-label">${t('nav_daily')}</div>
        <button class="nav-btn ${activePage==='accounts'?'active':''}" data-page="accounts" onclick="navTo('accounts.html')">
          <span class="nav-icon">👥</span> ${t('nav_accounts')}
        </button>
        <button class="nav-btn ${activePage==='deposit'?'active':''}" data-page="deposit" onclick="navTo('deposit.html')">
          <span class="nav-icon">💵</span> ${t('nav_deposit')}
        </button>
        <button class="nav-btn ${activePage==='withdraw'?'active':''}" data-page="withdraw" onclick="navTo('withdraw.html')">
          <span class="nav-icon">💸</span> ${t('nav_withdraw')}
        </button>
        <button class="nav-btn ${activePage==='transfer'?'active':''}" data-page="transfer" onclick="navTo('transfer.html')">
          <span class="nav-icon">🔄</span> ${t('nav_transfer')}
        </button>
        <button class="nav-btn ${activePage==='ledger'?'active':''}" data-page="ledger" onclick="navTo('ledger.html')">
          <span class="nav-icon">📒</span> ${t('nav_ledger')}
        </button>
        <div class="nav-section-label" data-admin-only>${t('nav_admin')}</div>
        <button class="nav-btn ${activePage==='employees'?'active':''}" data-admin-only data-page="employees" onclick="navTo('employees.html')">
          <span class="nav-icon">🛡️</span> ${t('nav_employees')}
        </button>
        <div class="nav-section-label" data-admin-only>${t('nav_audit_section')}</div>
        <button class="nav-btn ${activePage==='reports'?'active':''}" data-page="reports" onclick="navTo('reports.html')">
          <span class="nav-icon">📊</span> ${t('nav_reports')}
        </button>
        <div class="nav-section-label">${t('nav_tools')}</div>
        <button class="nav-btn ${activePage==='settings'?'active':''}" onclick="navTo('settings.html')">
          <span class="nav-icon">⚙️</span> ${t('nav_settings')}
        </button>
      </div>

      <div class="sidebar-footer">
        <div class="sidebar-user-box">
          <div class="user-avatar" id="nav-avatar"></div>
          <div class="user-info">
            <div class="user-name" id="nav-username"></div>
            <div class="user-role" id="nav-role"></div>
          </div>
        </div>
        <button class="nav-btn logout-btn" onclick="doLogout()">
          <span class="nav-icon">🚪</span> ${t('logout')}
        </button>
      </div>
    </nav>
    <div id="sidebar-overlay"></div>
    <div id="topbar" style="display:flex; align-items:center; justify-content:space-between; direction:rtl; padding:10px 15px;">
  
  <!-- 1. زر القائمة أصبح في أقصى اليمين -->
  <button id="menu-toggle" aria-label="القائمة">☰</button>
  
  <!-- 2. عنوان المنظومة في المنتصف -->
  <h1 style="margin:0;">${brandName()}</h1>
  
  <!-- 3. أزرار البحث والإشعارات في أقصى اليسار -->
  <div style="display:flex;align-items:center;gap:4px;">
    <button id="search-btn" onclick="GlobalSearch.open()" title="${t('global_search_title')}"
      style="background:none; border:none; cursor:pointer; font-size:1.1rem; padding:4px 8px; color:var(--text2);">
      🔍
    </button>
    <button id="notif-btn" onclick="toggleNotifPanel()"
      style="background:none; border:none; cursor:pointer; position:relative;
      font-size:1.2rem; padding:4px 8px; color:var(--text2);">
      🔔
      <span id="notif-badge" style="display:none; position:absolute; top:0; right:0;
        background:var(--red); color:#fff; border-radius:50%; width:16px; height:16px;
        font-size:0.6rem; font-weight:700; display:flex; align-items:center;
        justify-content:center; line-height:1;">0</span>
    </button>
  </div>

</div>

    <!-- البحث العالمي -->
    <div id="gs-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);
      z-index:600;" onclick="if(event.target===this)GlobalSearch.close()">
      <div style="background:var(--surface);max-width:520px;margin:8vh auto 0;border-radius:var(--radius);
        max-height:80vh;display:flex;flex-direction:column;overflow:hidden;
        box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border);">
          <span style="font-size:1.05rem;">🔍</span>
          <input id="gs-input" type="text" placeholder="${t('global_search_placeholder')}"
            autocomplete="off"
            style="flex:1;background:none;border:none;outline:none;color:var(--text);font-size:0.92rem;font-family:inherit;"
            oninput="GlobalSearch.onInput(this.value)"
            onkeydown="if(event.key==='Escape')GlobalSearch.close()">
          <button onclick="GlobalSearch.close()"
            style="background:none;border:none;color:var(--text3);font-size:1.15rem;cursor:pointer;line-height:1;">✕</button>
        </div>
        <div id="gs-period-bar" style="display:none;gap:6px;padding:8px 14px;border-bottom:1px solid var(--border);overflow-x:auto;"></div>
        <div id="gs-results" style="overflow-y:auto;padding:6px;"></div>
      </div>
    </div>

    <!-- لوحة الإشعارات -->
    <div id="notif-panel" style="display:none;position:fixed;top:60px;left:0;
      width:320px;max-height:400px;background:var(--surface);
      border:1px solid var(--border);border-radius:var(--radius);
      box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:500;overflow:hidden;
      flex-direction:column;">
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:12px 14px;border-bottom:1px solid var(--border);">
        <span style="font-weight:700;font-size:0.88rem;">🔔 ${t('notifications')}</span>
        <button onclick="markAllRead()"
          style="background:none;border:none;color:var(--gold);cursor:pointer;
          font-size:0.74rem;font-family:inherit;">${t('mark_all_read')}</button>
      </div>
      <div id="notif-list" style="overflow-y:auto;max-height:340px;"></div>
    </div>
    <div id="toast"></div>
  `;
}

function buildTreasuryBar() {
  const canTreasury = Auth.can('viewTreasury');
  const canProfit   = Auth.can('viewProfit');
  if (!canTreasury && !canProfit) return '<div id="treasury-bar" style="display:none;"></div>';
  return `
    <div id="treasury-bar">
      ${canTreasury ? `
      <div class="stat-card" style="flex:1;min-width:130px;border-right:3px solid var(--gold);">
        <div class="stat-label">${t('treasury_usd')}</div>
        <div class="stat-value" id="t-usd" style="color:var(--gold);">$0.00</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:130px;border-right:3px solid var(--euro);">
        <div class="stat-label">${t('treasury_eur')}</div>
        <div class="stat-value" id="t-eur" style="color:var(--euro);">€0.00</div>
      </div>` : ''}
      ${canProfit ? `
      <div class="stat-card" style="flex:1;min-width:130px;border-right:3px solid var(--green);">
        <div class="stat-label">${t('treasury_profit')}</div>
        <div style="display:flex;flex-direction:column;gap:2px;">
          <span class="stat-value" id="t-profit-usd" style="color:var(--green);">$0.00</span>
          <span class="stat-value" id="t-profit-eur" style="color:var(--green);">€0.00</span>
        </div>
      </div>` : ''}
    </div>
    <div id="t-extra-currencies" style="display:none;gap:10px;margin-top:10px;flex-wrap:wrap;overflow-x:auto;"></div>
  `;
}

function navTo(page) { window.location.href = page; }

function doLogout() {
  Auth.logout();
  window.location.href = 'login.html';
}

// ══ نظام الإشعارات ════════════════════════════════════
let _notifOpen = false;

async function loadNotifications() {
  const notifs = Auth.can('viewNotifications') || Auth.isAdmin()
    ? await Storage.getNotifications()
    : [];
  // الجرس يبقى دائماً — فقط القائمة فارغة إذا لم تكن الصلاحية
  const unread = notifs.filter(n => !n.is_read).length;
  const badge = document.getElementById('notif-badge');
  if (badge) {
    if (unread > 0) {
      badge.style.display = 'flex';
      badge.textContent = unread > 9 ? '9+' : unread;
    } else {
      badge.style.display = 'none';
    }
  }
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (!notifs.length) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text3);font-size:0.82rem;">${t('no_notifications')}</div>`;
    return;
  }
  list.innerHTML = notifs.map(n => `
    <div onclick="readNotif(${n.id},this)"
      style="padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer;
      background:${n.is_read?'transparent':'var(--gold-dim2)'};
      transition:background 0.2s;">
      <div style="display:flex;gap:8px;align-items:flex-start;">
        <span style="font-size:1.1rem;flex-shrink:0;">${n.icon||'🔔'}</span>
        <div style="flex:1;">
          <div style="font-size:0.82rem;font-weight:${n.is_read?'400':'600'};margin-bottom:3px;">
            ${UI.escapeHtml(n.title||'')}
          </div>
          <div style="font-size:0.74rem;color:var(--text2);">${UI.escapeHtml(n.body||'')}</div>
          <div style="font-size:0.68rem;color:var(--text3);margin-top:4px;">${UI.formatDate(n.created_at)}</div>
        </div>
        ${!n.is_read?'<span style="width:8px;height:8px;border-radius:50%;background:var(--gold);flex-shrink:0;margin-top:4px;"></span>':''}
      </div>
    </div>`).join('');
}

async function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  _notifOpen = !_notifOpen;
  panel.style.display = _notifOpen ? 'flex' : 'none';
  if (_notifOpen) await loadNotifications();
}

async function readNotif(id, el) {
  await Storage.markNotifRead(id);
  if (el) el.style.background = 'transparent';
  await loadNotifications();
}

async function markAllRead() {
  await Storage.markAllNotifsRead();
  await loadNotifications();
}

// إغلاق لوحة الإشعارات عند الضغط خارجها
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notif-panel');
  const btn   = document.getElementById('notif-btn');
  if (panel && _notifOpen && !panel.contains(e.target) && !btn?.contains(e.target)) {
    panel.style.display = 'none';
    _notifOpen = false;
  }
});

async function initApp(pageId) {
  if (!Auth.restoreSession()) {
    window.location.href = 'login.html';
    return false;
  }

  // تحديث عنوان الصفحة باسم الشركة — يستبدل "SM-Group" تلقائياً
  if (typeof brandName === 'function') {
    document.title = document.title.replace(/^SM-Group/, brandName());
  }

  // حماية الصفحات بالصلاحيات
  const permMap = {
    'dashboard':    'dashboard',
    'accounts':     'accounts',
    'deposit':      'deposit',
    'withdraw':     'withdraw',
    'transfer':     'transfer',
    'ledger':       'ledger',
    'statement':    'statement',
    'employees':    'employees',
    'reports':      'reports',
    'account-view': 'accounts',
    'settings':     null
  };

  if (permMap[pageId] !== undefined && permMap[pageId] !== null) {
    if (!Auth.can(permMap[pageId])) {
      // توجيه لأول صفحة يملك المستخدم صلاحيتها
      const fallbackOrder = ['dashboard','deposit','withdraw','transfer','accounts','ledger','reports'];
      const fallback = fallbackOrder.find(p => Auth.can(p));
      window.location.href = fallback ? fallback + '.html' : 'login.html';
      return false;
    }
  }

  document.body.insertAdjacentHTML('afterbegin', buildSidebar(pageId));
  UI.applyNavStyle();
  initTheme();
  UI.initSidebar();
  // تحميل الإشعارات
  setTimeout(() => loadNotifications(), 500);
  UI.closeSidebarOnNav();
  UI.fillUserInfo();
  UI.applyRoleUI();
  applyNavPermissions();

  // تأكد من وجود حساب الأرباح (يُعيد إنشاءه إذا حُذف)
  await Storage.ensureProfitAccount().catch(()=>{});
  // تحديث المرجع الديناميكي لكود حساب الأرباح الفعلي (MIGRATION_V22)
  CONFIG.PROFIT_ACCOUNT_ID = await Storage.getProfitAccountId().catch(()=>CONFIG.PROFIT_ACCOUNT_ID);

  await UI.updateTreasury();
  return true;
}

// إخفاء أزرار التنقل التي ليس للمستخدم صلاحية عليها
function applyNavPermissions() {
  const permMap = {
    'dashboard': 'dashboard',
    'accounts':  'accounts',
    'deposit':   'deposit',
    'withdraw':  'withdraw',
    'transfer':  'transfer',
    'ledger':    'ledger',
    'statement': 'statement',
    'employees': 'employees',
    'reports':   'reports'
  };
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
    const page = btn.dataset.page;
    const perm = permMap[page];
    if (perm && !Auth.can(perm)) btn.style.display = 'none';
  });
}

// ══ البحث العالمي ═══════════════════════════════════════
// يبحث في: رقم/اسم الحساب، رقم العملية، القيمة المالية (تطابق تام).
// لا يبحث في الملاحظات — لا يوجد حقل ملاحظة على العمليات في المخطط الحالي.
const GlobalSearch = (() => {
  let _debounceTimer = null;
  let _lastQuery = '';
  let _period = 'all'; // all | day | week | month

  function open() {
    const overlay = document.getElementById('gs-overlay');
    if (!overlay) return;
    overlay.style.display = 'block';
    const input = document.getElementById('gs-input');
    input.value = '';
    input.focus();
    _period = 'all';
    document.getElementById('gs-period-bar').style.display = 'none';
    document.getElementById('gs-results').innerHTML = _emptyState(t('global_search_hint'));
  }

  function close() {
    const overlay = document.getElementById('gs-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function onInput(val) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => run(val), 300);
  }

  function _emptyState(msg) {
    return `<div style="text-align:center;padding:30px 10px;color:var(--text3);font-size:0.85rem;">${msg}</div>`;
  }

  function _isNumeric(s) { return /^-?\d+(\.\d+)?$/.test(s.trim()); }

  function _periodFromDate(period) {
    const now = new Date();
    if (period === 'day')   { const d = new Date(now); d.setHours(0,0,0,0); return d.toISOString(); }
    if (period === 'week')  { const d = new Date(now); d.setDate(now.getDate()-7); return d.toISOString(); }
    if (period === 'month') { const d = new Date(now); d.setMonth(now.getMonth()-1); return d.toISOString(); }
    return null; // 'all'
  }

  function _periodChipsHTML() {
    const opts = [['all',t('period_all')],['day',t('period_today')],['week',t('period_week')],['month',t('period_month')]];
    return opts.map(([val,label]) => `
      <button onclick="GlobalSearch.setPeriod('${val}')"
        style="white-space:nowrap;padding:4px 12px;border-radius:20px;font-size:0.72rem;cursor:pointer;
        border:1px solid var(--border2);font-family:inherit;
        background:${_period===val?'var(--gold)':'transparent'};color:${_period===val?'#1a1408':'var(--text2)'};">
        ${label}</button>`).join('');
  }

  function setPeriod(p) {
    _period = p;
    document.getElementById('gs-period-bar').innerHTML = _periodChipsHTML();
    run(_lastQuery);
  }

  async function run(query) {
    _lastQuery = (query || '').trim();
    const resultsEl = document.getElementById('gs-results');
    const periodBar = document.getElementById('gs-period-bar');
    if (!_lastQuery) {
      resultsEl.innerHTML = _emptyState(t('global_search_hint'));
      periodBar.style.display = 'none';
      return;
    }
    resultsEl.innerHTML = _emptyState(t('searching_lbl'));

    const isNum = _isNumeric(_lastQuery);
    periodBar.style.display = isNum ? 'flex' : 'none';
    if (isNum) periodBar.innerHTML = _periodChipsHTML();

    const accounts = await Storage.getAccounts();
    const qLower = _lastQuery.toLowerCase();
    const accMatches = accounts.filter(a =>
      String(a.id).toLowerCase().includes(qLower) ||
      (a.name || '').toLowerCase().includes(qLower)
    ).slice(0, 15);

    let txnMatches = [];
    if (isNum) {
      const num = parseFloat(_lastQuery);
      const fromDate = _periodFromDate(_period);
      const txns = await Storage.getTxns(fromDate ? { from_date: fromDate, limit: 300 } : { limit: 300 });
      const byId  = txns.filter(tx => String(tx.id) === _lastQuery);
      const byAmt = txns.filter(tx => parseFloat(tx.amt) === num && String(tx.id) !== _lastQuery);
      txnMatches = [...byId, ...byAmt].slice(0, 30);
    }

    // تجاهل النتائج المتأخرة إن تغيّر النص أثناء الانتظار
    const currentInput = document.getElementById('gs-input');
    if (!currentInput || currentInput.value.trim() !== _lastQuery) return;
    _render(accMatches, txnMatches, accounts);
  }

  function _render(accMatches, txnMatches, allAccounts) {
    const resultsEl = document.getElementById('gs-results');
    if (!accMatches.length && !txnMatches.length) {
      resultsEl.innerHTML = _emptyState(t('no_search_results'));
      return;
    }
    let html = '';
    if (accMatches.length) {
      html += `<div style="font-size:0.7rem;color:var(--text3);padding:8px 8px 4px;">${t('accounts_section_lbl')}</div>`;
      html += accMatches.map(a => `
        <div onclick="GlobalSearch.close();navTo('account-view.html?acc=${a.id}')"
          style="padding:10px 8px;border-radius:8px;cursor:pointer;display:flex;
          justify-content:space-between;align-items:center;gap:8px;">
          <div>
            <div style="font-weight:600;font-size:0.86rem;">${UI.escapeHtml(a.name||'')}</div>
            <div style="font-size:0.7rem;color:var(--text3);">#${UI.escapeHtml(String(a.id))}</div>
          </div>
          <div style="text-align:left;font-size:0.76rem;">
            <div style="color:${(a.bal_usd||0)<0?'var(--red)':'var(--gold)'};">${Currency.formatMoney(a.bal_usd||0,'$')}</div>
            <div style="color:${(a.bal_eur||0)<0?'var(--red)':'var(--euro)'};">${Currency.formatMoney(a.bal_eur||0,'€')}</div>
          </div>
        </div>`).join('');
    }
    if (txnMatches.length) {
      html += `<div style="font-size:0.7rem;color:var(--text3);padding:8px 8px 4px;">${t('transactions_section_lbl')}</div>`;
      const typeLabels = { dep:t('type_dep'), wit:t('type_wit'), trf:t('type_trf'), fee:t('type_fee') };
      html += txnMatches.map(tx => {
        const accId = tx.acc || tx.from || tx.to;
        const acc   = allAccounts.find(a => a.id === accId);
        const sym   = (tx.cur||'').toLowerCase()==='usd' ? '$' : '€';
        return `<div onclick="GlobalSearch.close();navTo('account-view.html?acc=${accId||''}')"
          style="padding:10px 8px;border-radius:8px;cursor:pointer;display:flex;
          justify-content:space-between;align-items:center;gap:8px;">
          <div>
            <div style="font-weight:600;font-size:0.84rem;">${typeLabels[tx.type]||tx.type} · #${tx.id}</div>
            <div style="font-size:0.7rem;color:var(--text3);">${UI.formatDate ? UI.formatDate(tx.date) : tx.date} · ${UI.escapeHtml(acc?.name || accId || '—')}</div>
          </div>
          <div style="font-weight:700;font-size:0.84rem;">${Currency.formatMoney(parseFloat(tx.amt), sym)}</div>
        </div>`;
      }).join('');
    }
    resultsEl.innerHTML = html;
  }

  return { open, close, onInput, setPeriod };
})();
