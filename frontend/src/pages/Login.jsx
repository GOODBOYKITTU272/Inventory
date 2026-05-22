import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase.js';

const ALLOWED_DOMAIN = 'applywizz.ai';
const HIDDEN_PASSWORD = 'Applywizz@2026';

/* ── Animation Variants ── */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const pillPop = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: (i) => ({
    opacity: 1, scale: 1,
    transition: { duration: 0.4, delay: 0.5 + i * 0.1, type: 'spring', stiffness: 200 },
  }),
};

/* ── Floating decorative shapes ── */
function FloatingElements() {
  const items = [
    { emoji: '☕', x: '12%', y: '18%', size: 'text-4xl', delay: 0 },
    { emoji: '🍵', x: '85%', y: '14%', size: 'text-3xl', delay: 0.5 },
    { emoji: '🥪', x: '8%',  y: '72%', size: 'text-3xl', delay: 1.0 },
    { emoji: '🍪', x: '88%', y: '68%', size: 'text-2xl', delay: 1.5 },
    { emoji: '🧃', x: '78%', y: '42%', size: 'text-2xl', delay: 0.8 },
    { emoji: '🍌', x: '18%', y: '48%', size: 'text-2xl', delay: 1.2 },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {items.map((item, i) => (
        <motion.span
          key={i}
          className={`absolute ${item.size} select-none`}
          style={{ left: item.x, top: item.y }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: 0.12,
            scale: 1,
            y: [0, -10, 0, 10, 0],
          }}
          transition={{
            opacity: { duration: 0.6, delay: item.delay },
            scale: { duration: 0.6, delay: item.delay },
            y: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay: item.delay },
          }}
        >
          {item.emoji}
        </motion.span>
      ))}
    </div>
  );
}

