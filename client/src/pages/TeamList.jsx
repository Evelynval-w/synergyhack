// client/src/pages/TeamList.jsx
//
// Browse + search view for all teams. Two modes:
//   - default: alphabetical browse
//   - active query: text-relevance ranked search via team_search_idx
//
// Cards show the team's pitch (description), the hackathon they're
// for, and a member count. Click navigates to TeamDetail.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function TeamList() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const path = submittedQuery
      ? `/teams?q=${encodeURIComponent(submittedQuery)}`
      : '/teams';
    api.get(path)
      .then(data => setTeams(data.results || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Teams</h1>
        <p className="text-sm text-slate-500 mt-1">
          Browse teams or search by name or what they're building.
        </p>
      </div>

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

      {submittedQuery && !loading && (
        <p className="text-sm text-slate-500 mb-4">
          {teams.length} {teams.length === 1 ? 'result' : 'results'} for "<span className="text-slate-700 font-medium">{submittedQuery}</span>"
        </p>
      )}

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
          Error: {error}
        </div>
      ) : teams.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-sm text-slate-500">
            {submittedQuery
              ? `No teams match "${submittedQuery}". Try a different search.`
              : 'No teams yet.'}
          </p>
        </div>
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
        <p className="text-sm text-slate-600 mt-3 leading-relaxed line-clamp-3">
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
