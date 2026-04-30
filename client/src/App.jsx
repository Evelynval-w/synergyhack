// client/src/App.jsx
//
// Top-level router. If unauthenticated, show LoginScreen.
// If authenticated, show the routed app under Layout.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuth from './hooks/useAuth';
import Layout from './components/Layout';
import LoginScreen from './components/LoginScreen';
import TeamList from './pages/TeamList';
import TeamDetail from './pages/TeamDetail';
import Matches from './pages/Matches';

export default function App() {
  const { authed } = useAuth();

  if (!authed) {
    return <LoginScreen />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/teams" element={<TeamList />} />
          <Route path="/teams/:id" element={<TeamDetail />} />
          <Route path="/teams/:id/matches" element={<Matches />} />
          <Route path="*" element={<Navigate to="/teams" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
