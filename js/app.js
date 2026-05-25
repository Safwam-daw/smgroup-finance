/**
 * app.js — SM-Group App Shell (Supabase version)
 */

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
        <div class="nav-section-label">الرئيسية</div>
        <button class="nav-btn ${activePage==='dashboard'?'active':''}" onclick="navTo('dashboard.html')">
          <span class="nav-icon">📊</span> لوحة التحكم
        </button>
        <div class="nav-section-label">العمليات اليومية</div>
        <button class="nav-btn ${activePage==='accounts'?'active':''}" onclick="navTo('accounts.html')">
          <span class="nav-icon">👥</span> إدارة الحسابات
        </button>
        <button class="nav-btn ${activePage==='deposit'?'active':''}" onclick="navTo('deposit.html')">
          <span class="nav-icon">💵</span> إيداع نقدي
        </button>
        <button class="nav-btn ${activePage==='withdraw'?'active':''}" onclick="navTo('withdraw.html')">
          <span class="nav-icon">💸</span> سحب نقدي
        </button>
        <button class="nav-btn ${activePage==='transfer'?'active':''}" onclick="navTo('transfer.html')">
          <span class="nav-icon">🔄</span> تحويل أرصدة
        </button>
        <button class="nav-btn ${activePage==='ledger'?'active':''}" onclick="navTo('ledger.html')">
          <span class="nav-icon">📒</span> السجل المحاسبي
        </button>
        <button class="nav-btn ${activePage==='statement'?'active':''}" onclick="navTo('statement.html')">
          <span class="nav-icon">📋</span> كشف الحساب
        </button>
        <button class="nav-btn ${activePage==='account-view'?'active':''}" onclick="navTo('accounts.html')">
          <span class="nav-icon">👁️</span> حركات الحساب
        </button>
        <div class="nav-section-label" data-admin-only>الإدارة المتقدمة</div>
        <button class="nav-btn ${activePage==='employees'?'active':''}" data-admin-only onclick="navTo('employees.html')">
          <span class="nav-icon">🛡️</span> إدارة الموظفين
        </button>
        <div class="nav-section-label">أدوات النظام</div>
        <button class="nav-btn" onclick="window.print()">
          <span class="nav-icon">🖨️</span> طباعة الشاشة
        </button>
        <button class="nav-btn" onclick="Storage.exportBackup()">
          <span class="nav-icon">📥</span> تصدير نسخة احتياطية
        </button>
        <button class="nav-btn" style="color:var(--red);" onclick="doLogout()">
          <span class="nav-icon">🚪</span> تسجيل الخروج
        </button>
      </div>
      <div class="sidebar-user">
        <div class="user-avatar" id="nav-avatar"></div>
        <div class="user-info">
          <div class="user-name" id="nav-username"></div>
          <div class="user-role" id="nav-role"></div>
        </div>
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
  return `
    <div id="treasury-bar">
      <div class="stat-card" style="flex:1;border-right:3px solid var(--gold);">
        <div class="stat-label">خزينة الدولار</div>
        <div class="stat-value" id="t-usd" style="color:var(--gold);">$0.00</div>
      </div>
      <div class="stat-card" style="flex:1;border-right:3px solid var(--euro);">
        <div class="stat-label">خزينة اليورو</div>
        <div class="stat-value" id="t-eur" style="color:var(--euro);">€0.00</div>
      </div>
    </div>
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
  if (pageId === 'employees' && !Auth.isAdmin()) {
    window.location.href = 'dashboard.html';
    return false;
  }
  document.body.insertAdjacentHTML('afterbegin', buildSidebar(pageId));
  UI.initSidebar();
  UI.closeSidebarOnNav();
  UI.fillUserInfo();
  UI.applyRoleUI();
  await UI.updateTreasury();
  return true;
}
