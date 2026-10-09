import { useState } from "react";
import { useSession } from "../session-context";

export default function AuthPage() {
  const { setupRequired, signIn, setup } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (setupRequired) await setup({ name, email, password, setupKey });
      else await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card anim-rise">
        <div className="auth-brand">
          <span className="brand-logo" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="1" y="1" width="22" height="22" rx="6.5" /><path d="M7 7.5h10M7 12h7M7 16.5h10" /></svg></span>
          <div><strong>STOCRANT</strong><span>Business workspace</span></div>
        </div>
        <h1>{setupRequired ? "Set up your workspace" : "Sign in"}</h1>
        <p className="hint">{setupRequired ? "Create the first Main Manager account. Your setup key is kept in the server environment." : "Use your STOCRANT account to access company records."}</p>
        {error && <p className="error">{error}</p>}
        <form className="form" onSubmit={submit}>
          {setupRequired && <div className="form-field"><label className="field-label">Your name</label><input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></div>}
          <div className="form-field"><label className="field-label">Email</label><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="form-field"><label className="field-label">Password</label><input required type="password" minLength={12} autoComplete={setupRequired ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /><span className="field-help">Use at least 12 characters.</span></div>
          {setupRequired && <div className="form-field"><label className="field-label">Setup key</label><input required type="password" autoComplete="off" value={setupKey} onChange={(event) => setSetupKey(event.target.value)} /><span className="field-help">For local development, the default is <code>local-setup</code>. Set a private value in <code>STOCRANT_SETUP_KEY</code> before production.</span></div>}
          <button className="primary" disabled={submitting} type="submit">{submitting ? "Working…" : setupRequired ? "Create Main Manager" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}