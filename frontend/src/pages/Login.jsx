import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';

export default function Login() {
  const { session, loading } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [err,      setErr]      = useState('');
  const [busy,     setBusy]     = useState(false);
  const [resetSent, setResetSent] = useState(false);

  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-white">
      <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  );
  if (session) return <Navigate to="/" replace />;

  async function signIn(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      // Friendly error messages
      if (error.message.toLowerCase().includes('invalid login')) {
        setErr('Wrong email or password. Default password is Lovefood — ask your admin if you\'re stuck.');
      } else {
        setErr(error.message);
      }
    }
    // On success, session change triggers Navigate above
  }

  async function sendReset() {
    if (!email.trim()) { setErr('Enter your email first, then click Forgot password.'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/settings',
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setResetSent(true);
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Top bar */}
      <header className="px-8 py-5 flex items-center">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-brand grid place-items-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-semibold text-slate-900 text-sm tracking-tight">Applywizz Pantry</span>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">

        <div className="inline-flex items-center gap-1.5 bg-brand/8 text-brand text-xs font-semibold px-3 py-1 rounded-full mb-6 tracking-wide uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          Office pantry · Live
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-[1.1] tracking-tight max-w-md">
          Your office fuel,<br />
          <span className="text-brand">beautifully</span> served.
        </h1>

        <p className="mt-4 text-slate-500 text-base max-w-xs leading-relaxed">
          Tea, coffee, snacks — ordered in seconds and tracked live to your desk.
        </p>

        {/* Feature pills */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {[
            { icon: '⚡', label: 'Order in seconds' },
            { icon: '📍', label: 'Live tracking'    },
            { icon: '🔔', label: 'Push alerts'      },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-full">
              <span>{icon}</span><span>{label}</span>
            </div>
          ))}
        </div>

        {/* Sign-in form */}
        <form onSubmit={signIn} className="mt-8 w-full max-w-xs space-y-3 text-left">

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              Work Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@applywizz.ai"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              Password
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {err && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 px-4 py-2.5 rounded-lg">
              {err}
            </div>
          )}

          {resetSent && (
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-lg">
              ✅ Password reset link sent to {email}. Check your inbox.
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy
              ? <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              : '→'
            }
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={sendReset}
            disabled={busy}
            className="w-full text-xs text-slate-400 hover:text-brand transition-colors text-center py-1"
          >
            Forgot password?
          </button>

          <p className="text-xs text-slate-400 text-center pt-1">
            Account created by your admin · Secured by Applywizz
          </p>
        </form>
      </main>

      <footer className="px-8 py-5 text-center">
        <p className="text-xs text-slate-300">© 2025 Applywizz · Built for the team ☕</p>
      </footer>
    </div>
  );
}
