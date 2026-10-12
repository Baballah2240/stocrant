import { useLanguage } from "../language-context";
import BackButton from "./BackButton";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useSession } from "../session-context";

export default function ProfilePanel({ onClose, initialPhoto }: { onClose: () => void; initialPhoto?: File }) {
  const { t } = useLanguage();
  const { user, refresh, signOut } = useSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: user?.name ?? "", email: user?.email ?? "", phone: user?.phone ?? "", bio: user?.bio ?? "", avatar: user?.avatar ?? "", currentPassword: "" });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [tab, setTab] = useState<"details" | "password">("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); if (initialPhoto) void photo(initialPhoto); }, []);
  async function photo(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) { setError("Choose a JPG, PNG or WebP image smaller than 8 MB."); return; }
    setBusy(true); setError("");
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d"); if (!context) throw new Error("Photo processing is unavailable.");
      const side = Math.min(image.width, image.height);
      context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
      setForm((current) => ({ ...current, avatar: canvas.toDataURL("image/jpeg", 0.85) }));
    } catch { setError("Could not read that photo. Try another image."); }
    finally { URL.revokeObjectURL(url); setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api.auth.updateProfile(form); onClose(); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save profile."); }
    finally { setBusy(false); }
  }
  async function changePassword(event: React.FormEvent) {
    event.preventDefault(); if (password.newPassword !== password.confirm) { setError("New passwords do not match."); return; }
    setBusy(true); setError("");
    try { await api.auth.changePassword({ currentPassword: password.currentPassword, newPassword: password.newPassword }); await signOut(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not change password."); }
    finally { setBusy(false); }
  }
  return <dialog className="profile-dialog" ref={dialog} onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }} onClick={(event) => { if (event.target === dialog.current && !busy) onClose(); }} aria-labelledby="profile-title"><div className="profile-panel"><BackButton disabled={busy} onBack={() => { if (tab === "password") { setTab("details"); setError(""); } else onClose(); }} /><div className="list-heading"><div><p className="eyebrow">{t("Your account")}</p><h2 id="profile-title">{t("My profile")}</h2></div><button type="button" aria-label="Close profile" disabled={busy} onClick={onClose}>{t("Close")}</button></div><div className="profile-identity"><button className="profile-avatar profile-photo-edit" type="button" aria-label="Change profile photo" disabled={busy} onClick={() => { setTab("details"); photoInput.current?.click(); }}>{form.avatar ? <img src={form.avatar} alt="Profile" /> : form.name.slice(0, 2).toUpperCase()}<span className="profile-photo-caption">{t("Edit")}</span></button><input ref={photoInput} className="photo-picker-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo" disabled={busy} onChange={event => { void photo(event.target.files?.[0]); event.target.value = ""; }} /><div><strong>{user?.name}</strong><span className="cell-sub">User ID: {user?.id}</span><span className="cell-sub">{user?.position || "Employee"}</span><small className="hint">{t("Tap the photo to change it")}</small>{form.avatar && <button className="profile-remove-photo" type="button" disabled={busy} onClick={() => setForm({ ...form, avatar: "" })}>{t("Remove photo")}</button>}</div></div><section className="profile-position"><strong>Position: {user?.position || "Employee"}</strong>{user?.description && <p className="hint">{user.description}</p>}</section><div className="tab-list"><button type="button" aria-pressed={tab === "details"} className={tab === "details" ? "active" : ""} onClick={() => { setTab("details"); setError(""); }}>{t("Personal details")}</button><button type="button" aria-pressed={tab === "password"} className={tab === "password" ? "active" : ""} onClick={() => { setTab("password"); setError(""); }}>{t("Password")}</button></div>{error && <div className="alert alert--bad" role="alert">{error}</div>}{tab === "details" ? <form className="form" onSubmit={save}><label className="form-field"><span>{t("Full name")}</span><input required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="form-field"><span>{t("Email")}</span><input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="form-field"><span>{t("Phone")}</span><input type="tel" autoComplete="tel" maxLength={40} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label className="form-field"><span>{t("About me")}</span><textarea rows={3} maxLength={1000} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} placeholder="A short introduction about you" /></label>{form.email !== user?.email && <label className="form-field"><span>{t("Current password to confirm email change")}</span><input required type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} /></label>}<button className="primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></form> : <form className="form" onSubmit={changePassword}><p className="hint">Use at least 12 characters. After changing your password, sign in again on your devices.</p>{([{ key: "currentPassword", label: "Current password", autoComplete: "current-password" }, { key: "newPassword", label: "New password", autoComplete: "new-password" }, { key: "confirm", label: "Confirm new password", autoComplete: "new-password" }] as const).map((field) => <label className="form-field" key={field.key}><span>{field.label}</span><input required type="password" minLength={field.key === "currentPassword" ? 1 : 12} maxLength={256} autoComplete={field.autoComplete} value={password[field.key]} onChange={(event) => setPassword({ ...password, [field.key]: event.target.value })} /></label>)}<button className="primary" disabled={busy}>{busy ? "Updating…" : "Change password"}</button></form>}</div></dialog>;
}
