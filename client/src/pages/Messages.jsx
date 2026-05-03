// client/src/pages/Messages.jsx
//
// DM inbox. Lists every distinct DM channel involving the current user,
// sorted by most-recent activity. Each row shows the peer (username +
// role), a preview of the last message, and a relative timestamp.
//
// Backed by GET /dms — a single Mongo aggregate that groups the
// `messages` mirror by channel, picks the latest per channel, and
// $lookups the peer user. Streams alone can't answer "all my
// conversations" (that's a cross-channel query); this is exactly
// what the Mongo mirror earns its place doing.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import useAuth from '../hooks/useAuth';

function formatRelativeTime(iso) {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Messages() {
  const { userId: myUserId } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get('/dms')
      .then(setThreads)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
        <p className="text-sm text-slate-500 mt-1">
          Direct conversations with people you've reached out to.
        </p>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
          {error}
        </div>
      ) : threads.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-sm text-slate-500">
            No conversations yet. Find someone in{' '}
            <Link to="/people" className="text-emerald-700 hover:underline">
              People
            </Link>
            {' '}and click Message.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {threads.map(t => {
            const peer = t.peer || { username: 'unknown', role: '?' };
            const isLastFromMe = t.lastMessageFrom === myUserId;
            return (
              <Link
                key={t.channel}
                to={`/dms/${t.peerUserId}`}
                className="block px-5 py-4 hover:bg-slate-50 transition"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center font-semibold text-emerald-700 shrink-0">
                    {peer.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <h3 className="font-medium text-slate-900 capitalize truncate">
                          {peer.username}
                        </h3>
                        <span className="text-xs text-slate-400 shrink-0">{peer.role}</span>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">
                        {formatRelativeTime(t.lastMessageTs)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1 truncate">
                      {isLastFromMe && <span className="text-slate-400">You: </span>}
                      {t.lastMessage}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
