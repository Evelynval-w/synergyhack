// client/src/components/PendingRequests.jsx
//
// Owner-only panel shown on TeamDetail. Lists pending join requests
// with each requester's profile preview (skills, role, message).
// Accept/Reject buttons hit the new endpoints.
//
// Caller (TeamDetail) is expected to refresh the team after a
// successful accept so the new member shows up in the members list.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

function formatRelativeTime(iso) {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 60 / 24);
  return `${days}d ago`;
}

export default function PendingRequests({ teamId, onRequestDecided }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Track which request is mid-decision to prevent double-clicks
  const [decidingId, setDecidingId] = useState(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    return api.get(`/teams/${teamId}/requests`)
      .then(setRequests)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const handleDecision = async (reqId, action) => {
    setDecidingId(reqId);
    try {
      await api.post(`/teams/${teamId}/requests/${reqId}/${action}`);
      await refresh();
      if (onRequestDecided) onRequestDecided(action);
    } catch (err) {
      setError(err.message);
    } finally {
      setDecidingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-medium text-slate-700 mb-3">Pending requests</h2>
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  // Don't render anything if there's nothing pending — keeps the page
  // tidy for owners with no incoming requests.
  if (!error && requests.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-slate-700">
          Pending requests
        </h2>
        <span className="text-xs text-slate-400">{requests.length} pending</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {requests.map(req => {
          const u = req.requester || {};
          const initial = (u.username || '?')[0].toUpperCase();
          const isDeciding = decidingId === req._id;
          return (
            <div
              key={req._id}
              className="border border-slate-200 rounded-md p-4"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center font-semibold text-emerald-700 shrink-0">
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/users/${u._id}`}
                      className="font-medium text-slate-900 capitalize hover:text-emerald-700 transition"
                    >
                      {u.username || 'unknown'}
                    </Link>
                    {u.role && (
                      <span className="text-xs text-slate-500">{u.role}</span>
                    )}
                    <span className="text-xs text-slate-400 ml-auto">
                      {formatRelativeTime(req.createdAt)}
                    </span>
                  </div>

                  {u.bio && (
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                      {u.bio}
                    </p>
                  )}

                  {u.skill_names && u.skill_names.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {u.skill_names.slice(0, 6).map(s => (
                        <span
                          key={s}
                          className="text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded"
                        >
                          {s}
                        </span>
                      ))}
                      {u.skill_names.length > 6 && (
                        <span className="text-xs text-slate-400 self-center">
                          +{u.skill_names.length - 6}
                        </span>
                      )}
                    </div>
                  )}

                  {req.message && (
                    <div className="mt-3 px-3 py-2 bg-slate-50 border-l-2 border-emerald-300 rounded-sm text-sm text-slate-700 italic">
                      "{req.message}"
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => handleDecision(req._id, 'accept')}
                      disabled={isDeciding}
                      className="bg-emerald-500 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-emerald-600 disabled:bg-slate-300 transition"
                    >
                      {isDeciding ? '...' : 'Accept'}
                    </button>
                    <button
                      onClick={() => handleDecision(req._id, 'reject')}
                      disabled={isDeciding}
                      className="text-slate-600 text-xs font-medium px-3 py-1.5 rounded-md hover:bg-slate-100 disabled:opacity-50 transition"
                    >
                      Reject
                    </button>
                    <Link
                      to={`/users/${u._id}`}
                      className="text-emerald-700 text-xs hover:underline ml-auto"
                    >
                      View full profile →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
