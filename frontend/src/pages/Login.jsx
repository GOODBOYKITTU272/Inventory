import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';

export default function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (session) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/dashboard' },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
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

        {sent ? (
          <div className="text-sm text-emerald-700 bg-emerald-50 p-4 rounded-md">
            Check your inbox — we sent a magic link to <strong>{email}</strong>.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Work email
              </label>
              <input
                type="email"
                required
                className="input"
                placeholder="you@applyways.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {err && <div className="text-sm text-rose-600">{err}</div>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
