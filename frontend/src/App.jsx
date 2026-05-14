import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/Login.jsx';
import DashboardPage from './pages/Dashboard.jsx';
import DailyUpdatePage from './pages/DailyUpdate.jsx';
import FinancePage from './pages/Finance.jsx';
import StaffViewPage from './pages/StaffView.jsx';
import { useAuth } from './hooks/useAuth.js';

function Protected({ children, allow }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (allow && profile && !allow.includes(profile.role)) {
    return <div className="p-8 text-rose-600">Access denied for role: {profile.role}</div>;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/daily-update"
          element={
            <Protected allow={['facility_manager', 'leadership']}>
              <DailyUpdatePage />
            </Protected>
          }
        />
        <Route
          path="/finance"
          element={
            <Protected allow={['finance', 'leadership']}>
              <FinancePage />
            </Protected>
          }
        />
        <Route path="/available" element={<StaffViewPage />} />
      </Route>
    </Routes>
  );
}
