// client/src/hooks/useAuth.js
//
// Auth state subscriber. The hook does NOT own the login/logout
// implementation — it only subscribes to global auth state changes.
// This avoids a class of React Strict Mode bugs where a component's
// closure over a hook-returned function points at an unmounted
// instance, causing awaits to hang forever (the symptom: clicking
// "Continue" → button shows "Logging in..." → no network request,
// no error, no resolution).

import { useState, useEffect } from 'react';
import api from '../api/client';

export default function useAuth() {
  const [state, setState] = useState(() => ({
    username: api.getUsername(),
    userId: api.getUserId(),
    authed: api.isAuthenticated(),
    ready: !api.isAuthenticated(),
  }));

  useEffect(() => {
    const refresh = () => setState({
      username: api.getUsername(),
      userId: api.getUserId(),
      authed: api.isAuthenticated(),
      ready: true,
    });

    // Soft-validate any stored token once on boot so a stale JWT
    // cannot leave the user stuck in the authenticated shell.
    let cancelled = false;
    (async () => {
      if (!api.isAuthenticated()) {
        if (!cancelled) refresh();
        return;
      }
      await api.validateSession();
      if (!cancelled) refresh();
    })();

    window.addEventListener('storage', refresh);
    window.addEventListener('synergy:auth-changed', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', refresh);
      window.removeEventListener('synergy:auth-changed', refresh);
    };
  }, []);

  return state;
}
