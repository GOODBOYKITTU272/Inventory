import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';

export default function Login() {
  const { session, loading } = useAuth();
  const [err, setErr]   = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-white">
      <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  );
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
    <div className="min-h-screen bg-white flex flex-col">

      {/* Top nav bar */}
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

        {/* Eyebrow */}
        <div className="inline-flex items-center gap-1.5 bg-brand/8 text-brand text-xs font-semibold px-3 py-1 rounded-full mb-6 tracking-wide uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          Office pantry · Live
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-[1.1] tracking-tight max-w-md">
          Your office fuel,<br />
          <span className="text-brand">beautifully</span> served.
        </h1>

        {/* Sub */}
        <p className="mt-4 text-slate-500 text-base max-w-xs leading-relaxed">
          Tea, coffee, snacks — ordered in seconds and tracked live to your desk.
        </p>

        {/* Feature pills */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {[
            { icon: '⚡', label: 'Order in seconds' },
            { icon: '📍', label: 'Live tracking'    },
            { icon: '🔔', label: 'Push alerts'      },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-full"
            >
              <span>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Sign-in box */}
        <div className="mt-10 w-full max-w-xs space-y-3">
          <button
            onClick={signInWithMicrosoft}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white text-sm font-semibold py-3 px-5 rounded-xl transition-colors disabled:opacity-60"
          >
            {busy ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              <svg viewBox="0 0 23 23" className="w-4 h-4 shrink-0" aria-hidden="true">
                <rect x="1"  y="1"  width="10" height="10" fill="#f25022" />
                <rect x="12" y="1"  width="10" height="10" fill="#7fba00" />
                <rect x="1"  y="12" width="10" height="10" fill="#00a4ef" />
                <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
              </svg>
            )}
            {busy ? 'Redirecting…' : 'Continue with Microsoft'}
          </button>

          {err && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 px-4 py-2.5 rounded-lg text-center">
              {err}
            </div>
          )}

          <p className="text-xs text-slate-400 text-center">
            @applywizz.ai accounts only · Secured by Microsoft
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-5 text-center">
        <p className="text-xs text-slate-300">© 2025 Applywizz · Built for the team ☕</p>
      </footer>

    </div>
  );
}
