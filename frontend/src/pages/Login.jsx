import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase.js';

const ALLOWED_DOMAIN = 'applywizz.ai';
const HIDDEN_PASSWORD = 'Applywizz@2026';

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: 'easeOut' } },
});

const FEATURES = [
  {
    icon: '⚡',
    title: '5-second ordering',
    desc: 'Tap once. Your order is placed, tracked, and on its way.',
    color: '#FFDE59',
  },
  {
    icon: '📍',
    title: 'Live delivery tracking',
    desc: 'Watch your CCD Coffee move from machine to your desk in real time.',
    color: '#2C76FF',
  },
  {
    icon: '🍱',
    title: 'Meal booking',
    desc: 'Book veg, non-veg, or egg lunch the night before. No queues.',
    color: '#29FE29',
  },
  {
    icon: '🤖',
    title: 'AI-powered reminders',
    desc: "Your personal pantry AI nudges you when it's chai time.",
    color: '#FF6B6B',
  },
];

const STATS = [
  { value: '< 8 min', label: 'avg delivery' },
  { value: '4.8★',    label: 'satisfaction' },
  { value: '100%',    label: 'desk delivery' },
];

export default function Login() {
  const navigate = useNavigate();

  const [step,        setStep]        = useState('email');
  const [email,       setEmail]       = useState('');
  const [err,         setErr]         = useState('');
  const [busy,        setBusy]        = useState(false);
  const [qrCode,      setQrCode]      = useState('');
  const [factorId,    setFactorId]    = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [totpCode,    setTotpCode]    = useState('');

  const submitting = useRef(false);

  // ── Auth Logic (byte-for-byte identical to original) ────────
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

  const isFormStep = step === 'email' || step === 'verify' || step === 'enroll';

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
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-[0.06]"
             style={{ background: 'radial-gradient(circle, #29FE29, transparent 70%)' }} />
        <div className="absolute -bottom-60 -right-40 w-[700px] h-[700px] rounded-full opacity-[0.04]"
             style={{ background: 'radial-gradient(circle, #2C76FF, transparent 70%)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-[0.03]"
             style={{ background: 'radial-gradient(circle, #0f766e, transparent 70%)' }} />
      </div>

      {/* ── Header ── */}
      <motion.header
        className="relative z-10 px-6 sm:px-10 lg:px-16 py-5 flex items-center justify-between shrink-0"
        {...fade(0)}
      >
        {/* Logo — bigger, with company name beside it */}
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="ApplyWizz" className="h-10 sm:h-12 object-contain" />
          <div className="hidden sm:block">
            <p className="text-white/80 text-sm font-bold tracking-tight leading-tight"
               style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              ApplyWizz
            </p>
            <p className="text-white/30 text-[10px] tracking-widest uppercase">Office Pantry</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-[#29FE29] animate-pulse" />
          <span className="text-[11px] text-white/40 font-medium">Pantry Online</span>
        </div>
      </motion.header>

      {/* ── Main — two column on desktop ── */}
      <main className="relative z-10 flex-1 flex items-center">
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-8 lg:py-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

            {/* ── LEFT COLUMN — Content ── */}
            <div className="order-2 lg:order-1">

              {/* Badge */}
              <motion.div {...fade(0.1)}
                className="inline-flex items-center gap-2 bg-white/[0.06] border border-white/[0.08] text-[#29FE29] text-[11px] font-semibold px-4 py-1.5 rounded-full mb-6 tracking-wide uppercase"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#29FE29] animate-pulse" />
                Office Pantry · Applywizz HQ
              </motion.div>

              {/* Headline */}
              <motion.h1 {...fade(0.2)}
                className="text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold text-white leading-[1.08] tracking-tight mb-4"
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
                className="text-white/45 text-base sm:text-[17px] leading-relaxed mb-8 max-w-lg"
              >
                CCD Coffee, snacks, and daily meals — ordered in one tap,
                tracked live, delivered to your desk by the Office Boy.
              </motion.p>

              {/* Stats row */}
              <motion.div {...fade(0.35)} className="flex items-center gap-6 mb-10">
                {STATS.map(({ value, label }) => (
                  <div key={label} className="text-center">
                    <p className="text-xl sm:text-2xl font-extrabold text-white leading-none"
                       style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {value}
                    </p>
                    <p className="text-[11px] text-white/30 mt-1 uppercase tracking-wider">{label}</p>
                  </div>
                ))}
              </motion.div>

              {/* Feature cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FEATURES.map(({ icon, title, desc, color }, i) => (
                  <motion.div
                    key={title}
                    {...fade(0.4 + i * 0.08)}
                    className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4 hover:bg-white/[0.07] hover:border-white/[0.12] transition-all duration-300"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0 mt-0.5">{icon}</span>
                      <div>
                        <p className="text-white/85 text-sm font-semibold leading-tight mb-1"
                           style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          {title}
                        </p>
                        <p className="text-white/35 text-[12px] leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Built for line */}
              <motion.p {...fade(0.8)} className="mt-8 text-[11px] text-white/15 flex items-center gap-2">
                <span className="w-8 h-px bg-white/10" />
                Built with ❤️ for the people who build ApplyWizz
              </motion.p>
            </div>

            {/* ── RIGHT COLUMN — Auth Form ── */}
            <div className="order-1 lg:order-2 flex justify-center lg:justify-end">
              <div className="w-full max-w-[400px]">

                {/* Form card */}
                <motion.div
                  {...fade(0.2)}
                  className="bg-white/[0.04] border border-white/[0.09] rounded-3xl p-7 sm:p-8 backdrop-blur-sm"
                >
                  <AnimatePresence mode="wait">

                    {/* ═══ STEP: Email ═══ */}
                    {step === 'email' && (
                      <motion.div
                        key="email"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.15 } }}
                        className="space-y-5"
                      >
                        <div>
                          <h2 className="text-white text-xl font-bold mb-1"
                              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                            Sign in to Pantry
                          </h2>
                          <p className="text-white/35 text-sm">
                            Use your @applywizz.ai work email
                          </p>
                        </div>

                        <form onSubmit={submitEmail} className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-2"
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
                          </div>
                          {err && <Msg text={err} />}
                          <button type="submit" disabled={busy}
                            className="w-full bg-[#29FE29] hover:bg-[#22e622] active:scale-[0.97] text-[#0B1D33] text-sm font-bold py-3.5 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#29FE29]/20"
                            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                          >
                            {busy && <Spinner dark />}
                            {busy ? 'Checking…' : 'Continue →'}
                          </button>
                        </form>

                        <p className="text-[11px] text-white/15 text-center pt-1">
                          Secured with Microsoft Authenticator (MFA)
                        </p>

                        {/* Trust indicators */}
                        <div className="pt-2 border-t border-white/[0.06]">
                          <div className="flex items-center justify-center gap-4">
                            {['🔐 MFA secured', '☁️ Supabase auth', '🏢 Internal only'].map(label => (
                              <span key={label} className="text-[10px] text-white/20">{label}</span>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* ═══ STEP: Enroll ═══ */}
                    {step === 'enroll' && (
                      <motion.div
                        key="enroll"
                        className="space-y-4"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                      >
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#2C76FF]/15 border border-[#2C76FF]/20 grid place-items-center text-2xl">
                          📱
                        </div>
                        <div className="text-center">
                          <h2 className="text-xl font-bold text-white mb-1">Set up Authenticator</h2>
                          <p className="text-sm text-white/45 leading-relaxed">
                            Open <strong className="text-white/70">Microsoft Authenticator</strong> on your phone.
                            Tap <strong className="text-white/70">+</strong> → <strong className="text-white/70">Other account</strong> → Scan this QR
                          </p>
                        </div>

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

                    {/* ═══ STEP: Verify ═══ */}
                    {step === 'verify' && (
                      <motion.div
                        key="verify"
                        className="space-y-4"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                      >
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#29FE29]/10 border border-[#29FE29]/20 grid place-items-center text-2xl">
                          🔐
                        </div>
                        <div className="text-center">
                          <h2 className="text-xl font-bold text-white mb-1">Welcome back</h2>
                          <p className="text-sm text-white/45 leading-relaxed">
                            Enter the 6-digit code from{' '}
                            <strong className="text-white/70">Microsoft Authenticator</strong>
                            <br />
                            for <strong className="text-[#29FE29]">{email}</strong>
                          </p>
                        </div>

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
                        className="text-center space-y-3 py-8"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="w-12 h-12 mx-auto rounded-full border-2 border-[#29FE29] border-t-transparent animate-spin" />
                        <p className="text-sm text-white/40">Signing you in…</p>
                      </motion.div>
                    )}

                  </AnimatePresence>
                </motion.div>
              </div>
            </div>

          </div>
        </div>
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
