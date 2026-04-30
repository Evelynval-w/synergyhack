// client/src/hooks/useAuth.js
//
// Minimal auth hook. Tracks who's logged in across the app.

import { useState, useEffect } from 'react';
import api from '../api/client';

export default function useAuth() {
  const [username, setUsername] = useState(api.getUsername());
  const [authed, setAuthed] = useState(api.isAuthenticated());

  useEffect(() => {
    // Listen for storage changes (e.g. logout in another tab)
    const onStorage = () => {
      setUsername(api.getUsername());
      setAuthed(api.isAuthenticated());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  async function login(name) {
    await api.login(name);
    setUsername(name);
    setAuthed(true);
  }

  function logout() {
    api.logout();
    setUsername(null);
    setAuthed(false);
  }

  return { username, authed, login, logout };
}
