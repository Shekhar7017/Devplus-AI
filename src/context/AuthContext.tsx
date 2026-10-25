import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, normalizeError } from '@/lib/api';
import type { AppUser } from '@/types';

interface AuthSession {
  user: AppUser;
}

interface AuthContextValue {
  session: AuthSession | null;
  user: AppUser | null;
  profile: AppUser | null;
  loading: boolean;
  error: string | null;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data } = await api.get<{ user: AppUser }>('/auth/me');
        setSession({ user: data.user });
        setProfile(data.user);
      } catch (requestError) {
        const apiError = normalizeError(requestError);
        if (apiError.status !== 401) {
          setError(apiError.detail ?? apiError.title);
        }
      } finally {
        setLoading(false);
      }
    };
    loadSession();
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      const { data } = await api.post<{ user: AppUser }>('/auth/register', {
        email,
        password,
        displayName: displayName ?? null,
      });
      setSession({ user: data.user });
      setProfile(data.user);
      setError(null);
    } catch (requestError) {
      const apiError = normalizeError(requestError);
      throw new Error(apiError.detail ?? apiError.title);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data } = await api.post<{ user: AppUser }>('/auth/login', { email, password });
      setSession({ user: data.user });
      setProfile(data.user);
      setError(null);
    } catch (requestError) {
      const apiError = normalizeError(requestError);
      throw new Error(apiError.detail ?? apiError.title);
    }
  };

  const signOut = async () => {
    await api.post('/auth/logout');
    setSession(null);
    setProfile(null);
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        error,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
