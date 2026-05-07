// client/src/pages/DMThread.jsx
//
// Full-page 1:1 chat view. Polls GET /dms/:peerId/messages every 2s
// when the tab is visible AND the user has a token (same guard as
// ChatPanel — without it, a backgrounded sign-out keeps hammering
// 401s and saturates the rate limiter).
//
// The peer's username is fetched once on mount via /users/:id so the
// header reads "Conversation with aadithya" rather than a UUID.

import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import useAuth from '../hooks/useAuth';

const POLL_INTERVAL_MS = 2000;

export default function DMThread() {
  const { peerId } = useParams();
  const navigate = useNavigate();
  const { userId: myUserId } = useAuth();

  const [peer, setPeer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const seenIds = useRef(new Set());
  const scrollRef = useRef(null);

  // Self-DM guard: if the URL points at me, bail to /people. This
  // mirrors the server-side 400 ("Cannot DM yourself") and avoids
  // a confusing empty page.
  useEffect(() => {
    if (myUserId && peerId === myUserId) {
      navigate('/people', { replace: true });
    }
  }, [peerId, myUserId, navigate]);

  // Load the peer's basic profile once.
  useEffect(() => {
    api.get(`/users/${peerId}`)
      .then(setPeer)
      .catch(err => setError(err.message));
  }, [peerId]);

  // Initial message fetch.
  useEffect(() => {
    seenIds.current = new Set();
    setMessages([]);

    let cancelled = false;
    api.get(`/dms/${peerId}/messages`)
      .then(data => {
        if (cancelled) return;
        const fresh = data.filter(m => !seenIds.current.has(m.id));
        fresh.forEach(m => seenIds.current.add(m.id));
        setMessages(fresh);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message);
      });

    return () => { cancelled = true; };
  }, [peerId]);

  // Polling.
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!localStorage.getItem('synergy_token')) return;
      const lastId = messages.length > 0 ? messages[messages.length - 1].id : '0';
      try {
        const data = await api.get(`/dms/${peerId}/messages?since=${lastId}`);
        const fresh = data.filter(m => !seenIds.current.has(m.id));
        if (fresh.length === 0) return;
        fresh.forEach(m => seenIds.current.add(m.id));
        setMessages(prev => [...prev, ...fresh]);
      } catch {
        // Silent — next tick will retry
      }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerId, messages.length]);

  // Auto-scroll to bottom on new messages.
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
      await api.post(`/dms/${peerId}/messages`, { body });
      setInput('');
      // Immediate refresh for perceived responsiveness.
      const lastId = messages.length > 0 ? messages[messages.length - 1].id : '0';
      const data = await api.get(`/dms/${peerId}/messages?since=${lastId}`);
      const fresh = data.filter(m => !seenIds.current.has(m.id));
      if (fresh.length > 0) {
        fresh.forEach(m => seenIds.current.add(m.id));
        setMessages(prev => [...prev, ...fresh]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Link
        to="/messages"
        className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block"
      >
        ← All messages
      </Link>

      <div className="bg-white rounded-lg border border-slate-200 flex flex-col h-[calc(100vh-180px)]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-slate-900 capitalize">
              {peer ? peer.username : 'Loading...'}
            </h1>
            {peer && <p className="text-xs text-slate-500">{peer.role}</p>}
          </div>
          {peer && (
            <Link
              to={`/users/${peer._id}`}
              className="text-xs text-emerald-700 hover:underline"
            >
              View profile
            </Link>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="text-2xl text-slate-300 mb-2" aria-hidden="true">✦</div>
              <p className="text-sm text-slate-400">
                No messages yet. Say hi.
              </p>
            </div>
          ) : (
            messages.map(msg => {
              const isMe = msg.from === myUserId;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      isMe
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
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

        {error && (
          <div className="px-5 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">
            {error}
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-3 border-t border-slate-200">
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
              className="bg-emerald-500 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
