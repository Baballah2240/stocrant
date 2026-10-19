import ChoiceSelect from "./ChoiceSelect";
import { useState } from "react";
import { useAppLock, LOCK_MINUTES } from "../app-lock-context";
import { useSession } from "../session-context";
import { useLanguage } from "../language-context";
import { isNativeApp } from "../api";
export default function LockSettings() {
  const { preferences, available, setPreferences, lock, authenticateBiometric } = useAppLock();
  const { user, signIn } = useSession();
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function enable(event: React.FormEvent) {
    event.preventDefault(); if (!user) return;
    setBusy(true); setError("");
    try { await signIn(user.email, password); await authenticateBiometric(); setPreferences({ ...preferences, biometric: true }); setPassword(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not enable biometrics."); }
    finally { setBusy(false); }
  }
  return <section className="card app-lock-settings"><h2>{t("App lock")}</h2><p className="hint">{t("Hide your workspace when you step away. These preferences apply to your account on this device.")}</p>
    <label className="form-field"><span>{t("Lock after inactivity")}</span><ChoiceSelect value={preferences.minutes} onChange={event => setPreferences({ ...preferences, minutes: Number(event.target.value) })}>{LOCK_MINUTES.map(minutes => <option key={minutes} value={minutes}>{minutes} {minutes === 1 ? t("minute") : t("minutes")}</option>)}</ChoiceSelect></label>
    <p className="hint">{t("On the web, enter only your account password to unlock. You do not need to enter your email again.")}</p>
    {isNativeApp() && <><label className="check-field"><input type="checkbox" checked={preferences.background} onChange={event => setPreferences({ ...preferences, background: event.target.checked })} />{t("Lock when leaving the app")}</label><h3>{t("Biometric unlock")}</h3>{available ? preferences.biometric ? <><p className="hint">{t("Fingerprint / Face ID is enabled. Your password remains available.")}</p><button disabled={busy} onClick={() => setPreferences({ ...preferences, biometric: false })}>{t("Disable biometric unlock")}</button></> : <form className="form" onSubmit={enable}><label className="form-field"><span>{t("Current account password")}</span><input required type="password" autoComplete="current-password" disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /></label><button className="primary" disabled={busy}>{t("Enable fingerprint / Face ID")}</button></form> : <p className="hint">{t("Supported biometrics are not available or enrolled. Set up fingerprint or Face ID in your phone settings. Password lock is available.")}</p>}</>}
    {error && <p className="error" role="alert">{t(error)}</p>}<button className="app-lock-now" onClick={lock}>{t("Lock now")}</button>
  </section>;
}
