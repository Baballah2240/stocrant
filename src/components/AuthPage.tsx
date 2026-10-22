import { isAndroidDevice, openDeviceWebsite } from "../device-actions";
import AppearanceSelector from "./AppearanceSelector";
import { useState } from "react";
import { api, serverUrl } from "../api";
import { useSession } from "../session-context";
import { useLanguage } from "../language-context";
import MobileIcon from "./MobileIcon";

export default function AuthPage() {
  const { language, setLanguage, t } = useLanguage();
  const { setupRequired, signIn, setup } = useSession();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const registering = !setupRequired && mode === "register";
  const forgot = !setupRequired && mode === "forgot";
  const newAccount = setupRequired || registering;
  function changeMode(next: typeof mode) { setMode(next); setError(""); setNotice(""); setPassword(""); setConfirmPassword(""); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (newAccount && password !== confirmPassword) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      if (setupRequired) await setup({ name, email, password, setupKey });
      else if (registering) { const result = await api.auth.register({ name, email, password }); setNotice(result.message); setMode("login"); setPassword(""); setConfirmPassword(""); }
      else if (forgot) setNotice((await api.auth.forgotPassword(email)).message);
      else await signIn(email, password);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to continue."); }
    finally { setBusy(false); }
  }
  const websiteUrl = import.meta.env.VITE_PUBLIC_WEBSITE_URL?.trim() || `${serverUrl.current()}/website/`;
  const heading = setupRequired ? "Set up your workspace" : registering ? "Request an account" : forgot ? "Reset your password" : "Welcome back";
  const description = registering ? "Your Main Admin reviews each request. Sign in afterwards to check your status and messages." : forgot ? "Send a reset request to your Main Admin." : setupRequired ? "Create your first Main Admin account." : "Sign in to your company workspace.";
  const submitLabel = busy ? "Please wait…" : setupRequired ? "Create Main Admin" : registering ? "Send registration request" : forgot ? "Send reset request" : "Sign in";
  return <div className="auth-experience auth-refined">
    <header className="auth-page-nav"><div className="auth-brand-links"><a href="/" className="auth-home-link">{t("STOCRANT")}</a><a className="auth-website-link" href={websiteUrl} onClick={event => { if (isAndroidDevice()) { event.preventDefault(); void openDeviceWebsite(websiteUrl).catch(err => setError((err as Error).message)); } }} target="_blank" rel="noopener noreferrer"><MobileIcon name="info" /><span>{t("STOCRANT website")}</span><span aria-hidden="true">&#8599;</span></a></div><div className="auth-appearance"><button type="button" lang={language === "en" ? "ar" : "en"} dir={language === "en" ? "rtl" : "ltr"} aria-label={t(language === "en" ? "Switch to Arabic" : "Switch to English")} onClick={() => setLanguage(language === "en" ? "ar" : "en")}>{language === "en" ? "العربية" : t("English")}</button><AppearanceSelector /></div></header>
    <main className="auth-page"><aside className="auth-welcome"><p className="eyebrow">{t("STOCRANT")}</p><h2>{t("Your workday starts here.")}</h2><p className="auth-welcome-intro">{t("A shared home for your team, daily work and company records.")}</p></aside>
      <section className="auth-card" aria-labelledby="auth-heading">
        <div className="auth-brand"><span className="brand-logo" aria-hidden="true"><MobileIcon name="work" /></span><div><strong>{t("STOCRANT")}</strong><span>{t("Your workspace")}</span></div></div>
        {!setupRequired && <div className="auth-entry-tabs" role="group" aria-label={t("Account access")}><button type="button" disabled={busy} aria-pressed={mode !== "register"} onClick={() => changeMode("login")}>{t("Sign in")}</button><button type="button" disabled={busy} aria-pressed={registering} onClick={() => changeMode("register")}>{t("Register")}</button></div>}
        <h1 id="auth-heading">{t(heading)}</h1><p className="hint">{t(description)}</p>
        {error && <p id="auth-error" className="error" role="alert">{t(error)}</p>}{notice && <p className="alert alert--good" role="status">{t(notice)}</p>}
        <form className="form" onSubmit={submit} aria-describedby={error ? "auth-error" : undefined}>
          {newAccount && <label className="form-field"><span>{t("Full name")}</span><input required minLength={2} maxLength={120} autoComplete="name" disabled={busy} value={name} onChange={event => setName(event.target.value)} /></label>}
          <label className="form-field"><span>{t(!setupRequired && !registering && !forgot ? "Email or username" : "Email")}</span><input required type={!setupRequired && !registering && !forgot ? "text" : "email"} dir="ltr" autoComplete={!setupRequired && !registering && !forgot ? "username" : "email"} autoCapitalize="none" spellCheck={false} disabled={busy} value={email} onChange={event => setEmail(event.target.value)} /></label>
          {!forgot && <label className="form-field"><span>{t("Password")}</span><div className="auth-password-field"><input required type={showPassword ? "text" : "password"} autoComplete={newAccount ? "new-password" : "current-password"} minLength={newAccount ? 12 : 1} maxLength={256} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /><button type="button" aria-label={t(showPassword ? "Hide password" : "Show password")} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{t(showPassword ? "Hide" : "Show")}</button></div>{newAccount && <small>{t("Use at least 12 characters.")}</small>}</label>}
          {newAccount && <label className="form-field"><span>{t("Confirm password")}</span><input required type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={256} disabled={busy} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>}
          {setupRequired && <label className="form-field"><span>{t("Setup key")}</span><input required type="password" autoComplete="off" disabled={busy} value={setupKey} onChange={event => setSetupKey(event.target.value)} /></label>}
          <button className="primary" type="submit" disabled={busy}>{t(submitLabel)}</button>
        </form>
        {!setupRequired && <button type="button" className="auth-recovery-link" disabled={busy} onClick={() => changeMode(forgot ? "login" : "forgot")}>{t(forgot ? "Back to sign in" : "Forgot password")}</button>}
      </section>
    </main>
  </div>;
}