import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase.js';

const ALLOWED_DOMAIN = 'applywizz.ai';
const HIDDEN_PASSWORD = 'Applywizz@2026';

/* ── Simple fade-up animation ── */
const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: 'easeOut' } },
});

export default function Login() {
  const navigate = useNavigate();

  const [step,    setStep]    = useState('email');
  const [email,   setEmail]   = useState('');
  const [err,     setErr]     = useState('');
  const [busy,    setBusy]    = useState(false);

  // MFA state
  const [qrCode,      setQrCode]      = useState('');
  const [factorId,    setFactorId]    = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [totpCode,    setTotpCode]    = useState('');

  const submitting = useRef(false);

  // ── Auth Logic (unchanged) ──────────────────────────────────
  async function submitEmail(e) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setErr('');
    const trimmed = email.trim().toLowerCase();

    if (!trimmed.endsWith('@' + ALLOWED_DOMAIN)) {
      setErr(`Only @${ALLOWED_DOMAIN} accounts are allowed.`);
      submitting.current = false;
      return;
    }

    setEmail(trimmed);
    setBusy(true);

    try {
      let { error: signInErr } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password: HIDDEN_PASSWORD,
      });

      if (signInErr) {
        const msg = signInErr.message?.toLowerCase() || '';

        if (msg.includes('invalid login') || msg.includes('invalid email') || msg.includes('user not found') || msg.includes('invalid credentials')) {
          console.log('[Login] Account not found, creating...');
          const { error: signUpErr } = await supabase.auth.signUp({
            email: trimmed,
            password: HIDDEN_PASSWORD,
            options: { data: { full_name: trimmed.split('@')[0] } },
          });

          if (signUpErr) {
            setErr('Could not create account: ' + signUpErr.message);
            setBusy(false);
            submitting.current = false;
            return;
          }

          const { error: postErr } = await supabase.auth.signInWithPassword({
            email: trimmed,
            password: HIDDEN_PASSWORD,
          });

          if (postErr) {
            setErr('Account created but sign-in failed: ' + postErr.message);
            setBusy(false);
            submitting.current = false;
            return;
          }
        } else {
          setErr('Could not sign in: ' + signInErr.message);
          setBusy(false);
          submitting.current = false;
          return;
        }
      }

      console.log('[Login] Signed in, checking MFA...');
      await handleMfaAfterSignIn();
    } catch (ex) {
      setErr('Something went wrong: ' + (ex.message || ex));
      setBusy(false);
      submitting.current = false;
    }
  }

  async function handleMfaAfterSignIn() {
    try {
      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();
      console.log('[Login] MFA factors:', JSON.stringify(factors), fErr?.message);

      if (fErr) {
        setErr('Could not check authenticator: ' + fErr.message);
        setBusy(false);
        submitting.current = false;
        return;
      }

      const totp = factors?.totp?.find(f => f.status === 'verified');
      const unverified = factors?.totp?.find(f => f.status === 'unverified');

      if (totp) {
        console.log('[Login] Existing TOTP factor, creating challenge...');
        const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
          factorId: totp.id,
        });
        if (cErr) {
          setErr('Authenticator challenge failed: ' + cErr.message);
          setBusy(false);
          submitting.current = false;
          return;
        }
        setFactorId(totp.id);
        setChallengeId(challenge.id);
        setBusy(false);
        setStep('verify');
      } else {
        if (unverified) {
          await supabase.auth.mfa.unenroll({ factorId: unverified.id }).catch(() => {});
        }
        console.log('[Login] No TOTP factor, enrolling...');
        await enrollNewTotp();
      }
    } catch (ex) {
      setErr('MFA setup error: ' + (ex.message || ex));
      setBusy(false);
      submitting.current = false;
    }
  }

  async function enrollNewTotp() {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Microsoft Authenticator',
      });

      console.log('[Login] MFA enroll result:', !!data, error?.message);

      if (error) {
        setErr('Could not set up authenticator: ' + error.message);
        setBusy(false);
        submitting.current = false;
        return;
      }

      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setBusy(false);
      setStep('enroll');
      console.log('[Login] QR code ready, showing enroll screen');
    } catch (ex) {
      setErr('Authenticator setup failed: ' + (ex.message || ex));
      setBusy(false);
      submitting.current = false;
    }
  }

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

      if (!cId) {
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
        setChallengeId('');
        setBusy(false);
        return;
      }

      console.log('[Login] MFA verified! Navigating home...');
      setStep('done');
      navigate('/', { replace: true });
    } catch (ex) {
      setErr('Verification failed: ' + (ex.message || ex));
      setBusy(false);
    }
  }

  // ── RENDER ──────────────────────────────────────────────────
  return (
    <div
      className="min-h-[100dvh] flex flex-col relative overflow-hidden"
      style={{
        fontFamily: "'Noto Sans', 'Inter', system-ui, sans-serif",
        background: 'linear-gradient(160deg, #0B1D33 0%, #0a1628 50%, #091220 100%)',
      }}
    >
      {/* ── Ambient glow orbs ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.07]"
             style={{ background: 'radial-gradient(circle, #29FE29, transparent 70%)' }} />
        <div className="absolute -bottom-60 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.05]"
             style={{ background: 'radial-gradient(circle, #2C76FF, transparent 70%)' }} />
      </div>

      {/* ── Header ── */}
      <motion.header
        className="relative z-10 px-5 sm:px-8 py-4 sm:py-5 flex items-center justify-between shrink-0"
        {...fade(0)}
      >
        <img src="/logo.png" alt="ApplyWizz" className="h-8 sm:h-9 object-contain" />
        <div className="flex items-center gap-1.5 text-[11px] text-white/30 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#29FE29] animate-pulse" />
          <span className="hidden sm:inline">Pantry Online</span>
        </div>
      </motion.header>

      {/* ── Main ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-8 py-4">
        <AnimatePresence mode="wait">

          {/* ═══ STEP: Email ═══ */}
          {step === 'email' && (
            <motion.div
              key="email"
              className="w-full max-w-[420px] text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
            >
              {/* Badge */}
              <motion.div {...fade(0.1)}
                className="inline-flex items-center gap-2 bg-white/[0.06] border border-white/[0.08] text-[#29FE29] text-[11px] font-semibold px-4 py-1.5 rounded-full mb-6 sm:mb-8 tracking-wide uppercase"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#29FE29] animate-pulse" />
                Office Pantry
              </motion.div>

              {/* Headline */}
              <motion.h1 {...fade(0.2)}
                className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-white leading-[1.08] tracking-tight"
              >
                Skip the queue.
                <br />
                Not the{' '}
                <span className="text-[#29FE29] inline-block"
                      style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic' }}>
                  snack.
                </span>
              </motion.h1>

              {/* Subheadline */}
              <motion.p {...fade(0.3)}
                className="mt-4 sm:mt-5 text-white/45 text-sm sm:text-[15px] max-w-xs sm:max-w-sm mx-auto leading-relaxed"
              >
                One tap. Live tracking. Delivered to your desk.
                {' '}The smartest pantry your office ever had.
              </motion.p>

              {/* Feature pills */}
              <motion.div {...fade(0.4)} className="mt-5 sm:mt-7 flex flex-wrap justify-center gap-2">
                {[
                  { icon: '⚡', label: '5-sec ordering', color: '#FFDE59' },
                  { icon: '📍', label: 'Live tracking',  color: '#2C76FF' },
                  { icon: '🍱', label: 'Meal booking',   color: '#29FE29' },
                ].map(({ icon, label, color }) => (
                  <span key={label}
                    className="inline-flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.08] text-white/60 text-[11px] font-medium px-3 py-1.5 rounded-full select-none"
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                    <span className="w-1 h-1 rounded-full" style={{ backgroundColor: color }} />
                  </span>
                ))}
              </motion.div>

              {/* Login Form */}
              <motion.form {...fade(0.5)}
                onSubmit={submitEmail}
                className="mt-8 sm:mt-10 w-full max-w-xs mx-auto space-y-3 text-left"
              >
                <label className="block text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-1"
                       style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Work email
                </label>
                <input
                  type="email" required autoFocus autoComplete="email"
                  placeholder={`you@${ALLOWED_DOMAIN}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/[0.1] rounded-2xl px-4 py-3.5 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-[#29FE29]/25 focus:border-[#29FE29]/40 transition-all"
                />
                {err && <Msg text={err} />}
                <button type="submit" disabled={busy}
                  className="w-full bg-[#29FE29] hover:bg-[#22e622] active:scale-[0.97] text-[#0B1D33] text-sm font-bold py-3.5 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#29FE29]/20"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {busy && <Spinner dark />}
                  {busy ? 'Checking…' : 'Continue →'}
                </button>
                <p className="text-[11px] text-white/15 text-center pt-1">
                  Sign in with your @applywizz.ai email + Microsoft Authenticator
                </p>
              </motion.form>
            </motion.div>
          )}

          {/* ═══ STEP: Enroll (first time QR) ═══ */}
          {step === 'enroll' && (
            <motion.div
              key="enroll"
              className="w-full max-w-sm text-center space-y-4"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#2C76FF]/15 border border-[#2C76FF]/20 grid place-items-center text-2xl">
                📱
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">Set up Authenticator</h2>
              <p className="text-sm text-white/45 leading-relaxed">
                Open <strong className="text-white/70">Microsoft Authenticator</strong> on your phone
                <br />
                Tap <strong className="text-white/70">+</strong> → <strong className="text-white/70">Other account</strong> → Scan this QR
              </p>

              {qrCode && (
                <div className="flex justify-center py-2">
                  <div className="bg-white rounded-2xl p-4 inline-block shadow-xl shadow-black/30">
                    <img src={qrCode} alt="QR Code" className="w-44 h-44 sm:w-48 sm:h-48" />
                  </div>
                </div>
              )}

              <form onSubmit={submitCode} className="space-y-3 text-left">
                <label className="block text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-1"
                       style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Enter the 6-digit code
                </label>
                <CodeInput value={totpCode} onChange={setTotpCode} />
                {err && <Msg text={err} />}
                <GreenBtn busy={busy}>{busy ? 'Verifying…' : 'Verify & Continue →'}</GreenBtn>
              </form>

              <BackBtn onClick={() => { setStep('email'); setErr(''); setTotpCode(''); submitting.current = false; supabase.auth.signOut(); }} />
            </motion.div>
          )}

          {/* ═══ STEP: Verify (returning user) ═══ */}
          {step === 'verify' && (
            <motion.div
              key="verify"
              className="w-full max-w-sm text-center space-y-4"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#29FE29]/10 border border-[#29FE29]/20 grid place-items-center text-2xl">
                🔐
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">Welcome back</h2>
              <p className="text-sm text-white/45 leading-relaxed">
                Enter the 6-digit code from <strong className="text-white/70">Microsoft Authenticator</strong>
                <br />
                for <strong className="text-[#29FE29]">{email}</strong>
              </p>

              <form onSubmit={submitCode} className="space-y-3 text-left">
                <CodeInput value={totpCode} onChange={setTotpCode} />
                {err && <Msg text={err} />}
                <GreenBtn busy={busy}>{busy ? 'Verifying…' : 'Sign in →'}</GreenBtn>
              </form>

              <BackBtn onClick={() => { setStep('email'); setErr(''); setTotpCode(''); submitting.current = false; supabase.auth.signOut(); }} />
            </motion.div>
          )}

          {/* ═══ STEP: Done ═══ */}
          {step === 'done' && (
            <motion.div
              key="done"
              className="text-center space-y-3"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="w-12 h-12 mx-auto rounded-full border-2 border-[#29FE29] border-t-transparent animate-spin" />
              <p className="text-sm text-white/40">Signing you in…</p>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 px-5 py-4 text-center shrink-0">
        <p className="text-[11px] text-white/10">
          Built with ❤️ for the people who build ApplyWizz
        </p>
      </footer>
    </div>
  );
}

/* ═══ Shared Components ═══ */

function CodeInput({ value, onChange }) {
  return (
    <input
      type="text" inputMode="numeric" pattern="[0-9]*"
      maxLength={6} required autoFocus autoComplete="one-time-code"
      placeholder="000000"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      className="w-full bg-white/[0.06] border border-white/[0.1] rounded-2xl px-4 py-3.5 text-center text-2xl tracking-[0.5em] font-mono text-white placeholder-white/15 focus:outline-none focus:ring-2 focus:ring-[#29FE29]/25 focus:border-[#29FE29]/40 transition-all"
    />
  );
}

function GreenBtn({ busy, children }) {
  return (
    <button type="submit" disabled={busy}
      className="w-full bg-[#29FE29] hover:bg-[#22e622] active:scale-[0.97] text-[#0B1D33] text-sm font-bold py-3.5 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#29FE29]/20"
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
    >
      {busy && <Spinner dark />}
      {children}
    </button>
  );
}

function Spinner({ dark }) {
  const c = dark ? 'border-[#0B1D33]/30 border-t-[#0B1D33]' : 'border-white/30 border-t-white';
  return <div className={`w-4 h-4 rounded-full border-2 ${c} animate-spin`} />;
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick}
      className="text-xs text-white/25 hover:text-[#29FE29] transition-colors mt-2">
      ← Use a different email
    </button>
  );
}

function Msg({ text }) {
  const ok = text.startsWith('✅');
  return (
    <div className={`text-xs px-4 py-2.5 rounded-xl border leading-relaxed ${
      ok
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    }`}>
      {text}
    </div>
  );
}
