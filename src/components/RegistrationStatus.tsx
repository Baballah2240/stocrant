import { useEffect } from "react";
import { useSession } from "../session-context";
import { useLanguage } from "../language-context";
import { NotificationBell } from "./NotificationBell";
export default function RegistrationStatus() {
  const { user, refresh, signOut } = useSession();
  const { t } = useLanguage();
  useEffect(() => { const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 20000); return () => clearInterval(timer); }, [refresh]);
  const rejected = user?.accountStatus === "rejected";
  if (user?.accountStatus === "active") return <main className="auth-page registration-status"><section className="auth-card"><h1>{t("Company assignment required")}</h1><p className="hint">{t("Ask your Main Admin to assign your account to one company.")}</p><div className="inline-actions"><button onClick={() => void refresh()}>{t("Refresh")}</button><button onClick={() => void signOut()}>{t("Sign out")}</button></div></section></main>;
  return <main className="auth-page registration-status"><section className="auth-card"><div className="registration-status-head"><h1>{rejected ? t("Request not approved") : t("Awaiting approval")}</h1><NotificationBell /></div><p>{user?.name}</p><p className="hint">{t("Open notifications to read your Main Admin's replies. Business records stay locked until approval.")}</p><div className="inline-actions"><button onClick={() => void refresh()}>{t("Refresh status")}</button><button onClick={() => void signOut()}>{t("Sign out")}</button></div></section></main>;
}
