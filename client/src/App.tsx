import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import RepoDetailPage from './pages/RepoDetailPage';
import { useConfig } from './hooks/useGitHub';

/** Redirects to /dashboard if configured, /setup otherwise. */
function RootRedirect() {
  const { data, isLoading } = useConfig();

  if (isLoading) return null;

  return data?.configured
    ? <Navigate to="/dashboard" replace />
    : <Navigate to="/setup" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/repo/:owner/:repo" element={<RepoDetailPage />} />
      </Route>
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
