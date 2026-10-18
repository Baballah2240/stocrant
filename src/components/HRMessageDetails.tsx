import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../api";
import { useLanguage } from "../language-context";
import type { Notification } from "../types";
import "../hr-communication.css";

export function HrMessageDetails({ item, onChange }: { item: Notification; onChange?: () => void }) {
  const { t, language } = useLanguage(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <section><p>{t(item.priority || "Normal")} · {t(item.hrType || "General Message")} · {item.senderName}</p>{item.effectiveAt && <p>{new Date(item.effectiveAt).toLocaleString(language === "ar" ? "ar" : "en-GB")}</p>}<p>{item.shiftTime} {item.location}</p>{item.url && /^https:\/\//.test(item.url) && <a href={item.url} target="_blank" rel="noopener noreferrer">{t("Join meeting / open reference")}</a>}{item.acknowledgmentRequired && <p>{item.acknowledgedAt ? `${t("Acknowledged")}: ${new Date(item.acknowledgedAt).toLocaleString(language)}` : <button disabled={busy} onClick={() => { setBusy(true); void request(`/notifications/${encodeURIComponent(item.id)}/acknowledge`, { method: "POST" }).then(() => onChange?.()).catch(err => setError(err.message)).finally(() => setBusy(false)); }}>{t("Acknowledge")}</button>}</p>}{error && <p role="alert">{t(error)}</p>}</section>;
}
export function UrgentEmployeeBanner() {
  const { t } = useLanguage(); const [items, setItems] = useState<Notification[]>([]);
  useEffect(() => { let active = true; const refresh = () => request<{ items: Notification[] }>("/notifications").then(result => { if (active) setItems(result.items.filter(item => item.type === "hr_message" && item.priority === "Urgent" && (item.acknowledgmentRequired ? !item.acknowledgedAt : !item.read))); }).catch(() => {}); void refresh(); const timer = setInterval(() => void refresh(), 30000); return () => { active = false; clearInterval(timer); }; }, []);
  return items.length ? <aside className="hr-urgent-banner" role="status"><strong>{t("URGENT")}</strong> · {items[0].title} <Link to="/notifications">{t("Read & acknowledge")}</Link>{items.length > 1 && ` (+${items.length - 1})`}</aside> : null;
}
