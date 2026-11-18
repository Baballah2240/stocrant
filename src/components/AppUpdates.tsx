import { useEffect, useRef, useState } from "react";
import { request, isNativeApp } from "../api";
import { installAndroidUpdate, isAndroidDevice } from "../device-actions";
import { useLanguage } from "../language-context";
import "../app-updates.css";

type Release = { id: string; platform: "android" | "ios"; versionName: string; buildNumber: number; notes: string; downloadUrl: string; sha256: string; status?: string; version: number; approvedAt?: string };
const blank = () => ({ platform: "android", versionName: "", buildNumber: "", notes: "", downloadUrl: "", sha256: "" });
export default function AppUpdates({ admin = false }: { admin?: boolean }) {
  const { t } = useLanguage(), [items, setItems] = useState<Release[]>([]), [form, setForm] = useState(blank);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false), [installed, setInstalled] = useState(""), [installedBuild, setInstalledBuild] = useState(0), [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const path = "/workspace/app-releases";
  async function load() { const data = await request<{ items: Release[] }>(path + (admin ? "" : "/available")); setItems(data.items); setLoaded(true); }
  useEffect(() => { let active = true;
    void request<{ items: Release[] }>(path + (admin ? "" : "/available")).then(data => { if (active) { setItems(data.items); setLoaded(true); } }).catch(err => { if (active) setError(err.message); });
    if (isNativeApp()) void import("@capacitor/app").then(({ App }) => App.getInfo()).then(info => { if (active) { setInstalled(info.version); setInstalledBuild(Number(info.build) || 0); } }).catch(() => {});
    return () => { active = false; };
  }, [admin]);
  async function mutate(action: string, body: unknown) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError("");
    try { await request(path + action, { method: "POST", body: JSON.stringify(body) }); await load(); if (!action) setForm(blank()); }
    catch (err) { setError((err as Error).message); } finally { inFlight.current = false; setBusy(false); }
  }
  async function download(release: Release) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError("");
    try {
      // Recheck live approval on every click, including an old notification or open tab.
      const data = await request<{ items: Release[] }>(path + "/available");
      const approved = data.items.find(item => item.id === release.id);
      if (!approved) { setItems(data.items); throw Error("This release is no longer approved for download."); }
      setNotice("");
      if (isAndroidDevice()) { setNotice("Downloading and checking the update…"); await installAndroidUpdate(approved.downloadUrl, approved.sha256); setNotice("Follow the Android prompt to finish installing the update."); }
      else window.location.assign(approved.downloadUrl);
    } catch (err) { setNotice(""); setError((err as Error).message); } finally { inFlight.current = false; setBusy(false); }
  }
  const native = !admin && isAndroidDevice();
  const isNewer = (item: Release) => !installedBuild || item.buildNumber > installedBuild;
  const available = !admin && isNativeApp() ? items.filter(item => item.platform === (isAndroidDevice() ? "android" : "ios")) : items;
  return <section className="app-updates"><header><p className="eyebrow">{t("Stocrant mobile app")}</p><h2>{t(admin ? "App releases and approval" : "Approved app downloads")}</h2><p className="hint">{t(admin ? "Create a draft after uploading the build to your trusted HTTPS host. Only Super Admin approval makes it visible and notifies users." : "Only releases approved by the Super Admin appear here.")}</p></header>
    {error && <p className="alert alert--bad" role="alert">{t(error)}</p>}{notice && <p className="alert alert--good" role="status">{t(notice)}</p>}
    {!loaded && !error && <p role="status">{t("Loading app releases…")}</p>}
    {admin && <form className="card" onSubmit={event => { event.preventDefault(); void mutate("", { ...form, buildNumber: Number(form.buildNumber) }); }}><h3>{t("New release draft")}</h3><div className="form-grid"><label className="form-field">{t("Platform")}<select disabled={busy} value={form.platform} onChange={event => setForm({ ...form, platform: event.target.value })}><option value="android">Android</option><option value="ios">iOS</option></select></label>{(["versionName", "buildNumber", "downloadUrl", "sha256"] as const).map(key => <label className="form-field" key={key}>{t({ versionName: "App version", buildNumber: "Build number", downloadUrl: "HTTPS download URL", sha256: "SHA-256 checksum" }[key])}<input required disabled={busy} type={key === "buildNumber" ? "number" : key === "downloadUrl" ? "url" : "text"} min={key === "buildNumber" ? 1 : undefined} maxLength={key === "sha256" ? 64 : key === "versionName" ? 32 : 2000} dir="ltr" value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })}/></label>)}</div><label className="form-field">{t("Release notes")}<textarea required disabled={busy} minLength={5} maxLength={4000} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })}/></label><p className="hint">{t("Use a distributable Android APK or an iOS App Store/TestFlight link. Register the checksum of the actual build artifact; this page does not upload or sign builds.")}</p><button className="primary" disabled={busy}>{t("Save release draft")}</button></form>}
    {loaded && !available.length && <p className="card">{t("No approved app update is available.")}</p>}
    <div className="app-release-grid">{available.map(item => <article className="card app-release-card" key={item.id}><div className="section-heading"><h3>{item.platform === "android" ? "Android" : "iOS"} · <bdi>{item.versionName}</bdi></h3>{admin && <span className="badge">{t(item.status || "draft")}</span>}</div><p>{t("Build number")}: {item.buildNumber}</p>{!admin && installed && <p>{t("Installed version")}: <bdi>{installed}</bdi></p>}<p className="app-release-notes" dir="auto">{item.notes}</p><details><summary>{t("SHA-256 checksum")}</summary><code dir="ltr">{item.sha256}</code></details><div className="inline-actions">{admin && item.status === "draft" && <button className="primary" disabled={busy} onClick={() => void mutate(`/${item.id}/approve`, { version: item.version })}>{t("Approve and notify users")}</button>}{admin && item.status === "approved" && <button disabled={busy} onClick={() => void mutate(`/${item.id}/withdraw`, { version: item.version })}>{t("Withdraw release")}</button>}{(!admin || item.status === "approved") && (native ? (isNewer(item) ? <button className="primary" disabled={busy} onClick={() => void download(item)}>{t(busy ? "Downloading update…" : "Install update")}</button> : <span className="badge">{t("Up to date")}</span>) : <button className="primary" disabled={busy} onClick={() => void download(item)}>{t("Download app")} ↗</button>)}</div></article>)}</div>
  </section>;
}
