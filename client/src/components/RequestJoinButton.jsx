// client/src/components/RequestJoinButton.jsx
//
// Smart button shown on TeamDetail for any user who isn't the owner.
// State machine (visible-to-user states):
//
//   currentMember  -> nothing rendered (you're already in)
//   isOwner        -> nothing rendered (parent shows pending list instead)
//   teamFull       -> "Team is full" (disabled, gray)
//   pendingRequest -> "Request pending" (disabled, soft styling)
//   acceptedBefore -> "Already accepted" (shouldn't happen if state in sync, defensive)
//   rejected       -> "Request again" (re-request allowed by partial index)
//   default        -> "Request to join" (opens modal)

import { useState, useEffect } from 'react';
import api from '../api/client';

export default function RequestJoinButton({ team, myUserId, onRequestSent }) {
  const [myStatus, setMyStatus] = useState(null); // null | 'pending' | 'accepted' | 'rejected'
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Load my own request history once and find this team in it.
  useEffect(() => {
    let cancelled = false;
    api.get('/me/requests')
      .then(reqs => {
        if (cancelled) return;
        const mine = (reqs || []).find(r => r.teamId === team.id);
        // If multiple exist (rejected then re-requested), prefer pending,
        // otherwise the most recent (the API already sorts desc).
        const pending = (reqs || []).find(r => r.teamId === team.id && r.status === 'pending');
        setMyStatus(pending ? 'pending' : (mine ? mine.status : null));
      })
      .catch(() => setMyStatus(null))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [team.id]);

  const memberCount = team.members?.length ?? 0;
  const isMember = (team.members || []).some(m => m.id === myUserId);
  const isOwner = team.createdBy === myUserId;
  const isFull = team.capacity && memberCount >= team.capacity;

  // Owner sees the pending list instead — return null
  if (isOwner) return null;
  if (isMember) return null;

  if (loading) {
    return (
      <button disabled className="bg-slate-200 text-slate-400 text-sm font-medium px-4 py-2 rounded-md cursor-wait shrink-0">
        Loading...
      </button>
    );
  }

  if (isFull && myStatus !== 'pending') {
    return (
      <button disabled className="bg-slate-200 text-slate-500 text-sm font-medium px-4 py-2 rounded-md cursor-not-allowed shrink-0">
        Team is full
      </button>
    );
  }

  if (myStatus === 'pending') {
    return (
      <button disabled className="bg-amber-100 text-amber-800 text-sm font-medium px-4 py-2 rounded-md cursor-default shrink-0">
        Request pending
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 transition shrink-0"
      >
        {myStatus === 'rejected' ? 'Request again' : 'Request to join'}
      </button>
      {showModal && (
        <RequestJoinModal
          team={team}
          onCancel={() => setShowModal(false)}
          onSent={() => {
            setShowModal(false);
            setMyStatus('pending');
            if (onRequestSent) onRequestSent();
          }}
        />
      )}
    </>
  );
}

function RequestJoinModal({ team, onCancel, onSent }) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/teams/${team.id}/requests`, { message: message.trim() });
      onSent();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900 mb-1">
          Request to join {team.name}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          The team owner reviews and decides. You'll see the outcome in your request history.
        </p>

        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Message <span className="text-xs text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="Why are you a fit? What would you bring?"
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition resize-none"
          autoFocus
        />
        <div className="text-xs text-slate-400 mt-1 text-right">
          {message.length} / 500
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700 mt-3">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-sm text-slate-600 px-4 py-2 rounded-md hover:bg-slate-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 disabled:bg-slate-300 transition"
          >
            {submitting ? 'Sending...' : 'Send request'}
          </button>
        </div>
      </div>
    </div>
  );
}
