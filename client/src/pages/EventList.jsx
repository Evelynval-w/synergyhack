// client/src/pages/EventList.jsx

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { CardSkeleton, EmptyState, ErrorState } from '../components/ui/States';
import useAuth from '../hooks/useAuth';

export default function EventList() {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [events, setEvents] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get('/hackathons'),
      api.get('/users/me').catch(() => null),
    ])
      .then(([data, profile]) => {
        setEvents(data.results || []);
        setMe(profile);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]);

  const isOrg = me?.account_type === 'organization';

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Events</h1>
          <p className="text-sm text-slate-500 mt-1">
            Hackathon events you can register for, host, or recruit around.
          </p>
        </div>
        {isOrg && (
          <button
            type="button"
            onClick={() => setShowCreate(v => !v)}
            className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600"
          >
            {showCreate ? 'Cancel' : 'Create event'}
          </button>
        )}
      </div>

      {showCreate && isOrg && (
        <CreateEventForm
          onCreated={(ev) => {
            setShowCreate(false);
            navigate(`/events/${ev._id}`);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
      ) : error ? (
        <ErrorState title="Couldn't load events" body={error} onRetry={load} />
      ) : events.length === 0 ? (
        <EmptyState icon="◷" title="No events yet" body="Organizations can create public or private hackathon events." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map(ev => (
            <Link
              key={ev._id}
              to={`/events/${ev._id}`}
              className="block bg-white rounded-lg border border-slate-200 p-5 hover:border-emerald-300 hover:shadow-md transition"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  ev.visibility === 'private'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {ev.visibility || 'public'}
                </span>
                <span className="text-xs text-slate-500">{ev.status || 'open'}</span>
              </div>
              <h3 className="font-semibold text-slate-900">{ev.name}</h3>
              {ev.location && <p className="text-xs text-slate-500 mt-1">{ev.location}</p>}
              {ev.description && (
                <p className="text-sm text-slate-600 mt-3 line-clamp-2">{ev.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateEventForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    location: '',
    startDate: '',
    endDate: '',
    visibility: 'public',
    status: 'open',
    registrationMode: 'both',
    leaderboardEnabled: true,
    tracks: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const doc = await api.post('/hackathons', {
        ...form,
        tracks: form.tracks.split(',').map(t => t.trim()).filter(Boolean),
        leaderboardEnabled: !!form.leaderboardEnabled,
      });
      onCreated(doc);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white border border-slate-200 rounded-lg p-5 mb-6 space-y-3">
      <h2 className="text-sm font-semibold text-slate-900">Create event</h2>
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <input required value={form.name} onChange={e => update('name', e.target.value)} placeholder="Event name" className="w-full px-3 py-2 border border-slate-300 rounded-md" />
      <textarea value={form.description} onChange={e => update('description', e.target.value)} placeholder="Description" rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-md resize-none" />
      <input value={form.location} onChange={e => update('location', e.target.value)} placeholder="Location" className="w-full px-3 py-2 border border-slate-300 rounded-md" />
      <div className="grid grid-cols-2 gap-3">
        <input type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} className="px-3 py-2 border border-slate-300 rounded-md" />
        <input type="date" value={form.endDate} onChange={e => update('endDate', e.target.value)} className="px-3 py-2 border border-slate-300 rounded-md" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <select value={form.visibility} onChange={e => update('visibility', e.target.value)} className="px-3 py-2 border border-slate-300 rounded-md bg-white">
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
        <select value={form.status} onChange={e => update('status', e.target.value)} className="px-3 py-2 border border-slate-300 rounded-md bg-white">
          <option value="draft">Draft</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <select value={form.registrationMode} onChange={e => update('registrationMode', e.target.value)} className="px-3 py-2 border border-slate-300 rounded-md bg-white">
          <option value="both">Individuals + teams</option>
          <option value="individual">Individuals only</option>
          <option value="team">Teams only</option>
        </select>
      </div>
      <input value={form.tracks} onChange={e => update('tracks', e.target.value)} placeholder="Tracks (comma-separated)" className="w-full px-3 py-2 border border-slate-300 rounded-md" />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={form.leaderboardEnabled} onChange={e => update('leaderboardEnabled', e.target.checked)} />
        Enable leaderboard
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !form.name.trim()} className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md disabled:bg-slate-300">
          {saving ? 'Creating...' : 'Create'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-slate-600 px-3 py-2">Cancel</button>
      </div>
    </form>
  );
}
