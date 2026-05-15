import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, LockKeyhole } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';

export default function SetPassword() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function savePassword(e) {
    e.preventDefault();
    setErr('');

    if (password.length < 6) {
      setErr('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setErr('Passwords do not match.');
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      setErr('Could not update password. Please request a new setup link.');
      return;
    }

    await supabase.auth.signOut();
    navigate('/login?passwordUpdated=1', { replace: true });
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-8 py-5 flex items-center">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-brand grid place-items-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-semibold text-slate-900 text-sm tracking-tight">Applywizz Pantry</span>
        </div>
      </header>

      <main className="flex-1 grid place-items-center px-6">
        <form onSubmit={savePassword} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="text-center">
            <div className="mx-auto h-11 w-11 rounded-xl bg-brand/10 text-brand grid place-items-center mb-3">
              <LockKeyhole size={22} />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Create your password</h1>
            <p className="text-sm text-slate-500 mt-1">
              Enter and confirm your password to finish setup.
            </p>
          </div>

          {loading && (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
              Checking your email link...
            </div>
          )}

          {!loading && !session && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-4 py-2.5">
              This setup link is expired or invalid. Go back to login and request a new setup link.
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              Password
            </label>
            <input
              type="password"
              required
              autoFocus
              autoComplete="new-password"
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              Re-enter Password
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
            />
          </div>

          {err && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-4 py-2.5">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || loading || !session}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            {busy ? 'Saving...' : 'Save password'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full text-xs text-slate-400 hover:text-brand text-center py-1 transition-colors"
          >
            Back to login
          </button>
        </form>
      </main>
    </div>
  );
}
