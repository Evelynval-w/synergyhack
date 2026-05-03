// client/src/components/Layout.jsx
//
// App shell: top nav with branding, navigation tabs, logout.
// Wraps every page when authenticated.

import { Link, NavLink, Outlet } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import api from '../api/client';

export default function Layout() {
  const { username } = useAuth();

  const handleSignOut = () => {
    api.logout();
    // Notify every useAuth subscriber to re-read localStorage.
    window.dispatchEvent(new Event('synergy:auth-changed'));
  };

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
            <Link to="/teams" className="text-xl font-bold text-slate-900">
              SynergyHack
            </Link>
            <nav className="flex gap-2">
              <NavLink to="/teams" className={navLinkClass}>Teams</NavLink>
              <NavLink to="/people" className={navLinkClass}>People</NavLink>
              <NavLink to="/messages" className={navLinkClass}>Messages</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">
              {username && <>Logged in as <span className="font-medium text-slate-700">{username}</span></>}
            </span>
            <button
              onClick={handleSignOut}
              className="text-sm text-slate-500 hover:text-slate-900 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
