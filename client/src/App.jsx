// client/src/App.jsx
//
// Top-level router. If unauthenticated, show LandingScreen
// (hero + integrated login) or OAuth callback. If authenticated,
// show the routed app under Layout.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuth from './hooks/useAuth';
import Layout from './components/Layout';
import LandingScreen from './components/LandingScreen';
import AuthCallback from './pages/AuthCallback';
import TeamList from './pages/TeamList';
import TeamDetail from './pages/TeamDetail';
import Matches from './pages/Matches';
import People from './pages/People';
import UserProfile from './pages/UserProfile';
import Messages from './pages/Messages';
import DMThread from './pages/DMThread';
import EventList from './pages/EventList';
import EventDetail from './pages/EventDetail';

export default function App() {
  const { authed, ready } = useAuth();

  if (!ready) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="*" element={<LandingScreen />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<Layout />}>
          <Route path="/events" element={<EventList />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/teams" element={<TeamList />} />
          <Route path="/teams/:id" element={<TeamDetail />} />
          <Route path="/teams/:id/matches" element={<Matches />} />
          <Route path="/people" element={<People />} />
          <Route path="/users/:id" element={<UserProfile />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/dms/:peerId" element={<DMThread />} />
          <Route path="*" element={<Navigate to="/events" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
