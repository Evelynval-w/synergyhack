// client/src/pages/Profile.jsx

import { useState } from 'react';
import api from '../api/client';
import useAuth from '../hooks/useAuth';

export default function Profile() {
  const { username, authed, logout } = useAuth();
  const [bio, setBio] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  if (!authed) {
    return <div className="text-center mt-16">Please log in to see your profile.</div>;
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.patch(`/users/${username}`, { bio, role });
      setMessage('Saved.');
    } catch (err) {
      setMessage(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto mt-12 p-8 bg-white rounded-lg shadow">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">{username}</h1>
        </div>
        <button onClick={logout} className="text-sm text-red-600 underline">Log out</button>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Bio</label>
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border rounded"
            placeholder="Tell people about your skills, interests, what you're building..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Role preference</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="">— select —</option>
            <option>Frontend</option>
            <option>Backend</option>
            <option>Designer</option>
            <option>Data</option>
            <option>PM</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {message && <p className="text-sm text-gray-600">{message}</p>}
      </form>
    </div>
  );
}