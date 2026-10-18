import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../api";
import { useLanguage } from "../language-context";
export function EmployeeCommunicationLink({ employeeId }: { employeeId?: string }) { const { t } = useLanguage(); return <Link to={`/hr/communication${employeeId ? `?employee=${encodeURIComponent(employeeId)}` : ""}`}>{t("Send notification & manage account")}</Link>; }

export function EmployeeActivation() {
  const { t } = useLanguage();
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get("activate") || "");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [repeat, setRepeat] = useState(""); const [error, setError] = useState(""); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { history.replaceState(null, "", location.pathname); }, []);
  return <main className="auth-page"><form className="auth-card form" onSubmit={event => { event.preventDefault(); if (password !== repeat) { setError("Passwords do not match."); return; } setBusy(true); setError(""); void request("/auth/activate-employee", { method: "POST", body: JSON.stringify({ token, email, password }) }).then(() => { setDone(true); setPassword(""); setRepeat(""); }).catch(err => setError(err.message)).finally(() => setBusy(false)); }}><h1>{t("Activate your employee account")}</h1>{error && <p role="alert">{t(error)}</p>}{done ? <><p>{t("Your account is ready. Sign in with your email and new password.")}</p><a href="/">{t("Sign in")}</a></> : <><p>{t("Use your HR-assigned email. If no email was recorded, enter your own email.")}</p><label>{t("Email")}<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>{t("New password")}<input type="password" required minLength={12} maxLength={256} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label><label>{t("Confirm password")}<input type="password" required minLength={12} autoComplete="new-password" value={repeat} onChange={event => setRepeat(event.target.value)} /></label><button disabled={busy}>{t("Activate account")}</button></>}</form></main>;
}
