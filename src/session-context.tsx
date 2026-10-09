import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { AuthUser } from "./types";

interface SessionContextValue {
  user: AuthUser | null;
  loading: boolean;
  setupRequired: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  setup: (input: { name: string; email: string; password: string; setupKey: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null, loading: true, setupRequired: false, error: null,
  signIn: async () => {}, setup: async () => {}, signOut: async () => {}, refresh: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const status = await api.auth.status();
      setUser(status.user);
      setSetupRequired(status.setupRequired);
      setError(null);
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err.message : "Unable to reach STOCRANT.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await api.auth.login({ email, password });
    setUser(response.user);
    setSetupRequired(false);
  }, []);
  const setup = useCallback(async (input: { name: string; email: string; password: string; setupKey: string }) => {
    const response = await api.auth.setup(input);
    setUser(response.user);
    setSetupRequired(false);
  }, []);
  const signOut = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, setupRequired, error, signIn, setup, signOut, refresh }), [user, loading, setupRequired, error, signIn, setup, signOut, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}