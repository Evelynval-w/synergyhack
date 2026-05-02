// client/src/App.jsx

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuth from './hooks/useAuth';
import Layout from './components/Layout';
import LoginScreen from './components/LoginScreen';
import TeamList from './pages/TeamList';
import TeamDetail from './pages/TeamDetail';
import Matches from './pages/Matches';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';

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
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/teams" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}