import { useLanguage } from "../language-context";
import { useState } from "react";
import { api } from "../api";
import { useSession } from "../session-context";

export default function ForcedPasswordChange() {
  const { t } = useLanguage();
  const { signOut } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (newPassword !== confirmPassword) return setError("New passwords do not match.");
    if (newPassword === currentPassword) return setError("Choose a new password that is different from the temporary password.");
    setBusy(true);
    try { await api.auth.changePassword({ currentPassword, newPassword }); await signOut(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not change password."); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">{t("STOCRANT security")}</p><h1>{t("Set a new password")}</h1><p className="hint">{t("Your temporary password must be changed before you can open company records.")}</p>{error && <p className="error" role="alert">{t(error)}</p>}<form className="form" onSubmit={submit}><label className="form-field"><span>{t("Temporary password")}</span><input required type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><label className="form-field"><span>{t("New password")}</span><input required type="password" minLength={12} maxLength={256} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /><small>{t("Use at least 12 characters.")}</small></label><label className="form-field"><span>{t("Confirm new password")}</span><input required type="password" minLength={12} maxLength={256} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label><button className="primary" disabled={busy}>{busy ? t("Updating…") : t("Change password")}</button></form></section></main>;
}
