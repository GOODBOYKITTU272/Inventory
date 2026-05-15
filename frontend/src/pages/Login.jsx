import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';

const ALLOWED_DOMAIN = 'applywizz.ai';

export default function Login() {
  const { session, loading } = useAuth();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (session) return <Navigate to="/dashboard" replace />;

  async function signInWithMicrosoft() {
    setErr('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'openid email profile',
        redirectTo: window.location.origin + '/dashboard',
      },
    });
    if (error) {
      setBusy(false);
      setErr(error.message);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-brand text-white grid place-items-center font-bold">
            A
          </div>
          <div>
            <div className="font-semibold text-slate-900">Applyways Pantry</div>
            <div className="text-xs text-slate-500">Sign in to continue</div>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-5">
          Access is limited to @{ALLOWED_DOMAIN} accounts. Sign in with your Microsoft work account.
        </p>

        <button className="btn-primary w-full" onClick={signInWithMicrosoft} disabled={busy}>
          {busy ? 'Redirecting...' : (
            <>
              <svg viewBox="0 0 23 23" className="w-4 h-4" aria-hidden="true">
                <rect x="1"  y="1"  width="10" height="10" fill="#f25022" />
                <rect x="12" y="1"  width="10" height="10" fill="#7fba00" />
                <rect x="1"  y="12" width="10" height="10" fill="#00a4ef" />
                <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
              </svg>
              Sign in with Microsoft
            </>
          )}
        </button>

        {err && (
          <div className="mt-4 text-sm text-rose-700 bg-rose-50 p-3 rounded-md">{err}</div>
        )}

        <div className="mt-6 text-xs text-slate-400">
          Anyone with an @applywizz.ai Microsoft account can sign in — you'll be added as an Employee automatically.
          Ramakrishna can change your role from the Admin panel.
        </div>
      </div>
    </div>
  );
}
