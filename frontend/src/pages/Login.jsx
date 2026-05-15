import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';

const ALLOWED_DOMAIN = 'applywizz.ai';

function friendlyOtpError(message = '') {
  const lower = message.toLowerCase();

  if (lower.includes('database error') || lower.includes('saving new user')) {
    return 'We could not send your login code right now. Please try again in a minute or contact admin.';
  }

  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many login attempts. Please wait a minute and try again.';
  }

  return 'Could not send the login code. Please check the email and try again.';
}

export default function Login() {
  const { session, loading } = useAuth();

  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-white">
      <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  );
  if (session) return <Navigate to="/" replace />;

  async function sendOtp(targetEmail) {
    await api.startOtp(targetEmail);
  }

  async function submitEmail(e) {
    e.preventDefault();
    setErr('');

    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith('@' + ALLOWED_DOMAIN)) {
      setErr(`Only @${ALLOWED_DOMAIN} accounts are allowed.`);
      return;
    }

    setBusy(true);
    try {
      await sendOtp(trimmed);
      setEmail(trimmed);
      setStep('otp');
    } catch (otpErr) {
      setErr(friendlyOtpError(otpErr.message));
    } finally {
      setBusy(false);
    }
  }

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
    try {
      await sendOtp(email);
      setErr('New code sent to ' + email);
    } catch (otpErr) {
      setErr(friendlyOtpError(otpErr.message));
    } finally {
      setBusy(false);
    }
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

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="inline-flex items-center gap-1.5 bg-brand/8 text-brand text-xs font-semibold px-3 py-1 rounded-full mb-6 tracking-wide uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          Team Member Login
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-[1.1] tracking-tight max-w-md">
          Your office fuel,<br />
          <span className="text-brand">beautifully</span> served.
        </h1>
        <p className="mt-4 text-slate-500 text-base max-w-xs leading-relaxed">
          Enter your company email. We will send a 6-digit code to sign you in.
        </p>

        {step === 'email' && (
          <form onSubmit={submitEmail} className="mt-8 w-full max-w-xs space-y-3 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                Work Email
              </label>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder={`you@${ALLOWED_DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
              />
              <p className="text-xs text-slate-400 mt-1.5">@{ALLOWED_DOMAIN} accounts only</p>
            </div>
            {err && <MessageBox msg={err} />}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <Mail size={16} />
              )}
              {busy ? 'Sending code...' : 'Send login code'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={submitOtp} className="mt-8 w-full max-w-xs space-y-3 text-left">
            <button
              type="button"
              onClick={() => { setStep('email'); setOtp(''); setErr(''); }}
              className="text-xs text-slate-400 hover:text-brand flex items-center gap-1 mb-1"
            >
              Back to {email}
            </button>
            <div className="text-center mb-2">
              <Mail className="mx-auto mb-2 text-brand" size={28} />
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
                type="text"
                required
                autoFocus
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-xl text-center font-mono text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition tracking-[0.35em]"
              />
            </div>
            {err && <MessageBox msg={err} />}
            <button
              type="submit"
              disabled={busy || otp.length < 6}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {busy ? 'Verifying...' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={resendOtp}
              disabled={busy}
              className="w-full text-xs text-slate-400 hover:text-brand text-center py-1 transition-colors"
            >
              Did not get it? Resend code
            </button>
          </form>
        )}
      </main>

      <footer className="px-8 py-5 text-center">
        <p className="text-xs text-slate-300">Applywizz Office Pantry</p>
      </footer>
    </div>
  );
}

function MessageBox({ msg }) {
  const isOk = msg.startsWith('New code sent');
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
