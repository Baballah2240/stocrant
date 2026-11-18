import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { request } from "../api";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import MobileIcon from "./MobileIcon";
import "../shop-clients.css";

type Client = { id: string; companyId: string; companyName: string; currency: string; plan: string; status: string; effectiveStatus: string; startsAt: string; endsAt: string; monthlyFee: string; notes: string; version: number; ownerName: string; ownerEmail: string; owner: string; orders: number; ordersThisMonth: number; products: number; lastOrderAt: string | null; shop: { name: string; slug: string; published: boolean; url: string } | null };
type Candidate = { id: string; name: string; currency: string };
type Data = { clients: Client[]; candidates: Candidate[]; plans: string[]; currencies: string[] };
type Invite = { inviteLink: string; inviteExpiresAt: string; companyName: string };
const blank = { businessName: "", currency: "SDG", country: "Sudan", ownerName: "", ownerEmail: "", phone: "", slug: "", plan: "starter", status: "trial", endsAt: "", monthlyFee: "0", notes: "" };
const slugFrom = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "").slice(0, 48);
const tones: Record<string, string> = { trial: "warn", active: "good", suspended: "bad", cancelled: "bad", expired: "bad" };

/** Platform owner's register of online-shop clients: set one up in one form, send the owner's invitation, manage the plan and suspend unpaid shops. */
export default function ShopClients() {
  const { t, language } = useLanguage(), { user } = useSession(), [params] = useSearchParams();
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const preset = params.get("company") || "";
  const [mode, setMode] = useState<"new" | "existing">(preset ? "existing" : "new"), [companyId, setCompanyId] = useState(preset);
  const [form, setForm] = useState(blank), [slugEdited, setSlugEdited] = useState(false), [open, setOpen] = useState(Boolean(preset));
  const [invite, setInvite] = useState<Invite | null>(null), [copied, setCopied] = useState(false), [filter, setFilter] = useState("all");
  const load = () => request<Data>("/workspace/shop-clients").then(setData).catch(e => setError((e as Error).message));
  useEffect(() => { void load(); }, []);
  const date = (v?: string | null) => v ? new Date(v.length === 10 ? v + "T00:00:00" : v).toLocaleDateString(language === "ar" ? "ar" : "en-GB") : "—";
  const set = (key: keyof typeof blank, value: string) => setForm(f => ({ ...f, [key]: value, ...(key === "businessName" && !slugEdited ? { slug: slugFrom(value) } : {}) }));
  const chosen = data?.candidates.find(c => c.id === companyId);
  const shown = useMemo(() => (data?.clients || []).filter(c => filter === "all" || c.effectiveStatus === filter), [data, filter]);
  if (user?.roleId !== "role-main-manager") return <main className="page"><p role="alert">{t("Only the platform owner can manage shop clients.")}</p></main>;

  async function create(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const body: Record<string, unknown> = { ownerName: form.ownerName, ownerEmail: form.ownerEmail, phone: form.phone, slug: form.slug, plan: form.plan, status: form.status, monthlyFee: form.monthlyFee || "0", notes: form.notes, ...(form.endsAt ? { endsAt: form.endsAt } : {}) };
      if (mode === "existing") body.existingCompanyId = companyId; else Object.assign(body, { businessName: form.businessName, currency: form.currency, country: form.country });
      const result = await request<{ client: Client; inviteLink: string; inviteExpiresAt: string }>("/workspace/shop-clients", { method: "POST", body: JSON.stringify(body) });
      setInvite({ inviteLink: result.inviteLink, inviteExpiresAt: result.inviteExpiresAt, companyName: result.client.companyName }); setCopied(false);
      setForm(blank); setSlugEdited(false); setOpen(false); setCompanyId(""); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function update(client: Client, changes: Record<string, unknown>) {
    setError("");
    try { await request(`/workspace/shop-clients/${encodeURIComponent(client.id)}`, { method: "PATCH", body: JSON.stringify({ version: client.version, ...changes }) }); await load(); } catch (e) { setError((e as Error).message); }
  }
  async function reinvite(client: Client) {
    setError("");
    try { const r = await request<{ inviteLink: string; inviteExpiresAt: string }>(`/workspace/shop-clients/${encodeURIComponent(client.id)}/invite`, { method: "POST", body: "{}" }); setInvite({ ...r, companyName: client.companyName }); setCopied(false); await load(); } catch (e) { setError((e as Error).message); }
  }
  const extend = (client: Client) => { const from = client.endsAt && client.endsAt > new Date().toISOString().slice(0, 10) ? new Date(client.endsAt + "T00:00:00Z") : new Date(); from.setUTCMonth(from.getUTCMonth() + 1); return from.toISOString().slice(0, 10); };
  const counts = (data?.clients || []).reduce<Record<string, number>>((n, c) => ({ ...n, [c.effectiveStatus]: (n[c.effectiveStatus] || 0) + 1 }), {});

  return <main className="page shop-clients">
    <header className="section-heading"><div><p className="eyebrow">{t("Online shop service")}</p><h1><MobileIcon name="shop" /> {t("Online shop clients")}</h1><p className="hint">{t("Set up a shop for a client in one step, send the owner their invitation, and manage their plan.")}</p></div>
      <button type="button" className="primary" onClick={() => setOpen(o => !o)} aria-expanded={open}>{t(open ? "Close" : "New shop client")}</button></header>
    {error && <p role="alert" className="error">{error}</p>}
    {invite && <section className="card shop-client-invite" role="status"><h2>{t("Send this link to the shop owner")}</h2><p>{t("{company} is ready. The owner opens this link once to set their password, then goes straight to their shop.", { company: invite.companyName })}</p>
      <div className="shop-client-link"><input readOnly dir="ltr" value={invite.inviteLink} onFocus={e => e.currentTarget.select()} aria-label={t("Invitation link")} /><button type="button" onClick={() => void navigator.clipboard?.writeText(invite.inviteLink).then(() => setCopied(true))}>{t(copied ? "Copied" : "Copy link")}</button>
        <a className="button" href={`https://wa.me/?text=${encodeURIComponent(invite.inviteLink)}`} target="_blank" rel="noreferrer">{t("Share on WhatsApp")}</a></div>
      <small className="hint">{t("Single use. Expires {date}.", { date: date(invite.inviteExpiresAt) })}</small> <button type="button" className="link-button" onClick={() => setInvite(null)}>{t("Done")}</button></section>}
    {open && data && <form className="card shop-client-form" onSubmit={create}>
      <fieldset className="shop-client-mode"><legend>{t("Who is this shop for?")}</legend>
        <label><input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> {t("A new client business")}</label>
        <label><input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} disabled={!data.candidates.length} /> {t("An existing company adding a website")}</label></fieldset>
      <div className="shop-client-grid">
        {mode === "new" ? <>
          <label>{t("Business name")}<input required minLength={2} value={form.businessName} onChange={e => set("businessName", e.target.value)} /></label>
          <label>{t("Primary currency")}<select value={form.currency} onChange={e => set("currency", e.target.value)}>{data.currencies.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>{t("Country")}<input value={form.country} onChange={e => set("country", e.target.value)} /></label>
        </> : <label>{t("Company")}<select required value={companyId} onChange={e => { setCompanyId(e.target.value); const c = data.candidates.find(x => x.id === e.target.value); if (c && !slugEdited) set("slug", slugFrom(c.name)); }}><option value="">{t("Choose a company")}</option>{data.candidates.map(c => <option key={c.id} value={c.id}>{c.name} · {c.currency}</option>)}</select></label>}
        <label>{t("Owner name")}<input required minLength={2} value={form.ownerName} onChange={e => set("ownerName", e.target.value)} /></label>
        <label>{t("Owner email")}<input required type="email" dir="ltr" value={form.ownerEmail} onChange={e => set("ownerEmail", e.target.value)} /></label>
        <label>{t("Phone")}<input type="tel" dir="ltr" value={form.phone} onChange={e => set("phone", e.target.value)} /></label>
        <label>{t("Shop address")}<span className="shop-client-slug" dir="ltr"><span>/shop/</span><input required pattern="[a-z][a-z0-9\-]{2,47}" value={form.slug} onChange={e => { setSlugEdited(true); set("slug", e.target.value.toLowerCase()); }} /></span><small className="hint">{t("Lowercase English letters, numbers and dashes.")}</small></label>
        <label>{t("Plan")}<select value={form.plan} onChange={e => set("plan", e.target.value)}>{data.plans.map(p => <option key={p} value={p}>{t(p)}</option>)}</select></label>
        <label>{t("Start as")}<select value={form.status} onChange={e => set("status", e.target.value)}><option value="trial">{t("trial")}</option><option value="active">{t("active")}</option></select></label>
        <label>{t("Paid until")}<input type="date" value={form.endsAt} onChange={e => set("endsAt", e.target.value)} /><small className="hint">{t(form.status === "trial" ? "Empty = 14-day trial." : "Empty = no end date.")}</small></label>
        <label>{t("Monthly fee")} ({mode === "existing" ? chosen?.currency || "" : form.currency})<input inputMode="decimal" dir="ltr" pattern="\d{1,12}(\.\d{1,3})?" value={form.monthlyFee} onChange={e => set("monthlyFee", e.target.value)} /></label>
        <label className="wide">{t("Notes")}<textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} /></label>
      </div>
      <p className="hint">{t("This creates the company, a draft shop with starter policies, and an owner account invitation with shop manager access only.")}</p>
      <button className="primary" disabled={busy || (mode === "existing" && !companyId)}>{t(busy ? "Setting up…" : "Create shop client")}</button>
    </form>}
    {!data ? <p role="status">{t("Loading…")}</p> : <>
      <nav className="shop-client-filters" aria-label={t("Filter")}>{["all", "trial", "active", "expired", "suspended", "cancelled"].map(s => <button type="button" key={s} aria-pressed={filter === s} onClick={() => setFilter(s)}>{t(s === "all" ? "All" : s)} <b>{s === "all" ? data.clients.length : counts[s] || 0}</b></button>)}</nav>
      {!shown.length ? <p className="card hint">{t(data.clients.length ? "No clients match this filter." : "No shop clients yet. Create the first one above.")}</p> :
        <div className="shop-client-list">{shown.map(c => <article key={c.id} className="card shop-client" data-tone={tones[c.effectiveStatus]}>
          <header><div><h2><Link to={`/organization/companies/${encodeURIComponent(c.companyId)}`}>{c.companyName}</Link></h2><small className="hint">{c.ownerName} · <span dir="ltr">{c.ownerEmail}</span></small></div><span className="shop-client-status">{t(c.effectiveStatus)}</span></header>
          <dl>
            <div><dt>{t("Plan")}</dt><dd>{t(c.plan)} · <span dir="ltr">{c.monthlyFee} {c.currency}</span></dd></div>
            <div><dt>{t("Paid until")}</dt><dd>{date(c.endsAt)}</dd></div>
            <div><dt>{t("Shop")}</dt><dd>{c.shop ? <><a href={c.shop.url} target="_blank" rel="noreferrer" dir="ltr">{c.shop.url}</a> · {t(c.shop.published ? "Published" : "Draft")}</> : "—"}</dd></div>
            <div><dt>{t("Owner account")}</dt><dd>{t(c.owner === "active" ? "Activated" : c.owner === "pending" ? "Invitation sent" : c.owner === "expired" ? "Invitation expired" : "Not invited")}</dd></div>
            <div><dt>{t("Products")}</dt><dd>{c.products}</dd></div>
            <div><dt>{t("Orders")}</dt><dd>{t("{total} total · {month} this month", { total: c.orders, month: c.ordersThisMonth })}</dd></div>
          </dl>
          <div className="inline-actions">
            {c.effectiveStatus !== "suspended" && c.effectiveStatus !== "cancelled" && <button type="button" onClick={() => { if (confirm(t("Close {company}'s shop until it is reactivated?", { company: c.companyName }))) void update(c, { status: "suspended" }); }}>{t("Suspend")}</button>}
            {c.effectiveStatus !== "active" && <button type="button" className="primary" onClick={() => void update(c, { status: "active", endsAt: extend(c) })}>{t("Activate · paid 1 month")}</button>}
            {c.effectiveStatus === "active" && <button type="button" onClick={() => void update(c, { endsAt: extend(c) })}>{t("Add 1 month")}</button>}
            <select aria-label={t("Plan")} value={c.plan} onChange={e => void update(c, { plan: e.target.value })}>{data.plans.map(p => <option key={p} value={p}>{t(p)}</option>)}</select>
            {c.owner !== "active" && <button type="button" onClick={() => void reinvite(c)}>{t("New invitation link")}</button>}
          </div>
        </article>)}</div>}
    </>}
  </main>;
}
