import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    }

    async function loadProfile(userId) {
      // Retry up to 3 times — the DB trigger may take a moment to create the profile
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
      // No profile after retries — auto-create as staff (first-time @applywizz.ai login)
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) loadProfile(newSession.user.id);
      else setProfile(null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, profile, loading };
}
