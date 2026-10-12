import { useState } from "react";
import { useAppLock, LOCK_MINUTES } from "../app-lock-context";
import { useSession } from "../session-context";
import { useLanguage } from "../language-context";
import { isNativeApp } from "../api";
export default function LockSettings() {
  const { preferences, available, setPreferences, lock, authenticateBiometric } = useAppLock();
  const { user, signIn } = useSession();
  const { language } = useLanguage();
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
  return <section className="card app-lock-settings"><h2>{language === "ar" ? "قفل التطبيق" : "App lock"}</h2><p className="hint">{language === "ar" ? "يُخفي القفل مساحة العمل على هذا الجهاز. إعدادات مستقلة لكل حساب." : "Hide your workspace when you step away. These preferences apply to your account on this device."}</p>
    <label className="form-field"><span>{language === "ar" ? "القفل بعد عدم النشاط" : "Lock after inactivity"}</span><select value={preferences.minutes} onChange={event => setPreferences({ ...preferences, minutes: Number(event.target.value) })}>{LOCK_MINUTES.map(minutes => <option key={minutes} value={minutes}>{minutes} {language === "ar" ? "دقيقة" : minutes === 1 ? "minute" : "minutes"}</option>)}</select></label>
    <p className="hint">{language === "ar" ? "على الويب، تفتح مساحة العمل بكلمة المرور فقط دون إدخال البريد مجدداً." : "On the web, enter only your account password to unlock. You do not need to enter your email again."}</p>
    {isNativeApp() && <><label className="check-field"><input type="checkbox" checked={preferences.background} onChange={event => setPreferences({ ...preferences, background: event.target.checked })} />{language === "ar" ? "القفل عند مغادرة التطبيق" : "Lock when leaving the app"}</label><h3>{language === "ar" ? "الفتح بالبصمة" : "Biometric unlock"}</h3>{available ? preferences.biometric ? <><p className="hint">{language === "ar" ? "البصمة أو Face ID مفعّلة. كلمة المرور متاحة دائماً." : "Fingerprint / Face ID is enabled. Your password remains available."}</p><button disabled={busy} onClick={() => setPreferences({ ...preferences, biometric: false })}>{language === "ar" ? "إيقاف الفتح بالبصمة" : "Disable biometric unlock"}</button></> : <form className="form" onSubmit={enable}><label className="form-field"><span>{language === "ar" ? "كلمة المرور الحالية" : "Current account password"}</span><input required type="password" autoComplete="current-password" disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /></label><button className="primary" disabled={busy}>{language === "ar" ? "تفعيل البصمة أو Face ID" : "Enable fingerprint / Face ID"}</button></form> : <p className="hint">{language === "ar" ? "البصمة القوية غير متاحة. فعّل البصمة في إعدادات هاتفك. القفل بكلمة المرور متاح." : "Supported biometrics are not available or enrolled. Set up fingerprint or Face ID in your phone settings. Password lock is available."}</p>}</>}
    {error && <p className="error" role="alert">{error}</p>}<button className="app-lock-now" onClick={lock}>{language === "ar" ? "قفل الآن" : "Lock now"}</button>
  </section>;
}
