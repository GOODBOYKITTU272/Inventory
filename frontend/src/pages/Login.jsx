import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';

const ALLOWED_DOMAIN = 'applywizz.ai';
const HIDDEN_PASSWORD = 'Applywizz@2026';

export default function Login() {
  const { session, loading, aal } = useAuth();

  // Steps: 'email' → 'enroll' (new, QR) → 'verify' (enter code)
  const [step,    setStep]    = useState('email');
  const [email,   setEmail]   = useState('');
  const [err,     setErr]     = useState('');
  const [busy,    setBusy]    = useState(false);

  // MFA state
  const [qrCode,      setQrCode]      = useState('');   // SVG or URI for QR
  const [factorId,    setFactorId]    = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [totpCode,    setTotpCode]    = useState('');

  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-white">
      <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  );

  // If already fully authenticated (AAL2), redirect home
  if (session && aal === 'aal2' && step === 'email') {
    return <Navigate to="/" replace />;
  }

  // ── Step 1: Enter email ──
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

    try {
      // Try sign in with hidden password
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password: HIDDEN_PASSWORD,
      });

      if (signInErr) {
        const msg = signInErr.message?.toLowerCase() || '';

        // Account doesn't exist → create it
        if (msg.includes('invalid login') || msg.includes('invalid email') || msg.includes('user not found')) {
          const { error: signUpErr } = await supabase.auth.signUp({
            email: trimmed,
            password: HIDDEN_PASSWORD,
            options: {
              data: { full_name: trimmed.split('@')[0] },
            },
          });

          if (signUpErr) {
            // Maybe user exists but with different password (old "Lovefood")
            // Try updating via admin or show error
            setErr('Could not create account: ' + signUpErr.message);
            setBusy(false);
            return;
          }

          // Sign in right after signup
          const { error: postSignupErr } = await supabase.auth.signInWithPassword({
            email: trimmed,
            password: HIDDEN_PASSWORD,
          });

          if (postSignupErr) {
            setErr('Account created but could not sign in: ' + postSignupErr.message);
            setBusy(false);
            return;
          }
        } else {
          setErr('Could not sign in: ' + signInErr.message);
          setBusy(false);
          return;
        }
      }

      // Signed in with password (AAL1) — now handle MFA
      await handleMfaAfterSignIn();
    } catch (ex) {
      setErr('Something went wrong: ' + (ex.message || ex));
    } finally {
      setBusy(false);
    }
  }

  // After password sign-in, check MFA enrollment
  async function handleMfaAfterSignIn() {
    const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();

    if (fErr) {
      setErr('Could not check authenticator status: ' + fErr.message);
      return;
    }

    const totp = factors?.totp?.find(f => f.status === 'verified');
    const unverifiedTotp = factors?.totp?.find(f => f.status === 'unverified');

    if (totp) {
      // Returning user — has verified TOTP factor → challenge
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
        factorId: totp.id,
      });
      if (cErr) {
        setErr('Could not start authenticator challenge: ' + cErr.message);
        return;
      }
      setFactorId(totp.id);
      setChallengeId(challenge.id);
      setStep('verify');
    } else if (unverifiedTotp) {
      // Had an unverified enrollment — unenroll and re-enroll fresh
      await supabase.auth.mfa.unenroll({ factorId: unverifiedTotp.id });
      await enrollNewTotp();
    } else {
      // New user — no TOTP factor → enroll
      await enrollNewTotp();
    }
  }

  // Enroll a new TOTP factor (show QR code)
  async function enrollNewTotp() {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Microsoft Authenticator',
    });

    if (error) {
      setErr('Could not set up authenticator: ' + error.message);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setStep('enroll');
  }

  // Verify TOTP code (used for both enroll confirmation and returning user)
  async function submitCode(e) {
    e.preventDefault();
    setErr('');

    if (totpCode.length !== 6) {
      setErr('Enter the 6-digit code from Microsoft Authenticator.');
      return;
    }

    setBusy(true);

    try {
      let cId = challengeId;

      // If enrolling, we need to create a challenge first
      if (step === 'enroll' || !cId) {
        const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
          factorId,
        });
        if (cErr) {
          setErr('Challenge failed: ' + cErr.message);
          setBusy(false);
          return;
        }
        cId = challenge.id;
        setChallengeId(cId);
      }

      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: cId,
        code: totpCode,
      });

      if (vErr) {
        setErr('Invalid code. Check Microsoft Authenticator and try again.');
        setTotpCode('');
        setBusy(false);
        return;
      }

      // MFA verified! Session is now AAL2 — onAuthStateChange will fire
      // and redirect via the session check
    } catch (ex) {
      setErr('Verification failed: ' + (ex.message || ex));
    } finally {
      setBusy(false);
    }
  }

  // If session exists and is AAL2 (fully MFA'd), redirect home
  if (session) {
    // Check current auth level
    const checkAAL = async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      return data;
    };
    // Simple sync check: if we're past the email step and session exists, likely AAL2
    if (step === 'email') {
      return <Navigate to="/" replace />;
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

        {/* ─── STEP: Email ─── */}
        {step === 'email' && (
          <>
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
                Sign in with your @applywizz.ai email + Microsoft Authenticator
              </p>
            </form>
          </>
        )}

        {/* ─── STEP: Enroll (first time — scan QR code) ─── */}
        {step === 'enroll' && (
          <div className="w-full max-w-sm space-y-5 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand/10 text-brand text-2xl mb-1">
              📱
            </div>
            <h2 className="text-xl font-bold text-slate-900">Set up Microsoft Authenticator</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Open <strong>Microsoft Authenticator</strong> on your phone<br />
              Tap <strong>+</strong> → <strong>Other account</strong> → Scan this QR code
            </p>

            {qrCode && (
              <div className="flex justify-center">
                <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 inline-block">
                  <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                </div>
              </div>
            )}

            <form onSubmit={submitCode} className="space-y-3 text-left">
              <Label>Enter the 6-digit code from Authenticator</Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                autoComplete="one-time-code"
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-2xl tracking-[0.5em] font-mono"
              />
              {err && <Msg text={err} />}
              <Btn busy={busy}>{busy ? 'Verifying…' : 'Verify & Continue'}</Btn>
            </form>

            <button
              onClick={() => { setStep('email'); setErr(''); setTotpCode(''); supabase.auth.signOut(); }}
              className="text-xs text-slate-400 hover:text-brand mt-2"
            >
              ← Use a different email
            </button>
          </div>
        )}

        {/* ─── STEP: Verify (returning user — enter code) ─── */}
        {step === 'verify' && (
          <div className="w-full max-w-sm space-y-5 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand/10 text-brand text-2xl mb-1">
              🔐
            </div>
            <h2 className="text-xl font-bold text-slate-900">Enter authenticator code</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Open <strong>Microsoft Authenticator</strong> and enter the 6-digit code<br />
              for <strong className="text-slate-800">{email}</strong>
            </p>

            <form onSubmit={submitCode} className="space-y-3 text-left">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                autoComplete="one-time-code"
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-2xl tracking-[0.5em] font-mono"
              />
              {err && <Msg text={err} />}
              <Btn busy={busy}>{busy ? 'Verifying…' : 'Sign in'}</Btn>
            </form>

            <button
              onClick={() => { setStep('email'); setErr(''); setTotpCode(''); supabase.auth.signOut(); }}
              className="text-xs text-slate-400 hover:text-brand mt-2"
            >
              ← Use a different email
            </button>
          </div>
        )}

      </main>

      <footer className="px-8 py-5 text-center">
        <p className="text-[11px] text-slate-300">
          Applywizz Pantry · Secured with Microsoft Authenticator
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
