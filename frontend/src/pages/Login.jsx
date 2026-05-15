import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { CheckCircle2, Mail } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';

const ALLOWED_DOMAIN = 'applywizz.ai';

function friendlyEmailError(message = '') {
  const lower = message.toLowerCase();

  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many email attempts. Please wait before trying again.';
  }

  return 'Could not send the email link. Please check the email and try again.';
}

export default function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-white">
      <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  );
  if (session) return <Navigate to="/" replace />;

  async function sendEmailLink(e) {
    e.preventDefault();
    setErr('');
    setMsg('');

    if (!normalizedEmail.endsWith('@' + ALLOWED_DOMAIN)) {
      setErr(`Only @${ALLOWED_DOMAIN} accounts are allowed.`);
      return;
    }

    setBusy(true);
    try {
      await api.startEmailLogin(normalizedEmail);
      setMsg('Check your email. Click the link to enter Applywizz Pantry.');
    } catch (error) {
      setErr(friendlyEmailError(error.message));
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
          Enter your company email. We will send a secure sign-in link.
        </p>

        <form onSubmit={sendEmailLink} className="mt-8 w-full max-w-xs space-y-3 text-left">
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

          {msg && <MessageBox msg={msg} ok />}
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
            {busy ? 'Sending link...' : 'Send sign-in link'}
          </button>
        </form>
      </main>

      <footer className="px-8 py-5 text-center">
        <p className="text-xs text-slate-300">Applywizz Office Pantry</p>
      </footer>
    </div>
  );
}

function MessageBox({ msg, ok = false }) {
  return (
    <div className={`text-xs px-4 py-2.5 rounded-lg border flex items-start gap-2 ${
      ok
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-rose-50 text-rose-600 border-rose-100'
    }`}>
      {ok && <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
      <span>{msg}</span>
    </div>
  );
}
