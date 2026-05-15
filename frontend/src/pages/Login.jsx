import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { CheckCircle2, Coffee, Mail, PackageCheck, Sandwich, Timer } from 'lucide-react';
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
    <div className="min-h-screen bg-[#f8faf9] text-slate-950">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-950 text-sm font-bold text-white">
            A
          </div>
          <div>
            <div className="text-sm font-semibold">Applywizz Pantry</div>
            <div className="text-xs text-slate-500">Team access</div>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          Office pantry live
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-128px)] w-full max-w-6xl items-center gap-10 px-5 pb-10 pt-4 sm:px-8 lg:grid-cols-[1fr_380px]">
        <section className="mx-auto w-full max-w-2xl text-center lg:mx-0 lg:text-left">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase text-brand">
            <PackageCheck size={14} />
            Team Member Login
          </div>

          <h1 className="text-5xl font-bold leading-[1.02] text-slate-950 sm:text-6xl">
            Office requests,
            <span className="block text-brand">without the wait.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 lg:text-lg">
            Tea, coffee, snacks, and desk requests move from your inbox to the pantry team in seconds.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Metric icon={Coffee} label="Fresh coffee" value="Cabin 2" />
            <Metric icon={Sandwich} label="Snack run" value="2 min" />
            <Metric icon={Timer} label="Live queue" value="Ready" />
          </div>
        </section>

        <section className="w-full">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-slate-950">Enter with email</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Use your company inbox to open the pantry.
              </p>
            </div>

            <form onSubmit={sendEmailLink} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-500">
                  Work Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    placeholder={`you@${ALLOWED_DOMAIN}`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-950 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-400">@{ALLOWED_DOMAIN} only</p>
              </div>

              {msg && <MessageBox msg={msg} ok />}
              {err && <MessageBox msg={err} />}

              <button
                type="submit"
                disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {busy ? (
                  <div className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : (
                  <Mail size={16} />
                )}
                {busy ? 'Sending link...' : 'Send sign-in link'}
              </button>
            </form>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="text-sm font-semibold text-slate-800">Today in pantry</div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-brand">Open</span>
            </div>
            <div className="mt-4 space-y-3">
              <PantryRow icon={Coffee} title="Filter coffee" meta="Available now" />
              <PantryRow icon={Sandwich} title="Bread toast" meta="Kitchen queue clear" />
              <PantryRow icon={PackageCheck} title="Desk delivery" meta="Tracking enabled" />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm">
      <Icon className="mb-3 text-brand" size={20} />
      <div className="text-sm font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function PantryRow({ icon: Icon, title, meta }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-50 text-brand">
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-800">{title}</div>
        <div className="truncate text-xs text-slate-500">{meta}</div>
      </div>
    </div>
  );
}

function MessageBox({ msg, ok = false }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-4 py-2.5 text-xs ${
      ok
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-rose-50 text-rose-600 border-rose-100'
    }`}>
      {ok && <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
      <span>{msg}</span>
    </div>
  );
}
