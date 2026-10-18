import { HrMessageDetails } from "./HRMessageDetails";
import { useEffect, useState } from "react";
import { request } from "../api";
import { useLanguage } from "../language-context";
import type { Notification } from "../types";
import "../hr-communication.css";

export default function EmployeeInbox() {
  const { t, language } = useLanguage(); const [items, setItems] = useState<Notification[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => request<{ items: Notification[] }>("/notifications").then(result => setItems(result.items.sort((a,b) => b.createdAt.localeCompare(a.createdAt))));
  useEffect(() => { void load().catch(err => setError(err.message)); const timer = setInterval(() => void load().catch(() => {}), 30000); return () => clearInterval(timer); }, []);
  async function read(id?: string) { setBusy(true); try { await request(id ? `/notifications/${encodeURIComponent(id)}/read` : "/notifications/read-all", { method: "POST" }); await load(); } catch(err) { setError((err as Error).message); } finally { setBusy(false); } }
  return <main className="page hr-inbox"><h1>{t("Notification history")}</h1><button disabled={busy || !items.some(item => !item.read)} onClick={() => void read()}>{t("Mark all as read")}</button>{error && <p role="alert">{t(error)}</p>}{!items.length && <p>{t("No notifications yet.")}</p>}{items.map(item => <article key={item.id}><h2>{item.priority === "Urgent" ? `${t("URGENT")} · ` : ""}{item.title || t("Notification")}</h2><p className="hint">{new Date(item.createdAt).toLocaleString(language)} · {item.read ? t("Read") : t("Unread")}</p><p className="hr-message-body" dir="auto">{item.message}</p>{item.type === "hr_message" && <HrMessageDetails item={item} onChange={() => void load()} />}{!item.read && <button disabled={busy} onClick={() => void read(item.id)}>{t("Mark read")}</button>}</article>)}</main>;
}
