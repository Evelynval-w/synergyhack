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
    try { payload = JSON.parse(text); } catch { /* not json */ }

    const err = new Error(payload?.error || `Request failed: ${res.status}`);
    err.status = res.status;
    err.fields = payload?.fields;
    err.field = payload?.field;
    throw err;
  }

  return res.json();
}

const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),

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
