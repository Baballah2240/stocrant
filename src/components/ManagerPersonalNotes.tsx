import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { request } from "../api";
import { useLanguage } from "../language-context";
import "../personal-notes.css";

type Note = { id: string; title: string; body: string; phone: string; dueAt: string | null; completed: boolean; pinned: boolean; version: number; updatedAt: string };
type Notebook = { items: Note[]; total: number; pages: number; page: number; counts: { open: number; completed: number; due: number } };
const endpoint = "/workspace/personal-notes";
const blank = { title: "", body: "", phone: "", dueAt: "", pinned: false };
function localTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export default function ManagerPersonalNotes() {
  const { t, language } = useLanguage();
  const [params, setParams] = useSearchParams(), [data, setData] = useState<Notebook | null>(null);
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("open"), [page, setPage] = useState(1);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Note | "new" | null>(null), [detail, setDetail] = useState<Note | null>(null), [deleting, setDeleting] = useState<Note | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState(blank), [clock, setClock] = useState(Date.now);
  const revision = useRef(0), sending = useRef(false), requestId = useRef(crypto.randomUUID()), formTitle = useRef<HTMLInputElement>(null), container = useRef<HTMLElement>(null);
  const id = params.get("personalNote"), zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const load = useCallback(async () => {
    const version = ++revision.current;
    try {
      const result = await request<Notebook>(`${endpoint}?${new URLSearchParams({ q: query, filter, page: String(page) })}`);
      if (version === revision.current) setData(result);
    } catch (err) { if (version === revision.current) setError((err as Error).message); }
  }, [query, filter, page]);
  useEffect(() => { const timer = setTimeout(() => void load(), 180); return () => { clearTimeout(timer); revision.current++; }; }, [load]);
  useEffect(() => { const timer = setInterval(() => { setClock(Date.now()); if (!document.hidden) void load(); }, 30_000); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    let active = true;
    if (!id) { setDetail(null); return; }
    void request<{ item: Note }>(`${endpoint}/${encodeURIComponent(id)}`).then(({ item }) => {
      if (active) { setDetail(item); container.current?.scrollIntoView({ block: "start", behavior: "instant" }); }
    }).catch(err => { if (active) { setDetail(null); setError(err.message); } });
    return () => { active = false; };
  }, [id]);
  useEffect(() => { if (editor) formTitle.current?.focus(); }, [editor]);
  const change = (value: Partial<typeof form>) => { setForm(old => ({ ...old, ...value })); requestId.current = crypto.randomUUID(); };
  function edit(item: Note | "new") {
    setEditor(item); setError(""); setNotice(""); setDeleting(null); requestId.current = crypto.randomUUID();
    setForm(item === "new" ? blank : { title: item.title, body: item.body, phone: item.phone, dueAt: localTime(item.dueAt), pinned: item.pinned });
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editor || sending.current) return;
    if (form.dueAt && !Number.isFinite(new Date(form.dueAt).getTime())) { setError("Enter a valid reminder time."); return; }
    sending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const reminder = editor !== "new" && form.dueAt === localTime(editor.dueAt) ? editor.dueAt : form.dueAt ? new Date(form.dueAt).toISOString() : null;
      const body = { ...form, dueAt: reminder };
      const { item } = await request<{ item: Note }>(editor === "new" ? endpoint : `${endpoint}/${editor.id}`, { method: editor === "new" ? "POST" : "PATCH", body: JSON.stringify({ ...body, ...(editor === "new" ? { requestId: requestId.current } : { version: editor.version }) }) });
      setEditor(null); setNotice("Private note saved."); if (detail?.id === item.id) setDetail(item); await load();
    } catch (err) { setError((err as Error).message); }
    finally { sending.current = false; setBusy(false); }
  }
  async function update(item: Note, changes: { completed?: boolean; pinned?: boolean }) {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await request<{ item: Note }>(`${endpoint}/${item.id}`, { method: "PATCH", body: JSON.stringify({ ...changes, version: item.version }) });
      if (detail?.id === item.id) setDetail(result.item); await load();
    } catch (err) { setError((err as Error).message); }
    finally { sending.current = false; setBusy(false); }
  }
  async function remove(item: Note) {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try {
      await request(`${endpoint}/${item.id}`, { method: "DELETE", body: JSON.stringify({ version: item.version }) });
      setDeleting(null); if (detail?.id === item.id) closeDetail(); setNotice("Private note deleted."); await load();
    } catch (err) { setError((err as Error).message); }
    finally { sending.current = false; setBusy(false); }
  }
  function closeDetail() { setDetail(null); setParams(old => { const next = new URLSearchParams(old); next.delete("personalNote"); return next; }, { replace: true }); }
  const date = (value: string) => new Date(value).toLocaleString(language === "ar" ? "ar-QA" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  const open = expanded || Boolean(editor) || Boolean(id);
  const rows = detail ? [detail] : open ? data?.items || [] : (data?.items || []).slice(0, 2);
  return <section ref={container} className={`card personal-notebook${open ? " notebook-expanded" : " notebook-compact"}`} id="private-notes" aria-labelledby="private-notes-title">
    <header className="notebook-heading"><div><p className="eyebrow">{t("Only you can see this notebook")}</p><h2 id="private-notes-title">{t("My private notes and reminders")}</h2>{open && <p className="hint">{t("Keep phone numbers, ideas and follow-ups in your personal workspace.")}</p>}</div><button type="button" className="primary" disabled={busy} onClick={() => edit("new")}>{t("New private note")}</button></header>
    <div className="notebook-counts"><span>{t("Open")}: <strong>{data?.counts.open ?? 0}</strong></span><span>{t("Due reminders")}: <strong>{data?.counts.due ?? 0}</strong></span><span>{t("Completed")}: <strong>{data?.counts.completed ?? 0}</strong></span></div>
    {error && <div className="error" role="alert"><p>{t(error)}</p><button type="button" disabled={busy} onClick={() => { setError(""); void load(); }}>{t("Refresh")}</button>{editor && editor !== "new" && <button type="button" disabled={busy} onClick={() => { void request<{ item: Note }>(`${endpoint}/${editor.id}`).then(({ item }) => edit(item)).catch(err => setError(err.message)); }}>{t("Reload saved note")}</button>}</div>}
    {notice && <p role="status" className="alert alert--good">{t(notice)}</p>}
    {editor && <form className="form notebook-editor" onSubmit={save} aria-busy={busy}><h3>{t(editor === "new" ? "New private note" : "Edit private note")}</h3><div className="notebook-form-grid"><label>{t("Note title")}<input ref={formTitle} required maxLength={120} disabled={busy} value={form.title} onChange={e => change({ title: e.target.value })} /></label><label>{t("Phone number (optional)")}<input type="tel" inputMode="tel" autoComplete="off" dir="ltr" maxLength={45} disabled={busy} value={form.phone} onChange={e => change({ phone: e.target.value })} /></label><label className="notebook-full">{t("Personal note")}<textarea rows={4} maxLength={6000} disabled={busy} value={form.body} onChange={e => change({ body: e.target.value })} /></label><label>{t("Reminder time")}<input type="datetime-local" disabled={busy} value={form.dueAt} onChange={e => change({ dueAt: e.target.value })} /><small>{zone}</small></label><label className="notebook-pin"><input type="checkbox" disabled={busy} checked={form.pinned} onChange={e => change({ pinned: e.target.checked })} />{t("Pin this note")}</label></div><p className="hint">{t("Leave the time empty for a note without a reminder. Due reminders appear here and in your own in-app notifications when you return to STOCRANT.")}</p><div className="inline-actions"><button className="primary" disabled={busy}>{t(busy ? "Saving…" : "Save private note")}</button><button type="button" disabled={busy} onClick={() => setEditor(null)}>{t("Cancel")}</button></div></form>}
    {open && !detail && <div className="notebook-filters"><label>{t("Search private notes")}<input type="search" maxLength={200} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><label>{t("Show")}<select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="open">{t("Open")}</option><option value="reminders">{t("Reminders")}</option><option value="completed">{t("Completed")}</option><option value="all">{t("All")}</option></select></label><button type="button" disabled={busy} onClick={() => { setError(""); void load(); }}>{t("Refresh")}</button></div>}
    {detail && <button type="button" onClick={closeDetail}>{t("Back to my notebook")}</button>}
    <div className="notebook-list">{rows.map(item => <article className={`notebook-note${item.completed ? " is-completed" : ""}`} key={item.id}><header><h3 dir="auto">{item.title}</h3>{item.pinned && <span className="badge">{t("Pinned")}</span>}</header>{item.body && <p className="notebook-body" dir="auto">{item.body}</p>}{item.phone && <a className="notebook-phone" dir="ltr" href={`tel:${item.phone.replace(/[^+\d]/g, "")}`}>{item.phone}</a>}{item.dueAt && <p className={`notebook-due${!item.completed && Date.parse(item.dueAt) <= clock ? " is-due" : ""}`}><strong>{t(item.completed ? "Completed" : Date.parse(item.dueAt) <= clock ? "Reminder due" : "Reminder")}</strong><time dateTime={item.dueAt}>{date(item.dueAt)}</time></p>}<div className="notebook-actions" hidden={!open}><button type="button" disabled={busy} onClick={() => edit(item)}>{t("Edit")}</button><button type="button" disabled={busy} onClick={() => void update(item, { completed: !item.completed })}>{t(item.completed ? "Reopen" : "Mark complete")}</button><button type="button" disabled={busy} onClick={() => void update(item, { pinned: !item.pinned })}>{t(item.pinned ? "Unpin" : "Pin")}</button><button type="button" disabled={busy} onClick={() => setDeleting(item)}>{t("Delete")}</button></div>{deleting?.id === item.id && <div className="notebook-delete" role="group" aria-label={t("Confirm private note deletion")}><p>{t("Delete this private note and its reminder?")}</p><button type="button" disabled={busy} className="danger" onClick={() => void remove(item)}>{t("Delete private note")}</button><button type="button" disabled={busy} onClick={() => setDeleting(null)}>{t("Cancel")}</button></div>}</article>)}</div>
    {!editor && !detail && <button type="button" className="notebook-toggle" onClick={() => setExpanded(!expanded)}>{t(open ? "Collapse notebook" : "Open notebook")}</button>}
    {!rows.length && <p className="empty">{t(data ? "No private notes match this view." : "Loading private notes…")}</p>}
    {open && !detail && data && data.pages > 1 && <div className="inline-actions"><button type="button" disabled={busy || data.page <= 1} onClick={() => setPage(data.page - 1)}>{t("Previous")}</button><span>{data.page} / {data.pages}</span><button type="button" disabled={busy || data.page >= data.pages} onClick={() => setPage(data.page + 1)}>{t("Next")}</button></div>}
  </section>;
}
