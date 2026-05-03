// client/src/pages/People.jsx
//
// Browse + search view for all users. Two states:
//   - empty search: shows all users alphabetically (GET /users)
//   - active search: shows ranked results (GET /users/search?q=)
// The search uses Mongo's compound text index (skill_names:10,
// role:5, bio:3) so typing "react designer" ranks React-skilled
// designers above someone who just mentions react in their bio.

import { useState, useEffect } from 'react';
import api from '../api/client';
import UserCard from '../components/UserCard';

export default function People() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch the list — either browse-all or search results, depending
  // on whether a non-empty query was submitted.
  useEffect(() => {
    setLoading(true);
    setError(null);

    const fetcher = submittedQuery
      ? api.get(`/users/search?q=${encodeURIComponent(submittedQuery)}&limit=50`)
      : api.get('/users?limit=50');

    fetcher
      .then(data => {
        if (submittedQuery) {
          setUsers(data.results || []);
          setTotal(data.count || 0);
        } else {
          setUsers(data.results || []);
          setTotal(data.total || 0);
        }
      })
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
        <h1 className="text-2xl font-bold text-slate-900">People</h1>
        <p className="text-sm text-slate-500 mt-1">
          Browse {total > 0 ? total : ''} potential collaborators or search by skill, role, or background.
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="mb-6 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="e.g. react designer, machine learning python, kubernetes..."
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

      {/* Active search indicator */}
      {submittedQuery && !loading && (
        <p className="text-sm text-slate-500 mb-4">
          {users.length} {users.length === 1 ? 'result' : 'results'} for "<span className="text-slate-700 font-medium">{submittedQuery}</span>"
        </p>
      )}

      {/* Body */}
      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
          Error: {error}
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-sm text-slate-500">
            {submittedQuery
              ? `No people match "${submittedQuery}". Try a different search term.`
              : 'No users yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map(u => (
            <UserCard
              key={u._id}
              user={u}
              score={submittedQuery ? u.score : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
