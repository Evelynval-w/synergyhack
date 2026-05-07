// client/src/App.jsx
//
// Top-level router. If unauthenticated, show LandingScreen
// (hero + integrated login). If authenticated, show the routed
// app under Layout.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuth from './hooks/useAuth';
import Layout from './components/Layout';
import LandingScreen from './components/LandingScreen';
import TeamList from './pages/TeamList';
import TeamDetail from './pages/TeamDetail';
import Matches from './pages/Matches';
import People from './pages/People';
import UserProfile from './pages/UserProfile';
import Messages from './pages/Messages';
import DMThread from './pages/DMThread';

export default function App() {
  const { authed } = useAuth();

  if (!authed) {
    return <LandingScreen />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/teams" element={<TeamList />} />
          <Route path="/teams/:id" element={<TeamDetail />} />
          <Route path="/teams/:id/matches" element={<Matches />} />
          <Route path="/people" element={<People />} />
          <Route path="/users/:id" element={<UserProfile />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/dms/:peerId" element={<DMThread />} />
          <Route path="*" element={<Navigate to="/teams" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
