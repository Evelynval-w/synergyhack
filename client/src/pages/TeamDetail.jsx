// client/src/pages/TeamDetail.jsx
//
// Single team view with a richer header — description (the team's
// pitch), hackathon name + dates, capacity. Two columns:
//   - Left: pitch + matches CTA + skills + members
//   - Right: ChatPanel (Redis-Streams-backed team chat, members-only)

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import SkillChip from '../components/SkillChip';
import ChatPanel from '../components/ChatPanel';
import useAuth from '../hooks/useAuth';

function formatDateRange(start, end) {
  if (!start) return '';
  const opts = { month: 'short', day: 'numeric' };
  const startStr = new Date(start).toLocaleDateString(undefined, opts);
  const endStr = end ? new Date(end).toLocaleDateString(undefined, opts) : '';
  return endStr && endStr !== startStr ? `${startStr} – ${endStr}` : startStr;
}

export default function TeamDetail() {
  const { id } = useParams();
  const { userId } = useAuth();
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
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
          Error: {error}
        </div>
      </div>
    );
  }

  if (!team) return null;

  const memberCount = team.members?.length ?? 0;
  const capacity = team.capacity || '?';

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <Link
        to="/teams"
        className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block"
      >
        ← All teams
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — team info + members */}
        <div className="lg:col-span-2 space-y-6">

          {/* Hero: name + hackathon + description */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            {team.hackathon && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded">
                  {team.hackathon.name}
                </span>
                {team.hackathon.startDate && (
                  <span className="text-xs text-slate-500">
                    · {formatDateRange(team.hackathon.startDate, team.hackathon.endDate)}
                  </span>
                )}
                {team.hackathon.location && (
                  <span className="text-xs text-slate-500">
                    · {team.hackathon.location}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-start justify-between gap-4 mb-3">
              <h1 className="text-2xl font-bold text-slate-900">{team.name}</h1>
              <Link
                to={`/teams/${id}/matches`}
                className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 transition shrink-0"
              >
                Find teammates →
              </Link>
            </div>

            {team.description && (
              <p className="text-slate-700 leading-relaxed">
                {team.description}
              </p>
            )}

            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100 text-sm text-slate-500">
              <span>{memberCount} of {capacity} {memberCount === 1 ? 'member' : 'members'}</span>
              {team.hackathon?.tracks && team.hackathon.tracks.length > 0 && (
                <span>· Tracks: {team.hackathon.tracks.join(', ')}</span>
              )}
            </div>
          </div>

          {/* Combined skills */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-sm font-medium text-slate-700 mb-3">
              What this team can do
            </h2>
            {!team.skills || team.skills.length === 0 ? (
              <p className="text-sm text-slate-400">No skills listed yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {team.skills.map(skill => (
                  <SkillChip key={skill} name={skill} variant="team" />
                ))}
              </div>
            )}
          </div>

          {/* Members */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-sm font-medium text-slate-700 mb-3">Members</h2>
            {!team.members || team.members.length === 0 ? (
              <p className="text-sm text-slate-400">No members yet.</p>
            ) : (
              <div className="space-y-1">
                {team.members.map(m => (
                  <Link
                    key={m.id}
                    to={`/users/${m.id}`}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-slate-50 transition"
                  >
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center font-semibold text-emerald-700 text-sm">
                      {m.username[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-slate-900 capitalize">
                      {m.username}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — chat */}
        <div className="lg:col-span-1">
          <ChatPanel
            teamId={id}
            myUserId={userId}
            members={team.members || []}
          />
        </div>
      </div>
    </div>
  );
}
