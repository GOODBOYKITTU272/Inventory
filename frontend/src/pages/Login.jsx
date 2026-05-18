import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';

const ALLOWED_DOMAIN = 'applywizz.ai';

export default function Login() {
  const { session, loading } = useAuth();

  // 'email' → 'check-inbox' → 'password' (returning user)
  const [step,     setStep]     = useState('email');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [err,      setErr]      = useState('');
  const [busy,     setBusy]     = useState(false);

  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-white">
      <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  );
  if (session) return <Navigate to="/" replace />;

  // ── Step 1: enter email ──
  async function submitEmail(e) {
    e.preventDefault();
    setErr('');
    const trimmed = email.trim().toLowerCase();

    if (!trimmed.endsWith('@' + ALLOWED_DOMAIN)) {
      setErr(`Only @${ALLOWED_DOMAIN} accounts are allowed.`);
      return;
    }

    setEmail(trimmed);
    setBusy(true);

    // Check if user already exists (has signed up before)
    const { error: pwErr } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password: '___probe___',  // intentionally wrong — just checking if account exists
    });

    // "Invalid login credentials" = account exists, wrong password → go to password step
    // "Email not confirmed" = exists but unverified
    // Other errors = account doesn't exist → send sign-up link
    const errMsg = pwErr?.message?.toLowerCase() || '';
    const accountExists = errMsg.includes('invalid login') || errMsg.includes('not confirmed');

    if (accountExists) {
      setBusy(false);
      setStep('password');
      return;
    }

    // New user → send verification email (magic link)
    const { error: signUpErr } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + '/verify',
      },
    });

    setBusy(false);

    if (signUpErr) {
      setErr('Could not send verification email: ' + signUpErr.message);
      return;
    }

    setStep('check-inbox');
  }

  // ── Step 2b: returning user → password ──
  async function submitPassword(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);

    if (error) {
      if (error.message.toLowerCase().includes('invalid login')) {
        setErr('Wrong password.');
      } else {
        setErr(error.message);
      }
    }
    // success → session fires → Navigate above redirects
  }

  // ── Forgot password ──
  async function forgotPassword() {
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/verify',
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
    } else {
      setErr('✅ Password reset link sent to ' + email + '. Check your inbox.');
    }
  }

  // ── Resend verification ──
  async function resend() {
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + '/verify' },
    });
    setBusy(false);
    setErr(error ? error.message : '✅ New link sent to ' + email);
  }

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

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center -mt-12">

        <div className="inline-flex items-center gap-1.5 bg-brand/8 text-brand text-xs font-semibold px-3 py-1 rounded-full mb-8 tracking-wide uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          Office pantry
        </div>

        <h1 className="text-[2.5rem] sm:text-5xl font-bold text-slate-900 leading-[1.08] tracking-tight max-w-lg">
          Your office fuel,{' '}
          <span className="text-brand">beautifully</span> served.
        </h1>

        <p className="mt-4 text-slate-500 text-[15px] max-w-sm leading-relaxed">
          Tea, coffee, snacks — ordered in seconds, tracked live to your desk.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {[
            { icon: '⚡', label: 'Instant orders' },
            { icon: '📍', label: 'Live tracking' },
            { icon: '🔔', label: 'Push alerts' },
          ].map(({ icon, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-full select-none">
              {icon} {label}
            </span>
          ))}
        </div>

        {/* ─── STEP: Email ─── */}
        {step === 'email' && (
          <form onSubmit={submitEmail} className="mt-10 w-full max-w-xs space-y-3 text-left">
            <Label>Work email</Label>
            <Input
              type="email" required autoFocus autoComplete="email"
              placeholder={`you@${ALLOWED_DOMAIN}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {err && <Msg text={err} />}
            <Btn busy={busy}>{busy ? 'Checking…' : 'Continue'}</Btn>
            <p className="text-[11px] text-slate-400 text-center pt-1">
              New here? We'll send a verification link. Already signed up? Enter your password.
            </p>
          </form>
        )}

        {/* ─── STEP: Check Inbox (new user sign-up) ─── */}
        {step === 'check-inbox' && (
          <div className="mt-10 w-full max-w-xs space-y-4 text-center">
            <div className="text-3xl mb-1">📬</div>
            <p className="text-base font-semibold text-slate-900">Check your inbox</p>
            <p className="text-sm text-slate-500 leading-relaxed">
              We sent a verification link to<br />
              <strong className="text-slate-800">{email}</strong>
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Click the link in your email to verify your account.<br />
              You'll then set a password to complete sign-up.
            </p>
            {err && <Msg text={err} />}
            <button onClick={resend} disabled={busy}
              className="text-xs text-brand hover:underline disabled:opacity-50">
              Didn't get it? Resend link
            </button>
            <button onClick={() => { setStep('email'); setErr(''); }}
              className="block mx-auto text-xs text-slate-400 hover:text-brand mt-2">
              ← Use a different email
            </button>
          </div>
        )}

        {/* ─── STEP: Password (returning user) ─── */}
        {step === 'password' && (
          <form onSubmit={submitPassword} className="mt-10 w-full max-w-xs space-y-3 text-left">
            <button type="button" onClick={() => { setStep('email'); setErr(''); setPassword(''); }}
              className="text-xs text-slate-400 hover:text-brand flex items-center gap-1 mb-1">
              ← {email}
            </button>
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'} required autoFocus autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-14"
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs select-none">
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
            {err && <Msg text={err} />}
            <Btn busy={busy}>{busy ? 'Signing in…' : 'Sign in'}</Btn>
            <button type="button" onClick={forgotPassword} disabled={busy}
              className="w-full text-xs text-slate-400 hover:text-brand transition-colors text-center py-1">
              Forgot password?
            </button>
          </form>
        )}

      </main>

      <footer className="px-8 py-5 text-center">
        <p className="text-[11px] text-slate-300">
          Applywizz Pantry · Secured with email verification
        </p>
      </footer>
    </div>
  );
}

/* ── Shared UI pieces ── */

function Label({ children }) {
  return <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">{children}</label>;
}

function Input({ className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-shadow ${className}`}
    />
  );
}

function Btn({ busy, children }) {
  return (
    <button type="submit" disabled={busy}
      className="w-full bg-brand hover:bg-brand/90 active:scale-[0.98] text-white text-sm font-semibold py-3 rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2">
      {busy && <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
      {children}
    </button>
  );
}

function Msg({ text }) {
  const ok = text.startsWith('✅');
  return (
    <div className={`text-xs px-4 py-2.5 rounded-xl border leading-relaxed ${
      ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-100'
    }`}>{text}</div>
  );
}
