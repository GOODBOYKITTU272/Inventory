import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';

/**
 * /verify — catches Supabase email verification + password reset links.
 *
 * After the user clicks the link in their email:
 *  - Supabase sets a session automatically (via URL hash tokens)
 *  - We detect the session and show "Create your password" dialog
 *  - User sets password → saved → redirected to home
 */
export default function Verify() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [pw,      setPw]      = useState('');
  const [pw2,     setPw2]     = useState('');
  const [showPw,  setShowPw]  = useState(false);
  const [err,     setErr]     = useState('');
  const [busy,    setBusy]    = useState(false);
  const [done,    setDone]    = useState(false);
  const [waiting, setWaiting] = useState(true);

  // Wait for Supabase to process the URL hash tokens (auto-exchange)
  useEffect(() => {
    const timer = setTimeout(() => setWaiting(false), 2000);

    // Listen for auth events from the URL hash exchange
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        setWaiting(false);
        clearTimeout(timer);
      }
    });

    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function savePassword(e) {
    e.preventDefault();
    setErr('');

    if (pw.length < 6) {
      setErr('Password must be at least 6 characters.');
      return;
    }
    if (pw !== pw2) {
      setErr('Passwords do not match.');
      return;
    }

    setBusy(true);

    const { error } = await supabase.auth.updateUser({ password: pw });

    setBusy(false);

    if (error) {
      setErr('Could not save password: ' + error.message);
      return;
    }

    setDone(true);
    // Brief pause to show success, then navigate
    setTimeout(() => navigate('/', { replace: true }), 1200);
  }

  // Still waiting for auth to process
  if (authLoading || waiting) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <div className="w-8 h-8 mx-auto rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <p className="text-sm text-slate-500">Verifying your email…</p>
        </div>
      </Shell>
    );
  }

  // No session = link expired or invalid
  if (!session) {
    return (
      <Shell>
        <div className="text-center space-y-4">
          <div className="text-3xl">⚠️</div>
          <p className="text-base font-semibold text-slate-900">Link expired or invalid</p>
          <p className="text-sm text-slate-500">
            The verification link may have expired.<br />
            Go back to login and request a new one.
          </p>
          <button onClick={() => navigate('/login', { replace: true })}
            className="text-sm text-brand font-semibold hover:underline">
            ← Back to login
          </button>
        </div>
      </Shell>
    );
  }

  // Done — password saved
  if (done) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <div className="text-4xl">✅</div>
          <p className="text-base font-semibold text-slate-900">You're all set!</p>
          <p className="text-sm text-slate-500">Redirecting to your dashboard…</p>
        </div>
      </Shell>
    );
  }

  // Session exists — show create password form
  return (
    <Shell>
      <form onSubmit={savePassword} className="w-full max-w-xs mx-auto space-y-4 text-left">

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand/10 text-brand text-2xl mb-3">
            🔐
          </div>
          <h2 className="text-xl font-bold text-slate-900">Create your password</h2>
          <p className="text-sm text-slate-500 mt-1">
            {session.user?.email}
          </p>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
            Password
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              required
              autoFocus
              autoComplete="new-password"
              placeholder="Min 6 characters"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-14 text-sm text-slate-900 placeholder-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-shadow"
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs select-none">
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
            Confirm password
          </label>
          <input
            type={showPw ? 'text' : 'password'}
            required
            autoComplete="new-password"
            placeholder="Type it again"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-shadow"
          />
          {pw2.length > 0 && pw !== pw2 && (
            <p className="text-xs text-rose-500 mt-1">Passwords don't match</p>
          )}
          {pw2.length > 0 && pw === pw2 && pw.length >= 6 && (
            <p className="text-xs text-emerald-600 mt-1">✓ Passwords match</p>
          )}
        </div>

        {err && (
          <div className={`text-xs px-4 py-2.5 rounded-xl border leading-relaxed ${
            err.startsWith('✅')
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-600 border-rose-100'
          }`}>{err}</div>
        )}

        <button
          type="submit"
          disabled={busy || pw.length < 6 || pw !== pw2}
          className="w-full bg-brand hover:bg-brand/90 active:scale-[0.98] text-white text-sm font-semibold py-3 rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {busy && <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
          {busy ? 'Saving…' : 'Save & Continue'}
        </button>

      </form>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 sm:px-8 py-5 flex items-center">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-brand grid place-items-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-semibold text-slate-900 text-sm tracking-tight">
            Applywizz Pantry
          </span>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        {children}
      </main>
    </div>
  );
}
