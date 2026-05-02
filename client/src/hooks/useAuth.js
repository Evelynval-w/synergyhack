// client/src/hooks/useAuth.js
//
// Minimal auth hook. Tracks who's logged in across the app —
// username + userId so chat can render self-vs-other bubbles.

import { useState, useEffect } from 'react';
import api from '../api/client';

export default function useAuth() {
  const [username, setUsername] = useState(api.getUsername());
  const [userId, setUserId] = useState(api.getUserId());
  const [authed, setAuthed] = useState(api.isAuthenticated());

  useEffect(() => {
    // Listen for storage changes (e.g. logout in another tab)
    const onStorage = () => {
      setUsername(api.getUsername());
      setUserId(api.getUserId());
      setAuthed(api.isAuthenticated());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  async function login(name) {
    const data = await api.login(name);
    setUsername(data.username || name);
    setUserId(data.userId);
    setAuthed(true);
  }

  function logout() {
    api.logout();
    setUsername(null);
    setUserId(null);
    setAuthed(false);
  }

  return { username, userId, authed, login, logout };
}
