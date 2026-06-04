/**
 * auth.js — SM-Group v5
 * الصلاحيات التفصيلية مدمجة مع الجلسة
 */

const Auth = (() => {
  let _activeUser = null;

  // الصلاحيات الافتراضية للأدمن
  const ADMIN_PERMS = {
    dashboard:true, accounts:true, deposit:true, withdraw:true,
    transfer:true, ledger:true, statement:true, employees:true,
    reports:true, audit:true, clientPortal:true,
    viewTreasury:true, viewProfit:true,
    canDelete:true, canEdit:true, exportBackup:true
  };

  const DEFAULT_PERMS = {
    dashboard:false, accounts:true, deposit:true, withdraw:true,
    transfer:true, ledger:true, statement:true, employees:false,
    reports:false, audit:false, clientPortal:false,
    viewTreasury:false, viewProfit:false,
    canDelete:false, canEdit:false, exportBackup:false
  };
  
  function _saveSession(user) {
    try { sessionStorage.setItem('smg_session', JSON.stringify(user)); } catch(e){}
  }
  function _clearSession() {
    try { sessionStorage.removeItem('smg_session'); } catch(e){}
  }

  function restoreSession() {
    try {
      const s = sessionStorage.getItem('smg_session');
      if (!s) return null;
      _activeUser = JSON.parse(s);
      return _activeUser;
    } catch(e) { return null; }
  }

  async function login(username, password) {
    const p    = btoa(password.trim());
    const user = await Storage.findUser(username.trim(), p);
    if (user) {
      _activeUser = user;
      _saveSession(user);
      return { ok:true, user };
    }
    return { ok:false, error:'بيانات الدخول خاطئة' };
  }

  function logout() { _activeUser=null; _clearSession(); }

  function getUser()      { return _activeUser; }
  function isAdmin()      { return _activeUser?.role==='admin'; }
  function isLoggedIn()   { return !!_activeUser; }
  // مالك المنظومة (الأدمن الرئيسي)
  function isSuperAdmin() { return _activeUser?.username==='admin' || _activeUser?.user==='admin'; }
  // أدمن مصغر (role=admin لكن ليس مالك المنظومة)
  function isSubAdmin()   { return _activeUser?.role==='admin' && !isSuperAdmin(); }

  // التحقق من صلاحية معينة
  function can(perm) {
    if (!_activeUser) return false;
    // مالك المنظومة: كل الصلاحيات
    if (isSuperAdmin()) return true;
    // أدمن مصغر: صلاحياته المحددة فقط
    if (_activeUser.role==='admin') {
      const perms = _activeUser.permissions || ADMIN_PERMS;
      return !!perms[perm];
    }
    const perms = _activeUser.permissions || DEFAULT_PERMS;
    return !!perms[perm];
  }

  function getPermissions() {
    if (!_activeUser) return DEFAULT_PERMS;
    if (_activeUser.role==='admin') return ADMIN_PERMS;
    return _activeUser.permissions || DEFAULT_PERMS;
  }

  function requireLogin() {
    if (!_activeUser) { window.location.href='login.html'; return false; }
    return true;
  }

  // حماية صفحة بصلاحية معينة
  function requirePerm(perm) {
    if (!_activeUser) { window.location.href='login.html'; return false; }
    if (!can(perm))   { window.location.href='dashboard.html'; return false; }
    return true;
  }

  return {
    login, logout, getUser, isAdmin, isLoggedIn,
    isSuperAdmin, isSubAdmin,
    restoreSession, requireLogin, requirePerm, can,
    getPermissions, DEFAULT_PERMS, ADMIN_PERMS
  };
})();
