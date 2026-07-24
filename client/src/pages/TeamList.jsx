// client/src/pages/TeamList.jsx
//
// Browse + search teams, plus create-team form for authenticated users.

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { CardSkeleton, EmptyState, ErrorState } from '../components/ui/States';

export default function TeamList() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchTeams = () => {
    setLoading(true);
    setError(null);
    const path = submittedQuery
      ? `/teams?q=${encodeURIComponent(submittedQuery)}`
      : '/teams';
    return api.get(path)
      .then(data => setTeams(data.results || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedQuery]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmittedQuery(query.trim());
  };

  const handleClear = () => {
    setQuery('');
    setSubmittedQuery('');
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teams</h1>
          <p className="text-sm text-slate-500 mt-1">
            Browse teams or search by name or what they're building.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(v => !v)}
          className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 transition shrink-0"
        >
          {showCreate ? 'Cancel' : 'Create team'}
        </button>
      </div>

      {showCreate && (
        <CreateTeamForm
          onCreated={(team) => {
            setShowCreate(false);
            navigate(`/teams/${team.id}`);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <form onSubmit={handleSubmit} className="mb-6 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="e.g. climate, AI agent, code review..."
          className="flex-1 px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />
        <button
          type="submit"
          className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 transition"
        >
          Search
        </button>
        {submittedQuery && (
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-slate-500 hover:text-slate-900 px-3"
          >
            Clear
          </button>
        )}
      </form>

      {submittedQuery && !loading && !error && (
        <p className="text-sm text-slate-500 mb-4">
          {teams.length} {teams.length === 1 ? 'result' : 'results'} for "<span className="text-slate-700 font-medium">{submittedQuery}</span>"
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <ErrorState
          title="Couldn't load teams"
          body={error}
          onRetry={fetchTeams}
        />
      ) : teams.length === 0 ? (
        <EmptyState
          icon="⚲"
          title={submittedQuery ? `No teams match "${submittedQuery}"` : 'No teams yet'}
          body={submittedQuery
            ? 'Try a different search term, or clear the search to browse all teams.'
            : 'Create a team to get started.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => (
            <TeamCard key={team._id} team={team} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateTeamForm({ onCreated, onCancel }) {
  const [hackathons, setHackathons] = useState([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    hackathonId: '',
    capacity: 4,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/hackathons')
      .then(data => {
        const list = data.results || [];
        setHackathons(list);
        if (list.length > 0) {
          setForm(f => ({ ...f, hackathonId: f.hackathonId || list[0]._id }));
        }
      })
      .catch(err => setError(err.message));
  }, []);

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.hackathonId) return;
    setLoading(true);
    setError(null);
    try {
      const team = await api.post('/teams', {
        name: form.name.trim(),
        description: form.description.trim(),
        hackathonId: form.hackathonId,
        capacity: Number(form.capacity) || 4,
      });
      onCreated(team);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-lg border border-slate-200 p-5 mb-6 space-y-4"
    >
      <h2 className="text-sm font-semibold text-slate-900">Create a team</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={e => update('name', e.target.value)}
          required
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          placeholder="Team name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Hackathon</label>
        <select
          value={form.hackathonId}
          onChange={e => update('hackathonId', e.target.value)}
          required
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
        >
          {hackathons.length === 0 && <option value="">No hackathons available</option>}
          {hackathons.map(h => (
            <option key={h._id} value={h._id}>{h.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Project description
        </label>
        <textarea
          value={form.description}
          onChange={e => update('description', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
          placeholder="What are you building?"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Capacity</label>
        <input
          type="number"
          min={1}
          max={20}
          value={form.capacity}
          onChange={e => update('capacity', e.target.value)}
          className="w-32 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading || !form.name.trim() || !form.hackathonId}
          className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Creating...' : 'Create team'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="text-sm text-slate-600 px-4 py-2 rounded-md hover:bg-slate-100 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function TeamCard({ team }) {
  return (
    <Link
      to={`/teams/${team._id}`}
      className="block bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md hover:border-emerald-300 transition"
    >
      <h3 className="font-semibold text-slate-900">{team.name}</h3>

      {team.hackathon?.name && (
        <p className="text-xs text-emerald-700 mt-1 font-medium">
          {team.hackathon.name}
        </p>
      )}

      {team.description && (
        <p className="text-sm text-slate-600 mt-3 leading-relaxed line-clamp-2">
          {team.description}
        </p>
      )}

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
        <span className="text-xs text-slate-500">
          {team.memberCount} / {team.capacity || '?'} {team.memberCount === 1 ? 'member' : 'members'}
        </span>
        {typeof team.score === 'number' && (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
            {team.score.toFixed(1)} match
          </span>
        )}
      </div>
    </Link>
  );
}
