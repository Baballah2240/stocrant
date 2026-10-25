import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, mobileSession } from "./api";
import type { AuthUser } from "./types";

interface SessionContextValue {
  signedInThisSession: boolean;
  user: AuthUser | null;
  loading: boolean;
  setupRequired: boolean;
  error: string | null;
  signIn: (email: string, password: string,closeOtherSessions?:boolean) => Promise<void>;
  setup: (input: { name: string; email: string; password: string; setupKey: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null, loading: true, setupRequired: false, error: null, signedInThisSession: false,
  signIn: async () => {}, setup: async () => {}, signOut: async () => {}, refresh: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedInThisSession, setSignedInThisSession] = useState(false);
  const revision = useRef(0);
  const authOperation = useRef(0);
  const refreshing = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    if (refreshing.current) return refreshing.current;
    const requestRevision = ++revision.current;
    const operation = authOperation.current;
    setLoading(true);
    const task = (async () => {
    try {
      const status = await api.auth.status();
      if (requestRevision !== revision.current || operation !== authOperation.current) return;
      setUser(status.user);
      setSetupRequired(status.setupRequired);
      setError(null);
    } catch (err) {
      if (requestRevision !== revision.current || operation !== authOperation.current) return;
      setUser(null);
      setError(err instanceof Error ? err.message : "Unable to reach STOCRANT.");
    } finally {
      if (requestRevision === revision.current) setLoading(false);
    }
    })();
    refreshing.current = task;
    void task.finally(() => { if (refreshing.current === task) refreshing.current = null; });
    return task;
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const update = () => { void refresh(); };
    window.addEventListener("stocrant:session-changed", update);
    return () => window.removeEventListener("stocrant:session-changed", update);
  }, [refresh]);
  useEffect(()=>{
    if(!user)return;let active=true,checking=false;const operation=authOperation.current;
    const check=async()=>{if(document.hidden||checking)return;checking=true;try{const status=await api.auth.status();if(active&&operation===authOperation.current&&(!status.user||status.user.id!==user.id))await refresh();}catch{/* Retry on the next focus or interval when the connection returns. */}finally{checking=false;}};
    const timer=window.setInterval(()=>void check(),30_000);window.addEventListener("focus",check);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener("focus",check);};
  },[user?.id,refresh]);

  const signIn = useCallback(async (email: string, password: string,closeOtherSessions=false) => {
    const operation = ++authOperation.current;
    revision.current++;
    const response = await api.auth.login({ email, password,closeOtherSessions }).catch(error => { if (operation === authOperation.current) setLoading(false); throw error; });
    if (operation !== authOperation.current) return;
    revision.current++;
    mobileSession.save(response.sessionToken);
    setUser(response.user);
    setSignedInThisSession(true);
    setSetupRequired(false);
    setLoading(false);
  }, []);
  const setup = useCallback(async (input: { name: string; email: string; password: string; setupKey: string }) => {
    const operation = ++authOperation.current;
    revision.current++;
    const response = await api.auth.setup(input).catch(error => { if (operation === authOperation.current) setLoading(false); throw error; });
    if (operation !== authOperation.current) return;
    revision.current++;
    mobileSession.save(response.sessionToken);
    setUser(response.user);
    setSignedInThisSession(true);
    setSetupRequired(false);
    setLoading(false);
  }, []);
  const signOut = useCallback(async () => {
    const operation = ++authOperation.current;
    revision.current++;
    try {
      await api.auth.logout();
    } finally {
      if (operation !== authOperation.current) return;
      revision.current++;
      mobileSession.clear();
      setUser(null);
      setSignedInThisSession(false);
      setLoading(false);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, setupRequired, error, signIn, setup, signOut, refresh, signedInThisSession }), [user, loading, setupRequired, error, signIn, setup, signOut, refresh, signedInThisSession]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
