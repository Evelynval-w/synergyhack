// client/src/pages/TeamDetail.jsx
//
// Single team view. Shows members and the team's combined skills.
// "Find teammates" button navigates to the matches page.

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import SkillChip from '../components/SkillChip';

export default function TeamDetail() {
  const { id } = useParams();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(`/teams/${id}`)
      .then(setTeam)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-center text-slate-500 py-12">Loading team...</div>;
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
          Error: {error}
        </div>
      </div>
    );
  }

  if (!team) return null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <Link to="/teams" className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block">
        ← All teams
      </Link>

      {/* Team header */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{team.name}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {team.members.length} {team.members.length === 1 ? 'member' : 'members'}
            </p>
          </div>
          <Link
            to={`/teams/${id}/matches`}
            className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 transition"
          >
            Find teammates →
          </Link>
        </div>

        {/* Team's combined skills */}
        <div>
          <h3 className="text-sm font-medium text-slate-700 mb-2">
            What this team can do
          </h3>
          {team.skills.length === 0 ? (
            <p className="text-sm text-slate-400">No skills yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {team.skills.map(skill => (
                <SkillChip key={skill} name={skill} variant="team" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Members */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-sm font-medium text-slate-700 mb-3">Members</h3>
        {team.members.length === 0 ? (
          <p className="text-sm text-slate-400">No members yet.</p>
        ) : (
          <div className="space-y-2">
            {team.members.map(m => (
              <div
                key={m.id}
                className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-b-0"
              >
                <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center font-semibold text-emerald-700 text-sm">
                  {m.username[0].toUpperCase()}
                </div>
                <span className="text-sm font-medium text-slate-900 capitalize">
                  {m.username}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
