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

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
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
  const [searchParams] = useSearchParams();
  const focusChat = searchParams.get('chat') === '1';
  const { userId } = useAuth();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [myInvite, setMyInvite] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const chatRailRef = useRef(null);

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
    setEditing(false);
  }, [fetchTeam]);

  useEffect(() => {
    let cancelled = false;
    api.get('/me/requests')
      .then(list => {
        if (cancelled) return;
        const invite = (Array.isArray(list) ? list : []).find(
          r => r.teamId === id
            && r.status === 'pending'
            && r.direction === 'outbound_invite'
            && r.userId === userId
        );
        setMyInvite(invite || null);
      })
      .catch(() => { if (!cancelled) setMyInvite(null); });
    return () => { cancelled = true; };
  }, [id, userId, team]);

  useEffect(() => {
    if (!focusChat || loading || !chatRailRef.current) return;
    chatRailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusChat, loading, team]);

  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await api.post(`/teams/${id}/leave`, {});
      setLeaving(false);
      await fetchTeam();
    } catch (err) {
      setError(err.message);
      setLeaving(false);
    }
  };

  const respondInvite = async (action) => {
    if (!myInvite || inviteBusy) return;
    setInviteBusy(true);
    try {
      await api.post(`/teams/${id}/invites/${myInvite._id}/${action}`, {});
      setMyInvite(null);
      await fetchTeam();
    } catch (err) {
      setError(err.message);
    } finally {
      setInviteBusy(false);
    }
  };
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
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {isOwner && !editing && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-slate-700 transition"
                  >
                    Edit project
                  </button>
                )}
                {isMember && (
                  <Link
                    to={`/teams/${id}/matches`}
                    className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 transition"
                  >
                    Find teammates →
                  </Link>
                )}
                {isMember && !isOwner && (
                  <button
                    type="button"
                    onClick={handleLeave}
                    disabled={leaving}
                    className="text-sm text-slate-500 hover:text-red-600 px-3 py-2 transition disabled:opacity-50"
                  >
                    {leaving ? 'Leaving...' : 'Leave team'}
                  </button>
                )}
                {!isMember && !isOwner && myInvite && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={inviteBusy}
                      onClick={() => respondInvite('accept')}
                      className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {inviteBusy ? '...' : 'Accept invite'}
                    </button>
                    <button
                      type="button"
                      disabled={inviteBusy}
                      onClick={() => respondInvite('reject')}
                      className="bg-white border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 rounded-md hover:bg-slate-50 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                )}
                {!isMember && !isOwner && !myInvite && (
                  <RequestJoinButton
                    team={team}
                    myUserId={userId}
                    onRequestSent={fetchTeam}
                  />
                )}
              </div>
            </div>

            {editing ? (
              <TeamEditor
                team={team}
                onCancel={() => setEditing(false)}
                onSaved={async () => {
                  setEditing(false);
                  await fetchTeam();
                }}
              />
            ) : (
              <>
                {team.description ? (
                  <p className="text-slate-700 leading-relaxed">
                    {team.description}
                  </p>
                ) : (
                  <p className="text-sm text-slate-400 italic">
                    {isOwner
                      ? 'No project description yet — click Edit project to publish one.'
                      : 'No project description yet.'}
                  </p>
                )}
              </>
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
        <div
          ref={chatRailRef}
          className={`lg:col-span-1 ${focusChat ? 'ring-2 ring-emerald-400 rounded-lg' : ''}`}
        >
          <ChatPanel
            teamId={id}
            myUserId={userId}
            members={team.members || []}
            autoFocus={focusChat}
          />
        </div>
      </div>
    </div>
  );
}

function TeamEditor({ team, onCancel, onSaved }) {
  const [form, setForm] = useState({
    name: team.name || '',
    description: team.description || '',
    capacity: team.capacity || 4,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/teams/${team.id}`, {
        name: form.name.trim(),
        description: form.description,
        capacity: Number(form.capacity),
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 mt-2">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <input
        type="text"
        value={form.name}
        onChange={e => update('name', e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-semibold"
        placeholder="Team name"
      />
      <textarea
        value={form.description}
        onChange={e => update('description', e.target.value)}
        rows={4}
        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
        placeholder="Publish your project description..."
      />
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600">
          Capacity
          <input
            type="number"
            min={1}
            max={20}
            value={form.capacity}
            onChange={e => update('capacity', e.target.value)}
            className="ml-2 w-20 px-2 py-1 border border-slate-300 rounded-md"
          />
        </label>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-sm text-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="bg-emerald-500 text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-emerald-600 disabled:bg-slate-300"
        >
          {saving ? 'Saving...' : 'Publish'}
        </button>
      </div>
    </div>
  );
}
