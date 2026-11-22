import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { user: me } = await auth.me();
        if (!active) return;
        setUser(me ?? null);
        setStatus('ready');
      } catch (err) {
        if (!active) return;
        setError(err.message);
        setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile: user, // one record serves as both identity and profile
      status,
      error,
      async signIn(email, password) {
        const { user: me } = await auth.signIn(email, password);
        setUser(me);
      },
      async signUp(email, password, displayName) {
        const { user: me } = await auth.signUp(email, password, displayName);
        setUser(me);
      },
      async signOut() {
        try {
          await auth.signOut();
        } finally {
          setUser(null);
        }
      },
      async updateProfile(patch) {
        const { user: me } = await auth.updateMe(patch);
        setUser(me);
      },
      // Called when the API reports the session is gone.
      sessionExpired() {
        setUser(null);
      },
    }),
    [user, status, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
