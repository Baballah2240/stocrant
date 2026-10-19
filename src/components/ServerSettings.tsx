import { useLanguage } from "../language-context";
import { useEffect, useRef, useState } from "react";
import { serverUrl } from "../api";

export default function ServerSettings() {
  const { t } = useLanguage();
  const [origin, setOrigin] = useState(serverUrl.current());
  const [status, setStatus] = useState<{ text: string; good: boolean } | null>(null);
  const [checking, setChecking] = useState(false);
  const request = useRef<AbortController | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { const active = request.current; request.current = null; active?.abort(); if (reloadTimer.current) clearTimeout(reloadTimer.current); }, []);

  async function verify(candidate: string, save: boolean) {
    if (request.current) return;
    const normalized = candidate.trim().replace(/\/+$/, "");
    if (normalized) {
      try {
        const url = new URL(normalized);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
      } catch { setStatus({ text: "Enter an HTTP or HTTPS server address without credentials, a query, or a fragment.", good: false }); return; }
    }
    const controller = new AbortController();
    request.current = controller; setChecking(true); setStatus(null);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${normalized}/api/health`, { credentials: "omit", signal: controller.signal });
      if (!response.ok) throw new Error(t("The server could not be reached. Check the address and try again."));
      const body = await response.json() as { service?: string };
      if (body.service !== "stocrant") throw new Error(t("That address responded, but it is not a STOCRANT server."));
      if (save) {
        serverUrl.save(origin);
        if (serverUrl.current() !== normalized) throw new Error(t("The server preference could not be saved on this device."));
        setStatus({ text: "Connection saved. Sign in to the selected server.", good: true });
        reloadTimer.current = setTimeout(() => location.reload(), 700);
      } else setStatus({ text: "Connection verified.", good: true });
    } catch (error) {
      if (request.current !== controller) return;
      setStatus({ text: controller.signal.aborted ? "The connection timed out. Check the address and try again." : error instanceof Error ? error.message : "Could not verify that server.", good: false });
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setChecking(false); }
    }
  }
  return <section className="panel"><header className="panel-head"><div><h2>{t("Mobile server connection")}</h2><p className="hint">{t("Enter the address of the STOCRANT server this app should use. Stored on this device only.")}</p></div></header><form className="form" onSubmit={event => { event.preventDefault(); void verify(origin.trim() || serverUrl.default(), true); }}><label className="form-field" htmlFor="server-url"><span className="field-label">{t("Server address")}</span><input id="server-url" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={checking} placeholder="https://portal.stocrant.example" value={origin} onChange={event => setOrigin(event.target.value)} aria-describedby="server-help" aria-invalid={status && !status.good ? true : undefined} /><span id="server-help" className="field-help">{t("Leave blank to restore the default connection.")} {serverUrl.default() || t("This website")}</span></label>{status && <p className={status.good ? "hint" : "error"} role={status.good ? "status" : "alert"}>{t(status.text)}</p>}<div className="row-actions"><button className="primary" disabled={checking} type="submit">{t(checking ? "Checking…" : "Test and save")}</button><button className="ghost" disabled={checking} type="button" onClick={() => void verify(serverUrl.current(), false)}>{t("Test current")}</button></div></form></section>;
}
