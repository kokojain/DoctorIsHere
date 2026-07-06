import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from './supabase';
import type { Doctor, Profile } from './types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  doctor: Doctor | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  doctor: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setDoctor(null);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    (async () => {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('id, role, full_name, phone')
        .eq('id', userId)
        .single();
      if (cancelled) return;
      setProfile(profileRow);
      if (profileRow?.role === 'doctor') {
        const { data: doctorRow } = await supabase
          .from('doctors')
          .select('id, profile_id, specialty, verified')
          .eq('profile_id', userId)
          .single();
        if (!cancelled) setDoctor(doctorRow);
      } else {
        setDoctor(null);
      }
      if (!cancelled) setProfileLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const loading = !sessionLoaded || (!!userId && (profileLoading || !profile));

  return (
    <AuthContext.Provider value={{ session, profile, doctor, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
