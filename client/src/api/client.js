// client/src/api/client.js
//
// Centralized fetch wrapper. Auto-attaches the JWT from localStorage
// to every request that needs it. Pages don't need to know about auth headers.

const API_BASE = 'http://localhost:3000';

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
    try {
      payload = JSON.parse(text);
    } catch {
      // Not JSON
    }

    const err = new Error(payload?.error || `Request failed: ${res.status}`);
    err.status = res.status;
    err.fields = payload?.fields;     // server-side per-field errors
    err.field = payload?.field;       // single conflicting field name
    throw err;
  }

  return res.json();
}

const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),

  // --- Auth helpers ---

  async login(username, password) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    setUsername(data.username || username);
    setUserId(data.userId);
    return data;
  },

  async register({ username, email, password, role, bio }) {
    const data = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, role, bio }),
    });
    setToken(data.token);
    setUsername(data.username || username);
    setUserId(data.userId);
    return data;
  },

  logout() {
    setToken(null);
    setUsername(null);
    setUserId(null);
  },

  isAuthenticated() {
    return !!getToken();
  },

  getUsername,
  getUserId,
};

export default api;
