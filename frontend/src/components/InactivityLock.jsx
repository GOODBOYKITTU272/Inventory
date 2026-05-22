import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock } from 'lucide-react';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export default function InactivityLock({ children, userName }) {
  const [locked, setLocked] = useState(false);
  const timerRef = useRef(null);

  const resetTimer = useCallback(() => {
    if (locked) return; // Don't reset while locked
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLocked(true), INACTIVITY_TIMEOUT);
  }, [locked]);

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer(); // Start timer on mount

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  function unlock() {
    setLocked(false);
    resetTimer();
  }

  return (
    <>
      {children}
      <AnimatePresence>
        {locked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-slate-900/95 backdrop-blur-md flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="text-center space-y-6 px-8"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-7xl"
              >
                <Lock className="mx-auto text-white/80" size={64} />
              </motion.div>

              <div>
                <h2 className="text-2xl font-bold text-white">Screen Locked</h2>
                <p className="text-white/60 mt-2 text-sm">
                  {userName ? `Hey ${userName}, you` : 'You'} were away for 15 minutes.
                </p>
              </div>

              <button
                onClick={unlock}
                className="bg-brand hover:bg-brand/90 text-white font-bold py-4 px-10 rounded-2xl text-base flex items-center gap-2 mx-auto transition-all active:scale-95 shadow-lg shadow-brand/30"
              >
                <Unlock size={18} /> Tap to Unlock
              </button>

              <p className="text-white/30 text-[10px]">
                Your session is still active. No need to re-login.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
