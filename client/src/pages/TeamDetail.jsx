// client/src/pages/TeamDetail.jsx
//
// Single team view with:
//   - Hero header (hackathon pill, name, description, capacity)
//   - "Request to join" button for non-members
//   - "Pending requests" panel for the team's creator
//   - Combined skills + members
//   - Right rail: ChatPanel for team members
//
// Refresh strategy: after a request is accepted, refetch the team
// so the new member shows up in the members list and the chat panel
// gains them too.

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import SkillChip from '../components/SkillChip';
import ChatPanel from '../components/ChatPanel';
import RequestJoinButton from '../components/RequestJoinButton';
import PendingRequests from '../components/PendingRequests';
import { Skeleton, ErrorState } from '../components/ui/States';
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

  const fetchTeam = useCallback(() => {
    setLoading(true);
    setError(null);
    return api.get(`/teams/${id}`)
      .then(setTeam)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-2">
              <Skeleton className="h-4 w-24 mb-3" />
              <div className="flex gap-2 flex-wrap">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-6 w-16 rounded-full" />)}
              </div>
            </div>
          </div>
          <div className="lg:col-span-1">
            <Skeleton className="h-[600px] rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Link
          to="/teams"
          className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block"
        >
          ← All teams
        </Link>
        <ErrorState
          title="Couldn't load team"
          body={error}
          onRetry={fetchTeam}
        />
      </div>
    );
  }

  if (!team) return null;

  const memberCount = team.members?.length ?? 0;
  const capacity = team.capacity || '?';
  const isOwner = team.createdBy === userId;
  const isMember = (team.members || []).some(m => m.id === userId);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <Link
        to="/teams"
        className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block"
      >
        ← All teams
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — team info, requests, members */}
        <div className="lg:col-span-2 space-y-6">

          {/* Hero header */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            {team.hackathon && (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
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
              <div className="flex items-center gap-2 shrink-0">
                {isMember && (
                  <Link
                    to={`/teams/${id}/matches`}
                    className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 transition"
                  >
                    Find teammates →
                  </Link>
                )}
                {!isMember && !isOwner && (
                  <RequestJoinButton
                    team={team}
                    myUserId={userId}
                    onRequestSent={fetchTeam}
                  />
                )}
              </div>
            </div>

            {team.description && (
              <p className="text-slate-700 leading-relaxed">
                {team.description}
              </p>
            )}

            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100 text-sm text-slate-500 flex-wrap">
              <span>{memberCount} of {capacity} {memberCount === 1 ? 'member' : 'members'}</span>
              {team.hackathon?.tracks && team.hackathon.tracks.length > 0 && (
                <span>· Tracks: {team.hackathon.tracks.join(', ')}</span>
              )}
            </div>
          </div>

          {/* Pending requests — owner only. Component returns null if empty. */}
          {isOwner && (
            <PendingRequests
              teamId={id}
              onRequestDecided={fetchTeam}
            />
          )}

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
                    {m.role && (
                      <span className="text-xs text-slate-500">{m.role}</span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — chat (members only see content; non-members see locked panel) */}
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
