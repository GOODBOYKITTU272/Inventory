import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { isPushSupported, subscribeToPush } from '../lib/push.js';

/** Silently subscribe to push notifications after AAL2 login.
 *  Never throws — a failed subscription must never block the login flow. */
async function tryAutoSubscribePush(session) {
  try {
    if (!isPushSupported()) return;
    if (Notification.permission === 'denied') return;
    await subscribeToPush(session.access_token);
  } catch (_) {
    // Silently ignore — user may not have granted permission yet
  }
}

/** Try to read AAL from the JWT's aal claim directly (no network call) */
function readAalFromSession(session) {
  try {
    const token = session?.access_token;
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.aal || null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aal,     setAal]     = useState('aal1');
  const bootstrapped = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // Safety timeout — never stay loading forever
    const safetyTimer = setTimeout(() => {
      if (!bootstrapped.current && !cancelled) {
        console.warn('[useAuth] Safety timeout — forcing loading=false after 6s');
        bootstrapped.current = true;
        setLoading(false);
      }
    }, 6000);

    async function checkAal(sess) {
      // Read AAL from JWT instantly (no network call)
      const jwtAal = readAalFromSession(sess);
      if (jwtAal) {
        console.log('[useAuth] AAL from JWT:', jwtAal);
        if (!cancelled) setAal(jwtAal);
        return;
      }

      // Fallback: ask Supabase API
      try {
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        console.log('[useAuth] AAL from API:', aalData?.currentLevel);
        if (!cancelled && aalData) {
          setAal(aalData.currentLevel || 'aal1');
        }
      } catch (e) {
        console.warn('[useAuth] MFA AAL check failed:', e.message);
        if (!cancelled) setAal('aal1');
      }
    }

    async function bootstrap() {
      console.log('[useAuth] bootstrap start');
      try {
        const { data, error } = await supabase.auth.getSession();
        console.log('[useAuth] getSession done, session?', !!data?.session, error?.message || '');
        if (cancelled) return;

        const sess = data?.session || null;
        setSession(sess);

        if (sess) {
          console.log('[useAuth] session exists, checking AAL + profile');
          await checkAal(sess);
          await loadProfile(sess.user.id);
        }
      } catch (e) {
        console.error('[useAuth] bootstrap error:', e);
      } finally {
        bootstrapped.current = true;
        if (!cancelled) {
          console.log('[useAuth] setting loading=false');
          setLoading(false);
        }
      }
    }

    async function loadProfile(userId) {
      for (let i = 0; i < 3; i++) {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, preferred_name, role, email')
          .eq('id', userId)
          .maybeSingle();
        if (data) {
          if (!cancelled) setProfile(data);
          return;
        }
        if (i < 2) await new Promise(r => setTimeout(r, 1200));
      }
      // No profile after retries — auto-create as staff
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: created } = await supabase
            .from('profiles')
            .insert({
              id:        userId,
              full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'New User',
              role:      'staff',
              email:     user.email,
            })
            .select()
            .single();
          if (created && !cancelled) { setProfile(created); return; }
        }
      } catch (_) {}
      if (!cancelled) setProfile(null);
    }

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      console.log('[useAuth] onAuthStateChange:', _event, !!newSession);
      if (newSession) {
        // Read AAL BEFORE setting session to avoid race condition
        // where Protected sees session + stale aal1 and bounces to /login
        const jwtAal = readAalFromSession(newSession);
        if (jwtAal) setAal(jwtAal);
        setSession(newSession);
        if (!jwtAal) await checkAal(newSession);
        loadProfile(newSession.user.id);
        // Auto-subscribe push notifications for any signed-in session (silently,
        // never blocks). Login is passwordless email link, so sessions are AAL1.
        tryAutoSubscribePush(newSession);
      } else {
        setSession(null);
        setProfile(null);
        setAal('aal1');
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, profile, loading, aal };
}