/* ── Glowing orb background ── */
function GlowOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#29FE29]/[0.04] blur-[100px]" />
      <div className="absolute -bottom-48 -right-32 w-[500px] h-[500px] rounded-full bg-[#2C76FF]/[0.06] blur-[120px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-[#FFDE59]/[0.03] blur-[80px]" />
    </div>
  );
}

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

  // ── Step 1: Enter email ──
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

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#0B1D33] flex flex-col relative overflow-hidden"
         style={{ fontFamily: "'Noto Sans', 'Inter', system-ui, sans-serif" }}>

      <GlowOrbs />
      <FloatingElements />

      {/* ── Header ── */}
      <motion.header
        className="relative z-10 px-6 sm:px-8 py-5 flex items-center justify-between"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="ApplyWizz" className="h-10 w-10 rounded-xl shadow-lg shadow-black/20" />
          <span className="font-bold text-white/90 text-[15px] tracking-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            APPLY WIZZ
            <span className="block text-[10px] font-medium text-white/40 tracking-widest -mt-0.5">PANTRY</span>
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-white/30 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#29FE29] animate-pulse" />
          Pantry Online
        </div>
      </motion.header>

      {/* ── Main Content ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <AnimatePresence mode="wait">

          {/* ═══ STEP: Email ═══ */}
          {step === 'email' && (
            <motion.div
              key="email-step"
              className="w-full max-w-md"
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -20, transition: { duration: 0.3 } }}
              variants={stagger}
            >
              {/* Badge */}
              <motion.div variants={fadeUp} custom={0}
                className="inline-flex items-center gap-2 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] text-[#29FE29] text-xs font-semibold px-4 py-1.5 rounded-full mb-8 tracking-wide uppercase"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#29FE29] animate-pulse" />
                Office Pantry
              </motion.div>

              {/* Headline */}
              <motion.h1 variants={fadeUp} custom={1}
                className="text-[2.8rem] sm:text-[3.5rem] font-extrabold text-white leading-[1.05] tracking-tight"
              >
                Skip the queue.
                <br />
                <span className="relative inline-block">
                  <span className="relative z-10">Not the</span>
                </span>{' '}
                <span className="relative inline-block">
                  <span className="text-[#29FE29] relative z-10"
                        style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic' }}>
                    snack.
                  </span>
                  {/* Underline glow */}
                  <span className="absolute -bottom-1 left-0 right-0 h-[3px] bg-[#29FE29]/40 rounded-full blur-[2px]" />
                </span>
              </motion.h1>

              {/* Subheadline */}
              <motion.p variants={fadeUp} custom={2}
                className="mt-5 text-white/50 text-[15px] sm:text-base max-w-sm mx-auto leading-relaxed"
              >
                One tap. Live tracking. Delivered to your desk.
                <br className="hidden sm:block" />
                {' '}The smartest pantry your office ever had.
              </motion.p>

              {/* Feature pills */}
              <motion.div className="mt-7 flex flex-wrap justify-center gap-2.5"
                initial="hidden" animate="visible"
              >
                {[
                  { icon: '⚡', label: '5-sec ordering', color: '#FFDE59' },
                  { icon: '📍', label: 'Live tracking',  color: '#2C76FF' },
                  { icon: '🍱', label: 'Meal booking',   color: '#29FE29' },
                ].map(({ icon, label, color }, i) => (
                  <motion.span
                    key={label}
                    variants={pillPop}
                    custom={i}
                    className="inline-flex items-center gap-1.5 bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] text-white/70 text-xs font-medium px-3.5 py-2 rounded-full select-none hover:bg-white/[0.1] transition-colors"
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                    <span className="w-1 h-1 rounded-full" style={{ backgroundColor: color }} />
                  </motion.span>
                ))}
              </motion.div>

              {/* Login Form */}
              <motion.form
                variants={fadeUp} custom={4}
                onSubmit={submitEmail}
                className="mt-10 w-full max-w-xs mx-auto space-y-3 text-left"
              >
                <label className="block text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-1"
                       style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Work email
                </label>
                <div className="relative">
                  <input
                    type="email" required autoFocus autoComplete="email"
                    placeholder={`you@${ALLOWED_DOMAIN}`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/[0.07] backdrop-blur-sm border border-white/[0.12] rounded-2xl px-4 py-3.5 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-[#29FE29]/30 focus:border-[#29FE29]/50 transition-all"
                  />
                </div>
                {err && <Msg text={err} />}
                <button type="submit" disabled={busy}
                  className="w-full bg-[#29FE29] hover:bg-[#24E025] active:scale-[0.97] text-[#0B1D33] text-sm font-bold py-3.5 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#29FE29]/20"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {busy && <div className="w-4 h-4 rounded-full border-2 border-[#0B1D33]/30 border-t-[#0B1D33] animate-spin" />}
                  {busy ? 'Checking…' : 'Continue →'}
                </button>
                <p className="text-[11px] text-white/20 text-center pt-1">
                  Sign in with your @applywizz.ai email + Microsoft Authenticator
                </p>
              </motion.form>
            </motion.div>
          )}

          {/* ═══ STEP: Enroll (first time — scan QR code) ═══ */}
          {step === 'enroll' && (
            <motion.div
              key="enroll-step"
              className="w-full max-w-sm space-y-5 text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#2C76FF]/15 border border-[#2C76FF]/20 text-3xl mb-2">
                📱
              </div>
              <h2 className="text-2xl font-bold text-white">
                Set up Authenticator
              </h2>
              <p className="text-sm text-white/50 leading-relaxed">
                Open <strong className="text-white/70">Microsoft Authenticator</strong> on your phone
                <br />
                Tap <strong className="text-white/70">+</strong> → <strong className="text-white/70">Other account</strong> → Scan this QR
              </p>

              {qrCode && (
                <motion.div
                  className="flex justify-center"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <div className="bg-white rounded-2xl p-4 inline-block shadow-xl shadow-black/20">
                    <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                  </div>
                </motion.div>
              )}

              <form onSubmit={submitCode} className="space-y-3 text-left">
                <label className="block text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-1"
                       style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Enter the 6-digit code
                </label>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  maxLength={6} required autoFocus autoComplete="one-time-code"
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full bg-white/[0.07] backdrop-blur-sm border border-white/[0.12] rounded-2xl px-4 py-3.5 text-center text-2xl tracking-[0.5em] font-mono text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-[#29FE29]/30 focus:border-[#29FE29]/50 transition-all"
                />
                {err && <Msg text={err} />}
                <button type="submit" disabled={busy}
                  className="w-full bg-[#29FE29] hover:bg-[#24E025] active:scale-[0.97] text-[#0B1D33] text-sm font-bold py-3.5 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#29FE29]/20"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {busy && <div className="w-4 h-4 rounded-full border-2 border-[#0B1D33]/30 border-t-[#0B1D33] animate-spin" />}
                  {busy ? 'Verifying…' : 'Verify & Continue →'}
                </button>
              </form>

              <button
                onClick={() => { setStep('email'); setErr(''); setTotpCode(''); submitting.current = false; supabase.auth.signOut(); }}
                className="text-xs text-white/30 hover:text-[#29FE29] transition-colors mt-2"
              >
                ← Use a different email
              </button>
            </motion.div>
          )}

          {/* ═══ STEP: Verify (returning user — enter code) ═══ */}
          {step === 'verify' && (
            <motion.div
              key="verify-step"
              className="w-full max-w-sm space-y-5 text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#29FE29]/10 border border-[#29FE29]/20 text-3xl mb-2">
                🔐
              </div>
              <h2 className="text-2xl font-bold text-white">
                Welcome back
              </h2>
              <p className="text-sm text-white/50 leading-relaxed">
                Enter the 6-digit code from <strong className="text-white/70">Microsoft Authenticator</strong>
                <br />
                for <strong className="text-[#29FE29]/80">{email}</strong>
              </p>

              <form onSubmit={submitCode} className="space-y-3 text-left">
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  maxLength={6} required autoFocus autoComplete="one-time-code"
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full bg-white/[0.07] backdrop-blur-sm border border-white/[0.12] rounded-2xl px-4 py-3.5 text-center text-2xl tracking-[0.5em] font-mono text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-[#29FE29]/30 focus:border-[#29FE29]/50 transition-all"
                />
                {err && <Msg text={err} />}
                <button type="submit" disabled={busy}
                  className="w-full bg-[#29FE29] hover:bg-[#24E025] active:scale-[0.97] text-[#0B1D33] text-sm font-bold py-3.5 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#29FE29]/20"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {busy && <div className="w-4 h-4 rounded-full border-2 border-[#0B1D33]/30 border-t-[#0B1D33] animate-spin" />}
                  {busy ? 'Verifying…' : 'Sign in →'}
                </button>
              </form>

              <button
                onClick={() => { setStep('email'); setErr(''); setTotpCode(''); submitting.current = false; supabase.auth.signOut(); }}
                className="text-xs text-white/30 hover:text-[#29FE29] transition-colors mt-2"
              >
                ← Use a different email
              </button>
            </motion.div>
          )}

          {/* ═══ STEP: Done ═══ */}
          {step === 'done' && (
            <motion.div
              key="done-step"
              className="text-center space-y-4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <motion.div
                className="w-16 h-16 mx-auto rounded-full bg-[#29FE29]/15 border-2 border-[#29FE29]/30 grid place-items-center"
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              >
                <div className="w-6 h-6 rounded-full border-2 border-[#29FE29] border-t-transparent animate-spin" />
              </motion.div>
              <p className="text-sm text-white/50">Signing you in…</p>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ── Footer ── */}
      <motion.footer
        className="relative z-10 px-8 py-5 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
      >
        <p className="text-[11px] text-white/15">
          Built with ❤️ for the people who build ApplyWizz
        </p>
      </motion.footer>
    </div>
  );
}

/* ── Shared UI ── */
function Msg({ text }) {
  const ok = text.startsWith('✅');
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-xs px-4 py-2.5 rounded-xl border leading-relaxed backdrop-blur-sm ${
        ok
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
      }`}
    >
      {text}
    </motion.div>
  );
}
