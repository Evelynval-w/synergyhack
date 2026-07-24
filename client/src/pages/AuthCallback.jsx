// client/src/pages/AuthCallback.jsx
//
// OAuth redirect landing. Providers bounce here with
// #token=&userId=&username= (or #error=). Stores the session and
// flips auth state so App remounts into the authenticated shell.

import { useEffect, useState } from 'react';
import api from '../api/client';

function readHashParams() {
  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(raw);
}

export default function AuthCallback() {
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = readHashParams();
    const err = params.get('error');
    if (err) {
      setError(err);
      return;
    }

    const token = params.get('token');
    const userId = params.get('userId');
    const username = params.get('username');

    if (!token || !userId || !username) {
      // Already signed in (e.g. remount after success) — go to app.
      if (api.isAuthenticated()) {
        window.location.replace('/teams');
        return;
      }
      setError('Missing session from OAuth provider.');
      return;
    }

    api.acceptOAuthSession({ token, userId, username });
    // Strip hash before remount so a second AuthCallback pass is clean.
    window.history.replaceState(null, '', '/auth/callback');
    window.dispatchEvent(new Event('synergy:auth-changed'));
    // Full navigation avoids racing a new BrowserRouter remount.
    window.location.replace('/teams');
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Sign-in failed</h1>
          <p className="text-sm text-red-600 mb-6">{error}</p>
          <a
            href="/"
            className="inline-block bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <p className="text-sm text-slate-500">Completing sign-in...</p>
    </div>
  );
}
