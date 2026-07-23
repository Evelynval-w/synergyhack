// client/src/pages/EventDetail.jsx

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { Skeleton, ErrorState } from '../components/ui/States';
import useAuth from '../hooks/useAuth';

export default function EventDetail() {
  const { id } = useParams();
  const { userId } = useAuth();
  const [event, setEvent] = useState(null);
  const [regs, setRegs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [inviteUser, setInviteUser] = useState('');
  const [lbDraft, setLbDraft] = useState('');
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return api.get(`/hackathons/${id}`)
      .then(async data => {
        setEvent(data);
        if (data.leaderboard?.length) {
          setLbDraft(data.leaderboard.map(e => `${e.teamId},${e.score},${e.rank}`).join('\n'));
        }
        if (data.isHost) {
          try {
            const list = await api.get(`/hackathons/${id}/registrations`);
            setRegs(list.results || []);
          } catch {
            setRegs([]);
          }
        } else {
          setRegs([]);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <ErrorState title="Couldn't load event" body={error} onRetry={load} />
      </div>
    );
  }

  if (!event) return null;

  const myAccepted = (event.myRegistrations || []).some(r =>
    r.status === 'accepted' || r.status === 'pending' || r.status === 'invited'
  );
  const mode = event.registrationMode || 'both';
  const pendingRegs = regs.filter(r => r.status === 'pending');

  const registerSelf = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.post(`/hackathons/${id}/register`, {});
      setMsg(event.visibility === 'private'
        ? 'Registration submitted — awaiting organizer approval.'
        : 'Registered.');
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const registerTeam = async (teamId) => {
    setBusy(true);
    setMsg(null);
    try {
      await api.post(`/hackathons/${id}/register`, { teamId });
      setMsg('Team registered.');
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = async () => {
    if (!inviteUser.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.post(`/hackathons/${id}/invite`, { username: inviteUser.trim() });
      setMsg(`Invite sent to ${inviteUser.trim()}.`);
      setInviteUser('');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const acceptInvite = async (regId) => {
    setBusy(true);
    try {
      await api.post(`/hackathons/${id}/registrations/${regId}/accept`, {});
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const rejectReg = async (regId) => {
    setBusy(true);
    try {
      await api.post(`/hackathons/${id}/registrations/${regId}/reject`, {});
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveLeaderboard = async () => {
    const entries = lbDraft.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const [teamId, score, rank] = line.split(',').map(s => s.trim());
      return { teamId, score: Number(score), rank: Number(rank) };
    });
    setBusy(true);
    setMsg(null);
    try {
      await api.put(`/hackathons/${id}/leaderboard`, { entries });
      setMsg('Leaderboard saved.');
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Link to="/events" className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block">← All events</Link>

      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
        <div className="flex gap-2 mb-3">
          <span className="text-xs font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">{event.visibility}</span>
          <span className="text-xs text-slate-500">{event.status}</span>
          <span className="text-xs text-slate-500">mode: {mode}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{event.name}</h1>
        {event.location && <p className="text-sm text-slate-500 mt-1">{event.location}</p>}
        {event.description && <p className="text-slate-700 mt-4 leading-relaxed">{event.description}</p>}
        {event.tracks?.length > 0 && (
          <p className="text-sm text-slate-500 mt-3">Tracks: {event.tracks.join(', ')}</p>
        )}

        {msg && <p className="text-sm mt-4 text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">{msg}</p>}

        <div className="flex flex-wrap gap-2 mt-5">
          {(mode === 'individual' || mode === 'both') && !myAccepted && (
            <button type="button" disabled={busy} onClick={registerSelf} className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-50">
              Register myself
            </button>
          )}
          {(event.myRegistrations || []).filter(r => r.status === 'invited' && r.userId === userId).map(r => (
            <button key={r._id} type="button" disabled={busy} onClick={() => acceptInvite(r._id)} className="bg-amber-500 text-white text-sm font-medium px-4 py-2 rounded-md">
              Accept event invite
            </button>
          ))}
          <Link to={`/teams?event=${id}`} className="text-sm text-emerald-700 px-3 py-2 hover:underline">
            Create / browse teams →
          </Link>
        </div>
      </div>

      {(mode === 'team' || mode === 'both') && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
          <h2 className="text-sm font-medium text-slate-700 mb-3">Teams in this event</h2>
          {(event.teams || []).length === 0 ? (
            <p className="text-sm text-slate-400">No teams yet.</p>
          ) : (
            <div className="space-y-2">
              {event.teams.map(t => (
                <div key={t._id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
                  <Link to={`/teams/${t._id}`} className="font-medium text-slate-900 hover:text-emerald-700">{t.name}</Link>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{t.memberCount}/{t.capacity || '?'}</span>
                    {t.isMember && (
                      <button type="button" disabled={busy} onClick={() => registerTeam(t._id)} className="text-xs text-emerald-700 hover:underline">
                        Register team
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
        <h2 className="text-sm font-medium text-slate-700 mb-3">Invite someone to register</h2>
        <div className="flex gap-2">
          <input
            value={inviteUser}
            onChange={e => setInviteUser(e.target.value)}
            placeholder="Username"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-md"
          />
          <button type="button" disabled={busy || !inviteUser.trim()} onClick={sendInvite} className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md disabled:bg-slate-300">
            Invite
          </button>
        </div>
      </div>

      {event.isHost && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
          <h2 className="text-sm font-medium text-slate-700 mb-3">
            Registrations {pendingRegs.length > 0 && `(${pendingRegs.length} pending)`}
          </h2>
          {regs.length === 0 ? (
            <p className="text-sm text-slate-400">No registrations yet.</p>
          ) : (
            <ul className="space-y-2">
              {regs.map(r => (
                <li key={r._id} className="flex items-center justify-between gap-3 text-sm py-2 border-b border-slate-100 last:border-0">
                  <span className="text-slate-700">
                    {r.registrantType === 'team'
                      ? (r.teamName || `Team ${r.teamId?.slice(-6)}`)
                      : (r.username || `User ${r.userId?.slice(-6)}`)}
                    <span className="ml-2 text-xs text-slate-400">{r.status}</span>
                  </span>
                  {r.status === 'pending' && (
                    <div className="flex gap-2">
                      <button type="button" disabled={busy} onClick={() => acceptInvite(r._id)} className="text-xs text-emerald-700 hover:underline">
                        Approve
                      </button>
                      <button type="button" disabled={busy} onClick={() => rejectReg(r._id)} className="text-xs text-red-600 hover:underline">
                        Reject
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {event.leaderboardEnabled && (
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h2 className="text-sm font-medium text-slate-700 mb-3">Leaderboard</h2>
          {(event.leaderboard || []).length === 0 ? (
            <p className="text-sm text-slate-400 mb-3">No scores yet.</p>
          ) : (
            <ol className="space-y-1 mb-4">
              {event.leaderboard.map(row => (
                <li key={row.teamId} className="text-sm text-slate-700 flex justify-between">
                  <span>
                    #{row.rank}{' '}
                    <Link to={`/teams/${row.teamId}`} className="text-emerald-700 hover:underline">
                      {row.teamName || row.teamId.slice(-6)}
                    </Link>
                  </span>
                  <span className="font-medium">{row.score}</span>
                </li>
              ))}
            </ol>
          )}
          {event.isHost && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Host edit: one line per entry as teamId,score,rank</p>
              <textarea value={lbDraft} onChange={e => setLbDraft(e.target.value)} rows={4} className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono text-xs" />
              <button type="button" disabled={busy} onClick={saveLeaderboard} className="mt-2 bg-emerald-500 text-white text-sm px-4 py-2 rounded-md">
                Save leaderboard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
