// ══ Theme (Dark/Light) ═══════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('smg_theme') || 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
  localStorage.setItem('smg_theme', theme);
  const checkbox = document.getElementById('theme-toggle-checkbox');
  if (checkbox) {
    checkbox.checked = (theme === 'light');
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
        <h1>SM-Group</h1>
        <p>نظام إدارة الخزينة المزدوجة</p>
      </div>
      
      <div class="sidebar-nav">
        <!-- زر تبديل الوضع المطور (سويتش متحرك) -->
        <div class="theme-switch-container">
          <span class="theme-switch-label">🌙 مظهر داكن</span>
          <label class="theme-switch">
            <input type="checkbox" id="theme-toggle-checkbox" onclick="toggleTheme()">
            <span class="slider"></span>
          </label>
          <span class="theme-switch-label">☀️ مظهر فاتح</span>
        </div>

        <div class="nav-section-label">الرئيسية</div>
        <button class="nav-btn ${activePage==='dashboard'?'active':''}" data-page="dashboard" onclick="navTo('dashboard.html')">
          <span class="nav-icon">📊</span> لوحة التحكم
        </button>
        <button class="nav-btn ${activePage==='analytics'?'active':''}" data-admin-only onclick="navTo('analytics.html')">
          <span class="nav-icon">📈</span> الإحصائيات
        </button>
        <div class="nav-section-label">العمليات اليومية</div>
        <button class="nav-btn ${activePage==='accounts'?'active':''}" data-page="accounts" onclick="navTo('accounts.html')">
          <span class="nav-icon">👥</span> إدارة الحسابات
        </button>
        <button class="nav-btn ${activePage==='deposit'?'active':''}" data-page="deposit" onclick="navTo('deposit.html')">
          <span class="nav-icon">💵</span> إيداع نقدي
        </button>
        <button class="nav-btn ${activePage==='withdraw'?'active':''}" data-page="withdraw" onclick="navTo('withdraw.html')">
          <span class="nav-icon">💸</span> سحب نقدي
        </button>
        <button class="nav-btn ${activePage==='transfer'?'active':''}" data-page="transfer" onclick="navTo('transfer.html')">
          <span class="nav-icon">🔄</span> تحويل أرصدة
        </button>
        <button class="nav-btn ${activePage==='ledger'?'active':''}" data-page="ledger" onclick="navTo('ledger.html')">
          <span class="nav-icon">📒</span> السجل المحاسبي
        </button>
        <button class="nav-btn ${activePage==='statement'?'active':''}" data-page="statement" onclick="navTo('statement.html')">
          <span class="nav-icon">📋</span> كشف الحساب
        </button>
        <div class="nav-section-label" data-admin-only>الإدارة المتقدمة</div>
        <button class="nav-btn ${activePage==='employees'?'active':''}" data-admin-only data-page="employees" onclick="navTo('employees.html')">
          <span class="nav-icon">🛡️</span> إدارة الموظفين
        </button>
        <div class="nav-section-label" data-admin-only>التحليل والتدقيق</div>
        <button class="nav-btn ${activePage==='reports'?'active':''}" data-page="reports" onclick="navTo('reports.html')">
          <span class="nav-icon">📊</span> التقارير
        </button>
        <button class="nav-btn ${activePage==='audit'?'active':''}" data-page="audit" onclick="navTo('audit.html')">
          <span class="nav-icon">🔍</span> سجل التدقيق
        </button>
        <div class="nav-section-label">أدوات النظام</div>
        <button class="nav-btn" data-page="clientPortal" onclick="window.open('client.html','_blank')">
          <span class="nav-icon">👤</span> بوابة الزبون
        </button>
        <button class="nav-btn ${activePage==='settings'?'active':''}" onclick="navTo('settings.html')">
          <span class="nav-icon">⚙️</span> الإعدادات
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
          <span class="nav-icon">🚪</span> تسجيل الخروج
        </button>
      </div>
    </nav>
    <div id="sidebar-overlay"></div>
    <div id="topbar">
      <h1>SM-Group</h1>
      <button id="menu-toggle" aria-label="القائمة">☰</button>
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
        <div class="stat-label">💵 خزينة الدولار</div>
        <div class="stat-value" id="t-usd" style="color:var(--gold);">$0.00</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:130px;border-right:3px solid var(--euro);">
        <div class="stat-label">💶 خزينة اليورو</div>
        <div class="stat-value" id="t-eur" style="color:var(--euro);">€0.00</div>
      </div>` : ''}
      ${canProfit ? `
      <div class="stat-card" style="flex:1;min-width:130px;border-right:3px solid var(--green);">
        <div class="stat-label">📈 الأرباح</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:baseline;">
          <span class="stat-value" id="t-profit-usd" style="color:var(--green);font-size:1rem;">$0.00</span>
          <span style="color:var(--green);font-weight:700;font-size:0.95rem;" id="t-profit-eur">€0.00</span>
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

async function initApp(pageId) {
  if (!Auth.restoreSession()) {
    window.location.href = 'login.html';
    return false;
  }

  // حماية الصفحات بالصلاحيات
  const permMap = {
    'dashboard': 'dashboard',
    'accounts':  'accounts',
    'deposit':   'deposit',
    'withdraw':  'withdraw',
    'transfer':  'transfer',
    'ledger':    'ledger',
    'statement': 'statement',
    'employees': 'employees',
    'reports':      'reports',
    'audit':        'audit',
    'account-view': 'accounts',
    'settings':     null  // متاح للجميع
  };

  if (permMap[pageId] !== undefined && permMap[pageId] !== null) {
    if (!Auth.can(permMap[pageId])) {
      window.location.href = 'deposit.html'; // توجيه للصفحة الأساسية
      return false;
    }
  }

  document.body.insertAdjacentHTML('afterbegin', buildSidebar(pageId));
  initTheme();
  UI.initSidebar();
  UI.closeSidebarOnNav();
  UI.fillUserInfo();
  UI.applyRoleUI();
  applyNavPermissions();

  // تأكد من وجود حساب الأرباح (يُعيد إنشاءه إذا حُذف)
  Storage.ensureProfitAccount().catch(()=>{});

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
    'reports':   'reports',
    'audit':        'audit',
    'clientPortal': 'clientPortal'
  };
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
    const page = btn.dataset.page;
    const perm = permMap[page];
    if (perm && !Auth.can(perm)) btn.style.display = 'none';
  });
}
