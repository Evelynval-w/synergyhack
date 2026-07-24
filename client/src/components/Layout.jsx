// client/src/components/Layout.jsx
//
// App shell: top nav with branding, navigation tabs, profile link, logout.
// Polls notification summary for unread badges.

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import api from '../api/client';

const SUMMARY_POLL_MS = 12000;

function notificationLabel(ev) {
  switch (ev.type) {
    case 'join_request_accepted':
      return `Accepted to ${ev.payload?.teamName || 'a team'}`;
    case 'join_request_rejected':
      return `Request declined for ${ev.payload?.teamName || 'a team'}`;
    case 'team_invite':
      return `Invited to join ${ev.payload?.teamName || 'a team'}`;
    case 'event_invite':
      return `Invited to ${ev.payload?.eventName || 'an event'}`;
    case 'event_registration':
      return `Registration pending for ${ev.payload?.eventName || 'an event'}`;
    default:
      return ev.type?.replace(/_/g, ' ') || 'Notification';
  }
}

function notificationHref(ev) {
  if (ev.type === 'team_invite' && ev.payload?.teamId) {
    return `/teams/${ev.payload.teamId}`;
  }
  if ((ev.type === 'event_invite' || ev.type === 'event_registration') && ev.payload?.eventId) {
    return `/events/${ev.payload.eventId}`;
  }
  if (ev.payload?.teamId) return `/teams/${ev.payload.teamId}`;
  if (ev.payload?.eventId) return `/events/${ev.payload.eventId}`;
  return '/messages';
}

export default function Layout() {
  const { username, userId } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState({
    dmUnread: 0,
    teamUnread: 0,
    teamUnreadChannels: [],
    joinRequestEvents: 0,
    total: 0,
    joinEvents: [],
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!localStorage.getItem('synergy_token')) return;
      if (document.visibilityState !== 'visible') return;
      try {
        const data = await api.get('/notifications/summary');
        if (!cancelled) setSummary(data);
      } catch {
        // Silent — next poll retries
      }
    };

    load();
    const id = setInterval(load, SUMMARY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const handleSignOut = async () => {
    await api.logout();
    navigate('/', { replace: true });
    window.dispatchEvent(new Event('synergy:auth-changed'));
  };

  const markJoinEventsRead = async () => {
    if (!summary.joinRequestEvents) return;
    try {
      await api.post('/notifications/read', {});
      setSummary(s => ({
        ...s,
        joinRequestEvents: 0,
        joinEvents: [],
        total: s.dmUnread + s.teamUnread,
      }));
    } catch {
      // ignore
    }
  };

  const messageBadge = (summary.dmUnread || 0) + (summary.teamUnread || 0);

  const navLinkClass = ({ isActive }) =>
    `text-sm font-medium px-3 py-1.5 rounded-md transition ${
      isActive
        ? 'bg-emerald-100 text-emerald-700'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/events" className="text-xl font-bold text-slate-900">
              SynergyHack
            </Link>
            <nav className="flex gap-2 items-center">
              <NavLink to="/events" className={navLinkClass}>Events</NavLink>
              <NavLink to="/teams" className={navLinkClass}>Teams</NavLink>
              <NavLink to="/people" className={navLinkClass}>People</NavLink>
              <NavLink to="/messages" className={navLinkClass} onClick={markJoinEventsRead}>
                <span className="inline-flex items-center gap-1.5">
                  Messages
                  {messageBadge > 0 && (
                    <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-semibold flex items-center justify-center">
                      {messageBadge > 99 ? '99+' : messageBadge}
                    </span>
                  )}
                  {summary.joinRequestEvents > 0 && (
                    <span
                      className="h-2 w-2 rounded-full bg-amber-500"
                      title="Pending invites and updates"
                    />
                  )}
                </span>
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {username && userId && (
              <Link
                to={`/users/${userId}`}
                className="flex items-center gap-2 text-sm px-2 py-1 rounded-md hover:bg-slate-100 transition"
                title="View / edit your profile"
              >
                <span className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center font-semibold text-emerald-700 text-xs">
                  {username[0].toUpperCase()}
                </span>
                <span className="font-medium text-slate-700 capitalize">
                  {username}
                </span>
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="text-sm text-slate-500 hover:text-slate-900 transition"
            >
              Sign out
            </button>
          </div>
        </div>
        {(summary.teamUnreadChannels?.length > 0 || summary.joinEvents?.length > 0) && (
          <div className="max-w-6xl mx-auto px-6 pb-3 space-y-2">
            {summary.teamUnreadChannels?.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 text-sm text-emerald-900 flex flex-wrap gap-x-4 gap-y-1">
                {summary.teamUnreadChannels.slice(0, 4).map(ch => (
                  <Link
                    key={ch.teamId}
                    to={`/teams/${ch.teamId}?chat=1`}
                    className="hover:underline font-medium"
                  >
                    {ch.teamName || 'Team'} ({ch.unread} unread)
                  </Link>
                ))}
              </div>
            )}
            {summary.joinEvents?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-sm text-amber-900 flex flex-wrap gap-x-4 gap-y-1">
                {summary.joinEvents.slice(0, 4).map(ev => (
                  <Link
                    key={ev._id}
                    to={notificationHref(ev)}
                    className="hover:underline"
                    onClick={markJoinEventsRead}
                  >
                    {notificationLabel(ev)}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
