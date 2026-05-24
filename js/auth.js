/**
 * auth.js — SM-Group Authentication (Supabase)
 */

const Auth = (() => {
  let _activeUser = null;

  function _saveSession(user) {
    try { sessionStorage.setItem('smg_session', JSON.stringify(user)); } catch(e) {}
  }
  function _clearSession() {
    try { sessionStorage.removeItem('smg_session'); } catch(e) {}
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
    const p = btoa(password.trim());
    const user = await Storage.findUser(username.trim(), p);
    if (user) {
      _activeUser = user;
      _saveSession(user);
      return { ok: true, user };
    }
    return { ok: false, error: 'بيانات الدخول خاطئة' };
  }

  function logout() {
    _activeUser = null;
    _clearSession();
  }

  function getUser()    { return _activeUser; }
  function isAdmin()    { return _activeUser?.role === 'admin'; }
  function isLoggedIn() { return !!_activeUser; }

  function requireLogin() {
    if (!_activeUser) { window.location.href = 'login.html'; return false; }
    return true;
  }
  function requireAdmin() {
    return !!(_activeUser && _activeUser.role === 'admin');
  }

  return { login, logout, getUser, isAdmin, isLoggedIn, restoreSession, requireLogin, requireAdmin };
})();
