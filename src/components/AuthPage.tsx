import { useTheme } from "../theme-context";
import { useWebsiteMotion } from "../use-website-motion";
import FeatureCard from "./FeatureCard";
import { useState, useRef } from "react";
import { api, isNativeApp, serverUrl } from "../api";
import { useSession } from "../session-context";

export default function AuthPage() {
  const { theme, toggle } = useTheme();
  const pageRef = useRef<HTMLDivElement>(null);
  useWebsiteMotion(pageRef);
  const { setupRequired, signIn, setup } = useSession();
  const [forgot, setForgot] = useState(false);
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState(serverUrl.current());
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);

  async function connectServer(event: React.FormEvent) {
    event.preventDefault();
    const normalized = origin.trim().replace(/\/+$/, "");
    setCheckingConnection(true);
    setConnectionStatus(null);
    try {
      if (!normalized) throw new Error("Enter the STOCRANT web-server address.");
      const parsed = new URL(normalized);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Use an http:// or https:// address.");
      const response = await fetch(`${normalized}/api/health`);
      const body = (await response.json()) as { service?: string };
      if (!response.ok || body.service !== "stocrant") throw new Error("That address is not a reachable STOCRANT server.");
      const applied = serverUrl.save(normalized);
      setConnectionStatus(`Connected to ${applied}. Reloading…`);
      window.setTimeout(() => window.location.reload(), 450);
    } catch (err) {
      setConnectionStatus(err instanceof Error ? err.message : "Could not connect to the STOCRANT server.");
    } finally {
      setCheckingConnection(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (forgot) { const result = await api.auth.forgotPassword(email); setNotice(result.message); }
      else if (setupRequired) await setup({ name, email, password, setupKey });
      else await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-experience" ref={pageRef}><div className="public-cursor-glow" aria-hidden="true" /><header className="auth-page-nav"><a href="/welcome" className="auth-home-link">STOCRANT <span>People. Work. Business.</span></a><button type="button" className="auth-theme-switch" onClick={toggle} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}><span aria-hidden="true">{theme === "light" ? "?" : "?"}</span>{theme === "light" ? "Dark mode" : "Light mode"}</button></header><main className="auth-page"><aside className="auth-welcome"><p className="eyebrow">Your business. Working together.</p><h2>Your workday<br />starts <em>here.</em></h2><p className="auth-welcome-intro">A shared home for your people, daily work and company records.</p><div className="public-feature-grid auth-feature-grid"><FeatureCard feature={{ icon: "people", name: "Your people", text: "Attendance, leave and employee records in one place." }} /><FeatureCard feature={{ icon: "work", name: "Your work", text: "Follow assignments, deadlines and progress." }} /><FeatureCard feature={{ icon: "settings", name: "Your workspace", text: "Tools and access for every role." }} /></div><a className="auth-explore-link" href="/welcome">Explore STOCRANT ?</a></aside>
      <section className="auth-card anim-rise">
        <div className="auth-brand">
          <span className="brand-logo" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="1" y="1" width="22" height="22" rx="6.5" /><path d="M7 7.5h10M7 12h7M7 16.5h10" /></svg></span>
          <div><strong>STOCRANT</strong><span>Business workspace</span></div>
        </div>
        <h1>{setupRequired ? "Set up your workspace" : forgot ? "Reset your password" : "Welcome back"}</h1>
        <p className="hint">{setupRequired ? "Create the first Main Manager account. Your setup key is kept in the server environment." : forgot ? "Send a reset request to your main manager." : "Sign in to your company workspace."}</p>
        {isNativeApp() && <form className="form auth-server-form" onSubmit={connectServer}>
          <div className="form-field">
            <label className="field-label" htmlFor="mobile-server-url">Web app / server address</label>
            <input id="mobile-server-url" required inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://stocrant.example.com" value={origin} onChange={(event) => setOrigin(event.target.value)} />
            <span className="field-help">Use the same STOCRANT server as the management web app. For Wi-Fi testing: <code>http://PC-LAN-IP:3000</code>.</span>
          </div>
          {connectionStatus && <p className={connectionStatus.startsWith("Connected") ? "hint" : "error"}>{connectionStatus}</p>}
          <button className="ghost" disabled={checkingConnection} type="submit">{checkingConnection ? "Checking…" : "Connect mobile app"}</button>
        </form>}
        {error && <p className="error" role="alert">{error}</p>}{notice && <div className="alert alert--good" role="status">{notice}</div>}
        <form className="form" onSubmit={submit}>
          {setupRequired && <div className="form-field"><label className="field-label">Your name</label><input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></div>}
          <div className="form-field"><label className="field-label" htmlFor="sign-in-email">Email</label><input id="sign-in-email" disabled={submitting} autoCapitalize="none" spellCheck={false} required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          {!forgot && <div className="form-field"><label className="field-label" htmlFor="sign-in-password">Password</label><input id="sign-in-password" disabled={submitting} required type={showPassword ? "text" : "password"} minLength={setupRequired ? 12 : 1} autoComplete={setupRequired ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="ghost" aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide password" : "Show password"}</button>{setupRequired && <span className="field-help">Use at least 12 characters.</span>}</div>}
          {setupRequired && <div className="form-field"><label className="field-label">Setup key</label><input required type="password" autoComplete="off" value={setupKey} onChange={(event) => setSetupKey(event.target.value)} /><span className="field-help">For local development, the default is <code>local-setup</code>. Set a private value in <code>STOCRANT_SETUP_KEY</code> before production.</span></div>}
          <button className="primary" disabled={submitting} type="submit">{submitting ? "Working…" : setupRequired ? "Create Main Manager" : forgot ? "Send reset request" : "Sign in"}</button>
        </form>
        {!setupRequired && <button type="button" className="auth-recovery-link" disabled={submitting} onClick={() => { setForgot((value) => !value); setError(null); setNotice(""); setPassword(""); }}>{forgot ? "Back to sign in" : "Forgot password?"}</button>}
      </section>
    </main></div>
  );
}