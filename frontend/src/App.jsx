import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/Login.jsx';
import DashboardPage from './pages/Dashboard.jsx';
import DailyUpdatePage from './pages/DailyUpdate.jsx';
import FinancePage from './pages/Finance.jsx';
import StaffViewPage from './pages/StaffView.jsx';
import AdminPage from './pages/Admin.jsx';
import RequestSubmitPage from './pages/RequestSubmit.jsx';
import CafeteriaPage from './pages/Cafeteria.jsx';
import RequestQueuePage from './pages/RequestQueue.jsx';
import LiveTrackingPage from './pages/LiveTracking.jsx';
import BillUploadPage from './pages/BillUpload.jsx';
import BillApprovalPage from './pages/BillApproval.jsx';
import PreferencesPage from './pages/Preferences.jsx';
import AuditLogPage from './pages/AuditLog.jsx';
import ConnectionsPage from './pages/Connections.jsx';
import OnboardingPage from './pages/Onboarding.jsx';
import { useAuth } from './hooks/useAuth.js';
import { supabase } from './lib/supabase.js';

function Protected({ children, allow }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (allow && profile && !allow.includes(profile.role)) {
    return <div className="p-8 text-rose-600">Access denied for role: {profile.role}</div>;
  }
  return children;
}

/**
 * OnboardingGate – wraps the entire authenticated app.
 * Checks whether the current user has completed cafeteria onboarding.
 * If not, shows the onboarding flow before rendering children.
 */
function OnboardingGate({ children }) {
  const { session, profile, loading: authLoading } = useAuth();
  const [checking,   setChecking]   = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    if (authLoading || !session) return;

    async function check() {
      try {
        const { data } = await supabase
          .from('employee_cafeteria_preferences')
          .select('onboarding_completed')
          .eq('user_id', session.user.id)
          .maybeSingle();

        // Show onboarding if row is missing OR onboarding_completed is false/null
        setNeedsSetup(!data || !data.onboarding_completed);
      } catch {
        // Table might not exist yet — skip onboarding gracefully
        setNeedsSetup(false);
      } finally {
        setChecking(false);
      }
    }

    check();
  }, [session, authLoading]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-10 w-10 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (needsSetup) {
    return (
      <OnboardingPage
        onComplete={() => setNeedsSetup(false)}
      />
    );
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
            <OnboardingGate>
              <Layout />
            </OnboardingGate>
          </Protected>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={
            <Protected allow={['facility_manager', 'finance', 'leadership']}>
              <DashboardPage />
            </Protected>
          }
        />
        <Route
          path="/available"
          element={
            <Protected allow={['facility_manager', 'finance', 'leadership', 'office_boy']}>
              <StaffViewPage />
            </Protected>
          }
        />
        {/* /request now renders the full cafeteria UI for all roles */}
        <Route path="/request"   element={<CafeteriaPage />} />
        <Route path="/track/:id" element={<LiveTrackingPage />} />
        <Route path="/settings"  element={<PreferencesPage />} />
        <Route
          path="/queue"
          element={
            <Protected allow={['office_boy', 'facility_manager', 'leadership']}>
              <RequestQueuePage />
            </Protected>
          }
        />
        <Route
          path="/bills"
          element={
            <Protected allow={['office_boy', 'facility_manager', 'leadership', 'finance']}>
              <BillUploadPage />
            </Protected>
          }
        />
        <Route
          path="/bills/approve"
          element={
            <Protected allow={['leadership', 'finance']}>
              <BillApprovalPage />
            </Protected>
          }
        />
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
        <Route
          path="/admin"
          element={
            <Protected allow={['leadership']}>
              <AdminPage />
            </Protected>
          }
        />
        <Route
          path="/reports"
          element={
            <Protected allow={['leadership']}>
              <AuditLogPage />
            </Protected>
          }
        />
        <Route
          path="/connections"
          element={
            <Protected allow={['leadership']}>
              <ConnectionsPage />
            </Protected>
          }
        />
      </Route>
    </Routes>
  );
}
