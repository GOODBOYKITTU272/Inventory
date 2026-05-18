import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';

const ALLOWED_DOMAIN = 'applywizz.ai';

export default function Login() {
  const { session, loading } = useAuth();

  const [step,  setStep]  = useState('email');   // 'email' | 'otp'
  const [email, setEmail] = useState('');
  const [otp,   setOtp]   = useState('');
  const [err,   setErr]   = useState('');
  const [busy,  setBusy]  = useState(false);

  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-white">
      <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  );
  if (session) return <Navigate to="/" replace />;

  // Step 1 → validate domain → send OTP
  async function submitEmail(e) {
    e.preventDefault();
    setErr('');
    const trimmed = email.trim().toLowerCase();

    if (!trimmed.endsWith('@' + ALLOWED_DOMAIN)) {
      setErr(`Only @${ALLOWED_DOMAIN} accounts are allowed.`);
      return;
    }

    setBusy(true);
    setEmail(trimmed);

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });

    setBusy(false);

    if (error) {
      setErr('Could not send code: ' + error.message);
      return;
    }

    setStep('otp');
  }

  // Step 2 → verify OTP → logged in
  async function submitOtp(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: 'email',
    });

    setBusy(false);

    if (error) {
      setErr('Invalid or expired code. Check your email and try again.');
    }
  }

  async function resendOtp() {
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setErr('Could not resend: ' + error.message);
    } else {
      setErr('✅ New code sent to ' + email);
    }
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

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 bg-brand/8 text-brand text-xs font-semibold px-3 py-1 rounded-full mb-8 tracking-wide uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          Office pantry
        </div>

        {/* Headline */}
        <h1 className="text-[2.5rem] sm:text-5xl font-bold text-slate-900 leading-[1.08] tracking-tight max-w-lg">
          Your office fuel,{' '}
          <span className="text-brand">beautifully</span> served.
        </h1>

        <p className="mt-4 text-slate-500 text-[15px] max-w-sm leading-relaxed">
          Tea, coffee, snacks — ordered in seconds, tracked live to your desk.
        </p>

        {/* Feature pills */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {[
            { icon: '⚡', label: 'Instant orders' },
            { icon: '📍', label: 'Live tracking' },
            { icon: '🔔', label: 'Push alerts' },
          ].map(({ icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-full select-none"
            >
              {icon} {label}
            </span>
          ))}
        </div>

        {/* ─── Step 1: Email ─── */}
        {step === 'email' && (
          <form onSubmit={submitEmail} className="mt-10 w-full max-w-xs space-y-3 text-left">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
              Work email
            </label>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder={`you@${ALLOWED_DOMAIN}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-shadow"
            />

            {err && <Msg text={err} />}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-brand hover:bg-brand/90 active:scale-[0.98] text-white text-sm font-semibold py-3 rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy ? <Spin /> : null}
              {busy ? 'Sending code…' : 'Continue'}
            </button>

            <p className="text-[11px] text-slate-400 text-center pt-1">
              A one-time code will be sent to your work email
            </p>
          </form>
        )}

        {/* ─── Step 2: OTP ─── */}
        {step === 'otp' && (
          <form onSubmit={submitOtp} className="mt-10 w-full max-w-xs space-y-4 text-left">

            {/* Back link */}
            <button
              type="button"
              onClick={() => { setStep('email'); setOtp(''); setErr(''); }}
              className="text-xs text-slate-400 hover:text-brand transition-colors flex items-center gap-1"
            >
              ← Change email
            </button>

            {/* Inbox prompt */}
            <div className="text-center py-2">
              <div className="text-3xl mb-2">📬</div>
              <p className="text-sm font-semibold text-slate-800">Check your inbox</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                We sent a 6-digit code to<br />
                <strong className="text-slate-700">{email}</strong>
              </p>
            </div>

            {/* Code input */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
                Verification code
              </label>
              <input
                type="text"
                required
                autoFocus
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-center text-xl font-mono tracking-[0.4em] text-slate-900 placeholder-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-shadow"
              />
            </div>

            {err && <Msg text={err} />}

            <button
              type="submit"
              disabled={busy || otp.length < 6}
              className="w-full bg-brand hover:bg-brand/90 active:scale-[0.98] text-white text-sm font-semibold py-3 rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy ? <Spin /> : null}
              {busy ? 'Verifying…' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={resendOtp}
              disabled={busy}
              className="w-full text-xs text-slate-400 hover:text-brand transition-colors text-center py-1"
            >
              Didn't get it? Resend code
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

/* ── Tiny components ── */

function Spin() {
  return <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />;
}

function Msg({ text }) {
  const ok = text.startsWith('✅');
  return (
    <div className={`text-xs px-4 py-2.5 rounded-xl border leading-relaxed ${
      ok
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-rose-50 text-rose-600 border-rose-100'
    }`}>
      {text}
    </div>
  );
}
