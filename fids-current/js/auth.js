/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FIDS v8 — Auth Module
   Handles JWT-based authentication via Cloudflare Worker
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Auth = (() => {
  // ── Configuration ─────────────────────────────────────────────────────
  const WORKER_URL = 'https://fids-proxy.n-leblanc1984.workers.dev';
  const TOKEN_KEY  = 'fids_token';
  const USER_KEY   = 'fids_user';

  // ── Roles ─────────────────────────────────────────────────────────────
  const ROLES = {
    ADMIN:    'admin',     // Full access + user management
    OPERATOR: 'operator',  // Live data + settings changes
    VIEWER:   'viewer',    // Live data, read-only
    DEMO:     'demo'       // No auth, demo data only
  };

  const ROLE_PERMISSIONS = {
    admin:    ['view', 'settings', 'override', 'users', 'api'],
    operator: ['view', 'settings', 'override', 'api'],
    viewer:   ['view', 'api'],
    demo:     ['view']
  };

  // ── State ─────────────────────────────────────────────────────────────
  let currentUser = null;
  let currentRole = ROLES.DEMO;
  let token = null;
  let onAuthChange = null;  // callback

  // ── Token Management ──────────────────────────────────────────────────
  function saveToken(jwt, user) {
    token = jwt;
    currentUser = user;
    currentRole = user.role || ROLES.VIEWER;
    try {
      sessionStorage.setItem(TOKEN_KEY, jwt);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) { /* sessionStorage not available */ }
  }

  function loadToken() {
    try {
      const stored = sessionStorage.getItem(TOKEN_KEY);
      const storedUser = sessionStorage.getItem(USER_KEY);
      if (stored && storedUser) {
        token = stored;
        currentUser = JSON.parse(storedUser);
        currentRole = currentUser.role || ROLES.VIEWER;
        // Validate token hasn't expired (check payload)
        const payload = parseJwt(stored);
        if (payload && payload.exp && Date.now() / 1000 > payload.exp) {
          clearToken();
          return false;
        }
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function clearToken() {
    token = null;
    currentUser = null;
    currentRole = ROLES.DEMO;
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch (e) { /* ignore */ }
  }

  function parseJwt(jwt) {
    try {
      const parts = jwt.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload;
    } catch (e) { return null; }
  }

  // ── Login ─────────────────────────────────────────────────────────────
  async function login(username, password) {
    try {
      const res = await fetch(`${WORKER_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error || 'Invalid credentials' };
      }

      const data = await res.json();
      saveToken(data.token, data.user);

      if (onAuthChange) onAuthChange(true, currentUser);

      return { success: true, user: data.user };
    } catch (e) {
      return { success: false, error: 'Connection failed. Check network.' };
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────
  function logout() {
    clearToken();
    if (onAuthChange) onAuthChange(false, null);
  }

  // ── Permission Checks ─────────────────────────────────────────────────
  function can(permission) {
    const perms = ROLE_PERMISSIONS[currentRole] || [];
    return perms.includes(permission);
  }

  function isLive() {
    return currentRole !== ROLES.DEMO && token !== null;
  }

  function isAdmin() {
    return currentRole === ROLES.ADMIN;
  }

  // ── Authenticated Fetch (adds JWT header) ─────────────────────────────
  async function authFetch(url, options = {}) {
    if (!token) {
      throw new Error('Not authenticated');
    }
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
    return fetch(url, { ...options, headers });
  }

  // ── User Management (Admin only) ─────────────────────────────────────
  async function listUsers() {
    if (!isAdmin()) return { success: false, error: 'Unauthorized' };
    try {
      const res = await authFetch(`${WORKER_URL}/auth/users`);
      if (!res.ok) throw new Error('Failed to fetch users');
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function createUser(username, password, role, displayName) {
    if (!isAdmin()) return { success: false, error: 'Unauthorized' };
    try {
      const res = await authFetch(`${WORKER_URL}/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role, displayName })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error || 'Failed to create user' };
      }
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function deleteUser(username) {
    if (!isAdmin()) return { success: false, error: 'Unauthorized' };
    try {
      const res = await authFetch(`${WORKER_URL}/auth/users/${username}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete user');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function updateUser(username, updates) {
    if (!isAdmin()) return { success: false, error: 'Unauthorized' };
    try {
      const res = await authFetch(`${WORKER_URL}/auth/users/${username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed to update user');
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ── Initialize ────────────────────────────────────────────────────────
  function init(callback) {
    onAuthChange = callback;
    return loadToken();
  }

  // ── Public API ────────────────────────────────────────────────────────
  return {
    ROLES,
    init,
    login,
    logout,
    can,
    isLive,
    isAdmin,
    authFetch,
    listUsers,
    createUser,
    deleteUser,
    updateUser,
    get user()  { return currentUser; },
    get role()  { return currentRole; },
    get token() { return token; },
    get workerUrl() { return WORKER_URL; }
  };
})();
