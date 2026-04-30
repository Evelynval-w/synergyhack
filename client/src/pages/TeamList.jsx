// client/src/pages/TeamList.jsx
//
// Lists all teams. Each card links to /teams/:id (TeamDetail).

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function TeamList() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/teams')
      .then(setTeams)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center text-slate-500 py-12">Loading teams...</div>;
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Teams</h1>
        <p className="text-sm text-slate-500 mt-1">
          Browse teams and find teammates whose skills complement them.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map(team => (
          <Link
            key={team.id}
            to={`/teams/${team.id}`}
            className="bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md hover:border-emerald-300 transition"
          >
            <h3 className="font-semibold text-slate-900 mb-1">{team.name}</h3>
            <p className="text-sm text-slate-500">
              {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
