// client/src/api/client.js
//
// Centralized fetch wrapper. Auto-attaches the JWT from localStorage
// to every request that needs it.
//
// API_BASE resolution:
//   - In dev (Vite, port 5173): hits localhost:3000 directly
//   - In production (Nginx-served): uses /api which Nginx proxies
//     to the server container. No CORS, no separate origin.
const API_BASE = import.meta.env.DEV ? 'http://localhost:3000' : '/api';

const AUTH_FAILURE_MESSAGES = new Set([
  'Invalid token',
  'Session expired',
  'No token',
]);

function getToken() {
  return localStorage.getItem('synergy_token');
}

function setToken(token) {
  if (token) localStorage.setItem('synergy_token', token);
  else localStorage.removeItem('synergy_token');
}

function getUsername() {
  return localStorage.getItem('synergy_username');
}

function setUsername(username) {
  if (username) localStorage.setItem('synergy_username', username);
  else localStorage.removeItem('synergy_username');
}

function getUserId() {
  return localStorage.getItem('synergy_user_id');
}

function setUserId(userId) {
  if (userId) localStorage.setItem('synergy_user_id', userId);
  else localStorage.removeItem('synergy_user_id');
}

function clearLocalSession() {
  setToken(null);
  setUsername(null);
  setUserId(null);
  localStorage.removeItem('synergy_account_type');
}

function notifyAuthChanged() {
  window.dispatchEvent(new Event('synergy:auth-changed'));
}

function clearSessionAndNotify() {
  clearLocalSession();
  notifyAuthChanged();
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const text = await res.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { /* not json */ }

    const message = payload?.error || `Request failed: ${res.status}`;

    // Stale/invalid JWT leaves the UI "logged in" while every API
    // returns 401. Clear local session so the app falls back to landing.
    if (
      res.status === 401
      && !options.skipAuthRecovery
      && (AUTH_FAILURE_MESSAGES.has(message) || !!token)
    ) {
      clearSessionAndNotify();
    }

    const err = new Error(message);
    err.status = res.status;
    err.fields = payload?.fields;
    err.field = payload?.field;
    throw err;
  }

  return res.json();
}

const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}), ...options }),
  patch: (path, body, options) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}), ...options }),
  put: (path, body, options) => request(path, { method: 'PUT', body: JSON.stringify(body ?? {}), ...options }),

  async login(username, password) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      skipAuthRecovery: true,
    });
    setToken(data.token);
    setUsername(data.username || username);
    setUserId(data.userId);
    if (data.account_type) localStorage.setItem('synergy_account_type', data.account_type);
    return data;
  },

  async register(payload) {
    const data = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuthRecovery: true,
    });
    setToken(data.token);
    setUsername(data.username);
    setUserId(data.userId);
    if (data.account_type) localStorage.setItem('synergy_account_type', data.account_type);
    return data;
  },
  async logout() {
    try {
      if (getToken()) {
        await request('/auth/logout', {
          method: 'POST',
          body: '{}',
          skipAuthRecovery: true,
        });
      }
    } catch {
      // Still clear local state even if the server session is already gone
    }
    clearLocalSession();
  },

  acceptOAuthSession({ token, userId, username }) {
    setToken(token);
    setUsername(username);
    setUserId(userId);
  },

  clearSessionAndNotify,

  /**
   * Soft-validate a stored token against the API. Returns true if
   * still valid; clears session and returns false on auth failure.
   */
  async validateSession() {
    if (!getToken()) return false;
    try {
      await request('/users/me', { skipAuthRecovery: true });
      return true;
    } catch (err) {
      if (err.status === 401) {
        clearSessionAndNotify();
        return false;
      }
      // Network blip — keep the local session; pages will retry.
      return true;
    }
  },

  authBase() {
    return API_BASE;
  },

  isAuthenticated() {
    return !!getToken();
  },

  getUsername,
  getUserId,
};

export default api;
