// client/src/components/ChatPanel.jsx
//
// Team chat panel rendered as a right-rail column on TeamDetail.
//
// Talks to the Redis-Streams-backed backend via two endpoints:
//   GET  /teams/:id/messages?since=<lastId>  — XRANGE with cursor
//   POST /teams/:id/messages                  — XADD + Mongo mirror
//
// Polls every 2 seconds (only when the tab is visible — saves API
// requests when the user has the page open in a background tab).
// Deduplicates by stream ID so optimistic-sent messages don't appear
// twice when the next poll fetches them back from the server.

import { useState, useEffect, useRef, useMemo } from 'react';
import api from '../api/client';

const POLL_INTERVAL_MS = 2000;

export default function ChatPanel({ teamId, myUserId, members = [] }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  // Track stream IDs we've seen so polling never duplicates.
  const seenIds = useRef(new Set());
  const scrollRef = useRef(null);

  // username lookup: id -> username, with fallback
  const userMap = useMemo(() => {
    const map = {};
    for (const m of members) map[m.id] = m.username;
    return map;
  }, [members]);

  function nameFor(userId) {
    return userMap[userId] || `user-${userId.slice(-4)}`;
  }

  // Append messages we haven't seen yet.
  function mergeNew(incoming) {
    if (!incoming || incoming.length === 0) return;
    const fresh = incoming.filter(m => !seenIds.current.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach(m => seenIds.current.add(m.id));
    setMessages(prev => [...prev, ...fresh]);
  }

  // Initial fetch on mount / teamId change.
  useEffect(() => {
    seenIds.current = new Set();
    setMessages([]);
    setForbidden(false);
    setError(null);

    let cancelled = false;
    api.get(`/teams/${teamId}/messages`)
      .then(data => {
        if (cancelled) return;
        mergeNew(data);
      })
      .catch(err => {
        if (cancelled) return;
        if (err.message === 'Not a team member') {
          setForbidden(true);
        } else {
          setError(err.message);
        }
      });

    return () => { cancelled = true; };
  }, [teamId]);

  // Poll for new messages every POLL_INTERVAL_MS, skipping while
  // the tab is hidden OR the user has signed out (token cleared).
  // Without the token check, a signed-out tab keeps hammering the
  // server with 401s and can saturate the rate limiter.
  useEffect(() => {
    if (forbidden) return;

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!localStorage.getItem('synergy_token')) return;
      const lastId = messages.length > 0 ? messages[messages.length - 1].id : '0';
      try {
        const data = await api.get(`/teams/${teamId}/messages?since=${lastId}`);
        mergeNew(data);
      } catch {
        // Polling errors are silent — next tick will retry.
      }
    };

    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, messages.length, forbidden]);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function handleSend() {
    const body = input.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);
    try {
      await api.post(`/teams/${teamId}/messages`, { body });
      setInput('');
      // Don't optimistically add — next poll will fetch it back. Keeps
      // the source of truth single (Redis Streams) and avoids race
      // conditions if the server normalizes/rejects the message.
      // For perceived speed, trigger an immediate refresh.
      const lastId = messages.length > 0 ? messages[messages.length - 1].id : '0';
      const data = await api.get(`/teams/${teamId}/messages?since=${lastId}`);
      mergeNew(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (forbidden) {
    return (
      <aside className="bg-white rounded-lg border border-slate-200 p-6 sticky top-6">
        <h3 className="text-sm font-medium text-slate-700 mb-2">Team chat</h3>
        <p className="text-sm text-slate-500">
          Only members of this team can see and post in the chat.
        </p>
      </aside>
    );
  }

  return (
    <aside className="bg-white rounded-lg border border-slate-200 sticky top-6 flex flex-col h-[600px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Team chat</h3>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          live
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            No messages yet. Start the conversation.
          </p>
        ) : (
          messages.map(msg => {
            const isMe = msg.from === myUserId;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    isMe
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {!isMe && (
                    <div className="text-xs font-semibold text-slate-500 mb-0.5 capitalize">
                      {nameFor(msg.from)}
                    </div>
                  )}
                  <div className="break-words whitespace-pre-wrap">{msg.body}</div>
                </div>
                <span className="text-xs text-slate-400 mt-1 px-1">
                  {new Date(msg.ts).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}
