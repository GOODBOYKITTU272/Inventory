import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';

const ALLOWED_DOMAIN = 'applywizz.ai';

export default function Login() {
  const { session, loading } = useAuth();

  // step: 'email' | 'password' | 'otp'
  const [step,     setStep]     = useState('email');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [otp,      setOtp]      = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [err,      setErr]      = useState('');
  const [busy,     setBusy]     = useState(false);

  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-white">
      <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  );
  if (session) return <Navigate to="/" replace />;

  // Step 1 → validate domain, proceed to password
  function submitEmail(e) {
    e.preventDefault();
    setErr('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith('@' + ALLOWED_DOMAIN)) {
      setErr(`Only @${ALLOWED_DOMAIN} accounts are allowed.`);
      return;
    }
    setEmail(trimmed);
    setStep('password');
  }

  // Step 2 → check shared password locally, then send OTP
  async function submitPassword(e) {
    e.preventDefault();
    setErr('');

    // Shared access password — gate before sending OTP
    if (password !== 'Lovefood') {
      setErr('Wrong password. Default password is Lovefood — ask your admin if stuck.');
      return;
    }

    setBusy(true);
    // Send OTP — auto-creates account on first login for @applywizz.ai
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    setBusy(false);
    if (otpErr) {
      setErr('Could not send code: ' + otpErr.message);
      return;
    }
    setStep('otp');
  }

  // Step 3 → verify OTP → logged in
  async function submitOtp(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type:  'email',
    });

    setBusy(false);
    if (error) {
      setErr('Invalid or expired code. Check your email and try again.');
    }
    // On success, session fires and Navigate above kicks in
  }

  async function resendOtp() {
    setBusy(true); setErr('');
    await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setBusy(false);
    setErr('✅ New code sent to ' + email);
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

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 bg-brand/8 text-brand text-xs font-semibold px-3 py-1 rounded-full mb-6 tracking-wide uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          Office pantry · Live
        </div>

        {/* Headline */}
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

        {/* ── STEP 1: Email ── */}
        {step === 'email' && (
          <form onSubmit={submitEmail} className="mt-8 w-full max-w-xs space-y-3 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                Work Email
              </label>
              <input
                type="email" required autoFocus autoComplete="email"
                placeholder={`you@${ALLOWED_DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
              />
              <p className="text-xs text-slate-400 mt-1.5">@{ALLOWED_DOMAIN} accounts only</p>
            </div>
            {err && <ErrorBox msg={err} />}
            <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-3 rounded-xl transition-colors">
              Continue →
            </button>
          </form>
        )}

        {/* ── STEP 2: Password ── */}
        {step === 'password' && (
          <form onSubmit={submitPassword} className="mt-8 w-full max-w-xs space-y-3 text-left">
            <button type="button" onClick={() => { setStep('email'); setErr(''); }}
              className="text-xs text-slate-400 hover:text-brand flex items-center gap-1 mb-1">
              ← {email}
            </button>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} required autoFocus autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 pr-14 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            {err && <ErrorBox msg={err} />}
            <button type="submit" disabled={busy}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {busy
                ? <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                : '🔐'}
              {busy ? 'Verifying…' : 'Verify & send code'}
            </button>
            <p className="text-xs text-slate-400 text-center">
              A one-time code will be sent to your email
            </p>
          </form>
        )}

        {/* ── STEP 3: OTP ── */}
        {step === 'otp' && (
          <form onSubmit={submitOtp} className="mt-8 w-full max-w-xs space-y-3 text-left">
            <div className="text-center mb-2">
              <div className="text-2xl mb-2">📬</div>
              <p className="text-sm font-semibold text-slate-800">Check your email</p>
              <p className="text-xs text-slate-500 mt-1">
                We sent a 6-digit code to<br />
                <strong className="text-slate-700">{email}</strong>
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                6-digit code
              </label>
              <input
                type="text" required autoFocus inputMode="numeric" maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-xl text-center font-mono text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition tracking-[0.5em]"
              />
            </div>
            {err && <ErrorBox msg={err} />}
            <button type="submit" disabled={busy || otp.length < 6}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {busy
                ? <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                : '✅'}
              {busy ? 'Verifying…' : 'Sign in'}
            </button>
            <button type="button" onClick={resendOtp} disabled={busy}
              className="w-full text-xs text-slate-400 hover:text-brand text-center py-1 transition-colors">
              Didn't get it? Resend code
            </button>
          </form>
        )}

      </main>

      <footer className="px-8 py-5 text-center">
        <p className="text-xs text-slate-300">© 2025 Applywizz · Built for the team ☕</p>
      </footer>
    </div>
  );
}

function ErrorBox({ msg }) {
  const isOk = msg.startsWith('✅');
  return (
    <div className={`text-xs px-4 py-2.5 rounded-lg border ${
      isOk
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-rose-50 text-rose-600 border-rose-100'
    }`}>
      {msg}
    </div>
  );
}
