// client/src/api/client.js
//
// Centralized fetch wrapper. Auto-attaches the JWT from localStorage
// to every request that needs it. Pages don't need to know about auth headers.

const API_BASE = 'http://localhost:3000';

function getToken() {
  return localStorage.getItem('synergy_token');
}

function setToken(token) {
  if (token) {
    localStorage.setItem('synergy_token', token);
  } else {
    localStorage.removeItem('synergy_token');
  }
}

function getUsername() {
  return localStorage.getItem('synergy_username');
}

function setUsername(username) {
  if (username) {
    localStorage.setItem('synergy_username', username);
  } else {
    localStorage.removeItem('synergy_username');
  }
}

function getUserId() {
  return localStorage.getItem('synergy_user_id');
}

function setUserId(userId) {
  if (userId) {
    localStorage.setItem('synergy_user_id', userId);
  } else {
    localStorage.removeItem('synergy_user_id');
  }
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
    let message = `Request failed: ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json.error) message = json.error;
    } catch {
      // Not JSON, use the status code message
    }
    throw new Error(message);
  }

  return res.json();
}

const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),

  // Auth helpers
  async login(username) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    // Server returns { token, userId, username } since the Phase 6 auth fix.
    // Capture all three so the chat UI knows who "me" is when rendering.
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
