import { useLanguage } from "../language-context";
import { useState } from "react";
import { api, serverUrl } from "../api";

/**
 * Lets a phone or tablet point the packaged app at its STOCRANT server.
 *
 * A native build is served from capacitor:// or https://localhost, so a
 * relative "/api" resolves to nothing. The origin is stored on the device and
 * validated against /api/health before it is accepted, which stops a typo from
 * silently breaking every later request.
 */
export default function ServerSettings() {
  const { t } = useLanguage();
  const [origin, setOrigin] = useState(serverUrl.current());
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function testConnection(candidate: string) {
    const normalized = candidate.trim().replace(/\/+$/, "");
    if (!normalized) throw new Error("Enter your STOCRANT server address, for example https://portal.stocrant.example");
    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      throw new Error("That address is not a valid URL. Include http:// or https://");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Only http:// and https:// addresses are supported.");
    }
    // Bypass the resolver so the candidate can be verified before saving it.
    const response = await fetch(`${normalized}/api/health`, { credentials: "include" });
    if (!response.ok) throw new Error(`The server answered ${response.status}. Check the address and try again.`);
    const body = (await response.json()) as { service?: string };
    if (body.service !== "stocrant") throw new Error("That address responded, but it is not a STOCRANT server.");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setChecking(true);
    setStatus(null);
    try {
      await testConnection(origin);
      const applied = serverUrl.save(origin);
      setStatus(`Connected to ${applied || "this device"}. Reloading your session…`);
      // Force the app to re-read session state against the new origin.
      window.setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not verify that server.");
    } finally {
      setChecking(false);
    }
  }

  async function verifyCurrent() {
    setChecking(true);
    setStatus(null);
    try {
      await api.health();
      setStatus(`Connected to ${serverUrl.current() || "this device"}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not reach the server.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>{t("Mobile server connection")}</h2>
          <p className="hint">
             {t("Enter the address of the STOCRANT server this app should use. Stored on this device only.")} </p>
        </div>
      </header>
      <form className="form" onSubmit={save}>
        <div className="form-field">
          <label className="field-label" htmlFor="server-url">{t("Server address")}</label>
          <input
            id="server-url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t("https://portal.stocrant.example")}
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
          />
          <span className="field-help">
             {t("Leave empty to use the address this app was built with (")}{serverUrl.current() || "none configured"}).
          </span>
        </div>
        {status && <p className={status.startsWith("Connected") ? "hint" : "error"}>{status}</p>}
        <div className="row-actions">
          <button className="primary" disabled={checking} type="submit">
            {checking ? t("Checking…") : t("Test and save")}
          </button>
          <button className="ghost" disabled={checking} type="button" onClick={() => void verifyCurrent()}>
             {t("Test current")} </button>
        </div>
      </form>
    </section>
  );
}
