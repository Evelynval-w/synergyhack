// client/src/components/LoginScreen.jsx
//
// Login form. Calls auth.login() — Redis stores the session.

import { useState } from 'react';
import useAuth from '../hooks/useAuth';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('makuo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await login(username.trim());
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md p-8 max-w-sm w-full">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">SynergyHack</h1>
        <p className="text-sm text-slate-500 mb-6">
          Find teammates whose skills complement yours.
        </p>

        <label className="block text-sm font-medium text-slate-700 mb-2">
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          placeholder="Enter your username"
        />

        {error && (
          <p className="text-sm text-red-600 mt-2">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !username.trim()}
          className="mt-4 w-full bg-emerald-500 text-white font-medium py-2 rounded-md hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Logging in...' : 'Continue'}
        </button>

        <p className="text-xs text-slate-400 mt-4 text-center">
          Try: makuo, aadithya, chris, lucas, or any seed username.
        </p>
      </div>
    </div>
  );
}
