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
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', userId)
        .single();
      if (!cancelled) setProfile(data);
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
