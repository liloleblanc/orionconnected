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
  // These are the roles the SERVER actually accepts (fids-proxy validRoles).
  // Keep this list in step with it — a role invented here and not there simply
  // cannot log in.
  const ROLES = {
    ADMIN:    'admin',     // Full access + user management
    OPERATOR: 'operator',  // Live data + settings changes
    VIEWER:   'viewer'     // Live data, read-only
  };

  // v23170 — 'demo' IS GONE, AND SIGNED-OUT IS NOW ITS OWN STATE.
  //
  // 'demo' was never a role. The server's validRoles is
  // ["admin","operator","viewer"], so nobody could ever hold it, and nothing in
  // the codebase checked for it. Its only real effect was cosmetic and
  // confusing: it was the DEFAULT value of currentRole, so every ordinary
  // signed-out moment — a closed tab, an expired token, a stray 401 — reported
  // itself as "demo" (Nick: "I will be logged in as admin and then all of a
  // sudden it will fall to the demo, that should not happen"). Nothing had
  // fallen anywhere; the session had simply ended, and the label made an
  // ordinary sign-out look like a mode switch.
  //
  // It also collided with DEMO_SCHEDULES in fids-core.js, which is a genuinely
  // useful and completely unrelated thing: sample flights for showing a board
  // when there is no live feed. That keeps its name. This does not.
  //
  // Signed out is now null, which reads as what it is.
  const SIGNED_OUT = null;

  // NOTE: this table is currently DECORATIVE — hasPermission() is defined below
  // and called from nowhere in the codebase, and the server enforces its own
  // rules regardless. It is kept as the intended shape for the scoped-role work
  // (airline/airport scopes), but do not mistake it for a security control:
  // anything it "protects" is protected by the server or not at all.
  const ROLE_PERMISSIONS = {
    admin:    ['view', 'settings', 'override', 'users', 'api'],
    operator: ['view', 'settings', 'override', 'api'],
    viewer:   ['view', 'api']
  };

  // ── State ─────────────────────────────────────────────────────────────
  let currentUser = null;
  let currentRole = SIGNED_OUT;
  let token = null;
  let onAuthChange = null;  // callback

  // ── Token Management ──────────────────────────────────────────────────
  // v23170 — THE SESSION SURVIVES A CLOSED TAB.
  //
  // The token lived in sessionStorage, which is scoped to ONE TAB and erased
  // when that tab closes. So opening the board in a second tab, restarting the
  // browser, or a kiosk rebooting all presented as "logged out" with nothing
  // actually expired — the token simply was not where anyone looked. Combined
  // with 'demo' being the fallback label, that is the "suddenly in demo" this
  // release is fixing.
  //
  // localStorage is the right scope for an admin session: it is per-origin, not
  // per-tab. The exposure is unchanged in kind — a token readable by script was
  // already readable by script in sessionStorage — and it is still bounded by
  // the server's 24h expiry, which is re-checked on every load below.
  //
  // Legacy sessionStorage values are read once on load and migrated, so anyone
  // signed in when this ships stays signed in.
  function saveToken(jwt, user) {
    token = jwt;
    currentUser = user;
    currentRole = user.role || ROLES.VIEWER;
    try {
      // localStorage is the DURABLE copy — it survives a closed tab.
      localStorage.setItem(TOKEN_KEY, jwt);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      // sessionStorage is kept as a MIRROR, deliberately. Thirteen places
      // across fids-core.js, menu.js and editor-roles.js read the token
      // straight out of sessionStorage rather than going through Auth.
      // Rewriting all thirteen is how one gets missed and admin saves break, so
      // both are written and the mirror is rehydrated on load. If those readers
      // are ever centralised through Auth.getToken(), this line can go.
      sessionStorage.setItem(TOKEN_KEY, jwt);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) { /* storage unavailable — session lasts this page only */ }
  }

  function loadToken() {
    try {
      // localStorage first; fall back to a sessionStorage token left by a
      // pre-v23170 login so an in-flight session is not dropped on upgrade.
      let stored = localStorage.getItem(TOKEN_KEY);
      let storedUser = localStorage.getItem(USER_KEY);
      if (!stored || !storedUser) {
        // Pre-v23170 session, or this tab has only the old per-tab copy.
        stored = sessionStorage.getItem(TOKEN_KEY);
        storedUser = sessionStorage.getItem(USER_KEY);
        if (stored && storedUser) {
          try {   // promote it to the durable copy
            localStorage.setItem(TOKEN_KEY, stored);
            localStorage.setItem(USER_KEY, storedUser);
          } catch (e) {}
        }
      } else {
        // Durable copy exists but this TAB has no mirror — e.g. a new tab, or
        // the browser was restarted. Rehydrate it so the thirteen direct
        // sessionStorage readers keep working in this tab.
        try {
          if (!sessionStorage.getItem(TOKEN_KEY)) {
            sessionStorage.setItem(TOKEN_KEY, stored);
            sessionStorage.setItem(USER_KEY, storedUser);
          }
        } catch (e) {}
      }
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
    currentRole = SIGNED_OUT;
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY);   // and any legacy copy
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
    return currentRole !== SIGNED_OUT && token !== null;
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
