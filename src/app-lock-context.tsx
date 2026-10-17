import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { App as NativeApp } from "@capacitor/app";
import { AndroidBiometryStrength, BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { api, isNativeApp } from "./api";
import { useSession } from "./session-context";
import { useLanguage } from "./language-context";
import { inactivityExpired } from "./app-lock-timer";

export const LOCK_MINUTES = [1, 2, 5, 10, 15, 30, 60];
type LockPreferences = { minutes: number; biometric: boolean; background: boolean };
const defaults: LockPreferences = { minutes: 5, biometric: false, background: true };
function loadPreferences(key: string): LockPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return { minutes: LOCK_MINUTES.includes(value?.minutes) ? value.minutes : 5, biometric: value?.biometric === true, background: value?.background !== false };
  } catch { return defaults; }
}
const Context = createContext({ preferences: defaults, available: false, setPreferences: (_value: LockPreferences) => {}, lock: () => {}, authenticateBiometric: async () => {} });

export function AppLockProvider({ children }: { children: ReactNode }) {
  const { user, loading, signedInThisSession, signIn, signOut, refresh } = useSession();
  const { language } = useLanguage();
  const [accountId, setAccountId] = useState("");
  const [preferences, setPreferencesState] = useState(defaults);
  const [locked, setLocked] = useState(true);
  const [available, setAvailable] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastActivity = useRef(Date.now());
  const authenticating = useRef(false);
  const biometricAttempted = useRef(false);
  const [foreground, setForeground] = useState(true);
  const key = user ? `stocrant.lock.${user.id}` : "";
  const signalKey = user ? `stocrant.lock.signal.${user.id}` : "";
  useEffect(() => {
    if (!user) { setAccountId(""); setLocked(true); setPassword(""); setError(""); return; }
    if (user.id === accountId) return;
    setPreferencesState(loadPreferences(key)); setAccountId(user.id);
    setLocked(!signedInThisSession); lastActivity.current = Date.now();
    setPassword(""); setError("");
  }, [user, accountId, key, signedInThisSession]);
  useEffect(() => {
    if (!isNativeApp()) return;
    let active = true;
    void BiometricAuth.checkBiometry().then(result => { if (active) setAvailable(result.strongBiometryIsAvailable); }).catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, [user?.id]);
  const lock = useCallback(() => {
    if (!user) return;
    setLocked(true); setPassword(""); setError("");
    try { localStorage.setItem(signalKey, String(Date.now())); } catch { /* Lock remains active in this window. */ }
  }, [user, signalKey]);
  const setPreferences = (value: LockPreferences) => {
    if (!LOCK_MINUTES.includes(value.minutes)) return;
    const next = { ...value, biometric: isNativeApp() && available && value.biometric };
    setPreferencesState(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Use the preference for this session. */ }
  };
  useEffect(() => {
    if (!user || accountId !== user.id) return;
    const check = () => { if (!locked && inactivityExpired(lastActivity.current, Date.now(), preferences.minutes)) lock(); };
    const activity = (event: Event) => {
      if (locked) return;
      // Check elapsed time before accepting a wake-up click as activity.
      if (inactivityExpired(lastActivity.current, Date.now(), preferences.minutes)) { event.stopImmediatePropagation(); if (event.cancelable) event.preventDefault(); lock(); return; }
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];
    events.forEach(event => window.addEventListener(event, activity, { capture: true }));
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, 1000);
    const storage = (event: StorageEvent) => {
      if (event.key === signalKey) { setLocked(true); setPassword(""); }
      if (event.key === key) setPreferencesState(loadPreferences(key));
    };
    window.addEventListener("storage", storage);
    return () => { events.forEach(event => window.removeEventListener(event, activity, true)); document.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); window.removeEventListener("storage", storage); window.clearInterval(timer); };
  }, [user, accountId, locked, preferences.minutes, key, signalKey, lock]);
  useEffect(() => {
    if (!isNativeApp() || !user) return;
    let disposed = false;
    const handle = NativeApp.addListener("appStateChange", state => {
      setForeground(state.isActive);
      if (state.isActive) void BiometricAuth.checkBiometry().then(result => { if (!disposed) setAvailable(result.strongBiometryIsAvailable); }).catch(() => { if (!disposed) setAvailable(false); });
      if (!state.isActive && preferences.background && !authenticating.current) lock();
      if (state.isActive && !authenticating.current && inactivityExpired(lastActivity.current, Date.now(), preferences.minutes)) lock();
    });
    void handle.then(listener => { if (disposed) void listener.remove(); });
    return () => { disposed = true; void handle.then(listener => listener.remove()); };
  }, [user, preferences.background, preferences.minutes, lock]);
  const authenticateBiometric = async () => {
    if (authenticating.current) throw new Error("Biometric authentication is already in progress.");
    if (!isNativeApp()) throw new Error("Biometric unlock is available in the mobile app only.");
    const result = await BiometricAuth.checkBiometry();
    if (!result.strongBiometryIsAvailable) throw new Error(language === "ar" ? "ÙØ¹Ù‘Ù„ Ø§Ù„Ø¨ØµÙ…Ø© Ø£Ùˆ Face ID ÙÙŠ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù‡Ø§ØªÙ Ø£ÙˆÙ„Ø§Ù‹." : "Set up fingerprint or Face ID in your phone settings first.");
    authenticating.current = true;
    try { await BiometricAuth.authenticate({ reason: language === "ar" ? "ÙØªØ­ ØªØ·Ø¨ÙŠÙ‚ Ø³ØªÙˆÙƒØ±Ø§Ù†Øª" : "Unlock your STOCRANT workspace", androidTitle: "STOCRANT", androidBiometryStrength: AndroidBiometryStrength.strong, allowDeviceCredential: false, cancelTitle: language === "ar" ? "Ø¥Ù„ØºØ§Ø¡" : "Cancel" }); }
    finally { authenticating.current = false; }
  };
  async function unlockPassword(event: React.FormEvent) {
    event.preventDefault(); if (!user) return;
    setBusy(true); setError("");
    try { await signIn(user.email, password); lastActivity.current = Date.now(); setLocked(false); setPassword(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not unlock."); }
    finally { setBusy(false); }
  }
  async function unlockBiometric() {
    if (!preferences.biometric || busy) return;
    setBusy(true); setError("");
    try {
      await authenticateBiometric();
      const status = await api.auth.status();
      if (status.user?.id !== user?.id) { await refresh(); throw new Error(language === "ar" ? "Ø§Ù†ØªÙ‡Øª Ø§Ù„Ø¬Ù„Ø³Ø©. Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù…Ø¬Ø¯Ø¯Ø§Ù‹." : "Your session expired. Sign in again."); }
      await refresh();
      lastActivity.current = Date.now(); setLocked(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Biometric unlock was canceled. Use your password."); }
    finally { setBusy(false); }
  }
  const biometricUnlockRef = useRef(unlockBiometric);
  biometricUnlockRef.current = unlockBiometric;
  useEffect(() => {
    if (!locked || !user) { biometricAttempted.current = false; return; }
    if (accountId !== user.id || loading || !foreground || !isNativeApp() || !preferences.biometric || !available || busy || biometricAttempted.current) return;
    // Prompt once per lock; cancellation leaves password and manual retry available.
    biometricAttempted.current = true;
    void biometricUnlockRef.current();
  }, [locked, user?.id, accountId, loading, foreground, preferences.biometric, available, busy]);
  const value = { preferences, available, setPreferences, lock, authenticateBiometric };
  if (user && accountId !== user.id) return <main className="app-lock-screen" aria-busy="true" />;
  return <Context.Provider value={value}>{user && locked ? <main className="app-lock-screen"><section className="app-lock-card" aria-labelledby="app-lock-title">
    <svg className="app-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>
    <p className="eyebrow">STOCRANT</p><h1 id="app-lock-title">{language === "ar" ? "Ù…Ø³Ø§Ø­Ø© Ø§Ù„Ø¹Ù…Ù„ Ù…Ù‚ÙÙ„Ø©" : "Workspace locked"}</h1><p>{user.name}</p><p className="hint">{language === "ar" ? "Ø£Ø¯Ø®Ù„ ÙƒÙ„Ù…Ø© Ù…Ø±ÙˆØ± Ø­Ø³Ø§Ø¨Ùƒ Ù„Ù„Ù…ØªØ§Ø¨Ø¹Ø©." : "Enter your account password to continue."}</p>
    <form className="form" onSubmit={unlockPassword}><label className="form-field"><span>{language === "ar" ? "ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±" : "Password"}</span><input autoFocus required type="password" autoComplete="current-password" disabled={busy} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{language === "ar" ? busy ? "Ø¬Ø§Ø±Ù Ø§Ù„ÙØªØ­â€¦" : "ÙØªØ­" : busy ? "Unlockingâ€¦" : "Unlock"}</button></form>
    {isNativeApp() && preferences.biometric && available && <button className="app-lock-biometric" disabled={busy} onClick={() => void unlockBiometric()}>{language === "ar" ? "Ø§Ù„ÙØªØ­ Ø¨Ø§Ù„Ø¨ØµÙ…Ø© Ø£Ùˆ Face ID" : "Unlock with fingerprint / Face ID"}</button>}
    <button className="app-lock-signout" disabled={busy} onClick={() => void signOut()}>{language === "ar" ? "ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬" : "Sign out"}</button>
  </section></main> : loading && user ? <main className="app-lock-screen" aria-busy="true" /> : children}</Context.Provider>;
}
export const useAppLock = () => useContext(Context);
