import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { request } from "../api";
import { useLanguage } from "../language-context";
import ChoiceSelect from "./ChoiceSelect";
import "../website-inquiries.css";

type Inquiry = { id: string; reference: string; name: string; email: string; phone: string; company: string; existingWebsite: string; service: string; plan: string; message: string; status: string; assignedTo: string; version: number; createdAt: string; consentAt: string; history: { id: string; at: string; by: string; note: string; status: string; assignedTo: string }[] };
type Inbox = { items: Inquiry[]; total: number; page: number; pages: number; canAssign: boolean; canEdit: boolean; staff: { id: string; name: string }[]; counts: Record<string, number> };
const labels: Record<string, string> = { new: "New inquiry", "in-progress": "In progress", contacted: "Contacted", quoted: "Quote sent", closed: "Closed", spam: "Spam" };
const endpoint = "/workspace/customer-service/website-inquiries";
export default function WebsiteInquiries() {
  const { t, language } = useLanguage(), [params, setParams] = useSearchParams();
  const [data, setData] = useState<Inbox | null>(null), [selected, setSelected] = useState<Inquiry | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(""), [status, setStatus] = useState("all"), [page, setPage] = useState(1), [form, setForm] = useState({ status: "new", assignedTo: "", note: "" });
  const id = params.get("websiteInquiry");
  const load = useCallback(async () => {
    try { setData(await request<Inbox>(`${endpoint}?${new URLSearchParams({ q: query, status, page: String(page) })}`)); }
    catch (err) { setError((err as Error).message); }
  }, [query, status, page]);
  useEffect(() => { const timer = setTimeout(() => void load(), 200); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { const timer = setInterval(() => void load(), 30_000); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    let active = true; setError("");
    if (!id) { setSelected(null); return; }
    void request<{ item: Inquiry }>(`${endpoint}/${encodeURIComponent(id)}`).then(({ item }) => { if (active) { setSelected(item); setForm({ status: item.status, assignedTo: item.assignedTo, note: "" }); } }).catch(err => { if (active) { setSelected(null); setError(err.message); } });
    return () => { active = false; };
  }, [id]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!selected || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { item } = await request<{ item: Inquiry }>(`${endpoint}/${selected.id}`, { method: "PATCH", body: JSON.stringify({ version: selected.version, status: form.status, ...(data?.canAssign ? { assignedTo: form.assignedTo } : {}), note: form.note }) });
      setSelected(item); setForm({ status: item.status, assignedTo: item.assignedTo, note: "" }); setNotice("Inquiry updated. Contact notes remain private."); await load();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const date = (value: string) => new Date(value).toLocaleString(language === "ar" ? "ar-QA" : "en-US");
  return <section className="card website-inbox" id="website-inquiries"><header className="section-heading"><div><p className="eyebrow">{t("Public website")}</p><h2>{t("Website inquiries")}</h2><p className="hint">{t("Visitors send these requests without an account. Contact them directly and record the outcome here.")}</p></div><button onClick={() => void load()}>{t("Refresh")}</button></header>
    {error && <p role="alert" className="error">{t(error)}</p>}{notice && <p role="status" className="alert alert--good">{t(notice)}</p>}
    <div className="inbox-summary"><span>{t("New inquiry")}: <strong>{data?.counts.new || 0}</strong></span><span>{t("In progress")}: <strong>{data?.counts["in-progress"] || 0}</strong></span><span>{t("Contacted")}: <strong>{data?.counts.contacted || 0}</strong></span></div>
    <div className="inbox-filters"><label>{t("Search inquiries")}<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><label>{t("Status")}<ChoiceSelect value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">{t("All")}</option>{Object.entries(labels).map(([value, text]) => <option key={value} value={value}>{t(text)}</option>)}</ChoiceSelect></label></div>
    <p className="hint">{t(data?.canAssign ? "Platform inbox access includes unassigned public inquiries. Assign a staff member to arrange the follow-up." : "You can see public inquiries assigned to you. Ask the Main Admin to assign new requests.")}</p>
    <div className="inbox-list">{data?.items.map(item => <button className={`inbox-list-item ${selected?.id === item.id ? "is-selected" : ""}`} key={item.id} onClick={() => setParams(old => { const next = new URLSearchParams(old); next.set("websiteInquiry", item.id); return next; })}><span><strong>{item.name}</strong><small>{item.company || t("Shop website inquiry")}</small></span><span><strong>{item.reference}</strong><small>{date(item.createdAt)}</small></span><span className="badge">{t(labels[item.status])}</span><span aria-hidden="true">↗</span></button>)}</div>
    {data && !data.items.length && <p className="empty">{t("No website inquiries match this view.")}</p>}{data && data.pages > 1 && <div className="inline-actions"><button disabled={page <= 1} onClick={() => setPage(v => v - 1)}>{t("Previous")}</button><span>{page} / {data.pages}</span><button disabled={page >= data.pages} onClick={() => setPage(v => v + 1)}>{t("Next")}</button></div>}
    {selected && <article className="inbox-detail"><header className="section-heading"><div><p className="eyebrow">{selected.reference}</p><h3>{selected.name}</h3></div><button onClick={() => setParams(old => { const next = new URLSearchParams(old); next.delete("websiteInquiry"); return next; })}>{t("Close")}</button></header><div className="inbox-contact"><a href={`mailto:${selected.email}`}>{selected.email}</a><a href={`tel:${selected.phone.replace(/[^+\d]/g, "")}`}>{selected.phone}</a></div><dl><div><dt>{t("Business name")}</dt><dd>{selected.company || "—"}</dd></div><div><dt>{t("Requested package")}</dt><dd>{t(selected.plan)}</dd></div><div><dt>{t("Existing website")}</dt><dd>{selected.existingWebsite || "—"}</dd></div><div><dt>{t("Contact consent recorded")}</dt><dd>{date(selected.consentAt)}</dd></div></dl><p className="inbox-message" dir="auto">{selected.message}</p><p className="hint">{t("Email and phone links open your contact tools. Saving a note does not send a message to the visitor.")}</p>
      {data?.canEdit && <form className="form" onSubmit={save}><div className="form-grid"><label>{t("Status")}<ChoiceSelect value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{Object.entries(labels).map(([value, text]) => <option key={value} value={value}>{t(text)}</option>)}</ChoiceSelect></label>{data.canAssign && <label>{t("Assigned staff")}<ChoiceSelect value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}><option value="">{t("Unassigned")}</option>{data.staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</ChoiceSelect></label>}</div><label>{t("Private follow-up note")}<textarea rows={3} maxLength={2000} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label><button className="primary" disabled={busy}>{t(busy ? "Saving…" : "Save follow-up")}</button></form>}
      <h4>{t("Follow-up history")}</h4>{selected.history.length ? <ol className="inbox-history">{[...selected.history].reverse().map(event => <li key={event.id}><strong>{event.by}</strong><span>{date(event.at)} · {t(labels[event.status])}</span>{event.note && <p dir="auto">{event.note}</p>}</li>)}</ol> : <p className="hint">{t("No follow-up recorded yet.")}</p>}
    </article>}
  </section>;
}
