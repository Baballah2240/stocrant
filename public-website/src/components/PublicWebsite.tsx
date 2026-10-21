import FeatureCard from "./FeatureCard";
import WorkspacePreview from "./WorkspacePreview";
import { useWebsiteMotion } from "../use-website-motion";
import { useTheme } from "../theme-context";
import ProductTour from "./ProductTour";
import { useEffect, useState, useRef } from "react";
import { api } from "../api";
import MobileIcon, { type MobileIconName } from "./MobileIcon";

const features: { icon: MobileIconName; name: string; text: string }[] = [
  { icon: "companies", name: "Companies & locations", text: "Keep your companies, locations and their activity together in one workspace." },
  { icon: "people", name: "People & HR", text: "Manage employee records, daily attendance and leave requests with clear admin control." },
  { icon: "work", name: "Daily operations", text: "Organize assignments and follow the work happening across your teams." },
  { icon: "inventory", name: "Company inventory", text: "Track items and stock movements, choose employee access, and see who changed a record." },
  { icon: "finance", name: "Money movements", text: "Follow company and employee transactions, account balances and printable reports." },
  { icon: "settings", name: "Access & accountability", text: "Give users the permissions they need, with main-admin controls and an activity audit." },
];

export default function PublicWebsite() {
  const workspaceUrl = import.meta.env.VITE_WORKSPACE_URL || "https://stocrant-web.onrender.com";
  const siteRef = useRef<HTMLDivElement>(null);
  useWebsiteMotion(siteRef);
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [contact, setContact] = useState({ email: "", phone: "" });
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void api.public.info().then(setContact).catch(() => {}); }, []);
  async function send(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api.public.contact(form); setSent(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not send your message. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="public-site" ref={siteRef}><div className="public-scroll-progress" aria-hidden="true" /><div className="public-cursor-glow" aria-hidden="true" />
    <a className="skip-link" href="#public-content">Skip to content</a>
    <header className="public-nav"><a className="public-wordmark" href="/"><span>S</span>STOCRANT</a><button className="public-theme-toggle" onClick={toggle} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">{theme === "light" ? <path d="M20 15.5A9 9 0 0 1 8.5 4a9 9 0 1 0 11.5 11.5Z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}</svg><span>{theme === "light" ? "Dark" : "Light"}</span></button><button className="public-menu-toggle" aria-label="Toggle website navigation" aria-expanded={menuOpen} aria-controls="website-navigation" onClick={() => setMenuOpen(!menuOpen)}><MobileIcon name="more" /></button><nav id="website-navigation" className={menuOpen ? "is-open" : ""} aria-label="Website navigation" onClick={() => setMenuOpen(false)}><a href="#features">Features</a><a href="#tour">Product tour</a><a href="#how">How it works</a><a href="#contact">Contact</a><a className="public-login" href={workspaceUrl}>{"Open workspace"} <MobileIcon name="chevron" /></a></nav></header>
    <main id="public-content">
      <section className="public-hero">
        <div className="public-hero-copy"><p className="hero-badge"><span /> A shared workspace for your business</p><h1>Big picture.<br />Every detail.<br /><em>All together.</em></h1><p className="public-intro">People, daily work, inventory and finances. Bring the moving parts of your business into one clear workspace with STOCRANT.</p><div className="public-actions"><a className="primary-link" href="#tour">Explore the workspace <MobileIcon name="chevron" /></a><a className="secondary-link" href="#contact">Let&apos;s talk <span aria-hidden="true">&#8599;</span></a></div><div className="hero-platforms"><span><MobileIcon name="companies" />Built for your business</span><span><MobileIcon name="profile" />Ready for your team</span></div></div>
        <WorkspacePreview />
      </section>
      <div className="public-capability-strip" aria-label="STOCRANT capabilities"><span><MobileIcon name="companies" />Company workspaces</span><span><MobileIcon name="profile" />Role-based access</span><span><MobileIcon name="attendance" />Daily attendance</span><span><MobileIcon name="files" />Printable records</span></div>
      <ProductTour />
      <section className="public-features" id="features"><div className="public-section-heading"><div><p className="eyebrow">THE WHOLE BUSINESS, CONNECTED</p><h2>Many moving parts.<br />One place to manage them.</h2></div><p>From the first check-in to the final report, give every part of the workday a place to belong.</p></div><div className="public-feature-grid">{features.map(feature => <FeatureCard key={feature.name} feature={feature} />)}</div></section>
      <section className="public-how" id="how"><div><p className="eyebrow">A workspace for every role</p><h2>Simple for employees.<br />Control for admins.</h2><p>Everyone works with the same company records. Permissions decide what each user can see and do.</p></div><ol><li><span>01</span><div><h3>Set up your business</h3><p>The main admin adds companies, locations and employee records.</p></div></li><li><span>02</span><div><h3>Connect your people</h3><p>Create accounts and assign permissions for their work.</p></div></li><li><span>03</span><div><h3>Keep the day moving</h3><p>Employees record attendance and request leave. Admins review requests and manage the business.</p></div></li></ol></section>
      <section className="public-faq" id="questions"><div><p className="eyebrow">Good questions</p><h2>Before you get started.</h2><p>Need a little more detail? Here is how STOCRANT fits into the workday.</p></div><div>{[
        ["Who is STOCRANT for?", "Teams that want company locations, employee records, daily work, stock and money movements in one shared workspace."],
        ["Can employees use it on their phones?", "Yes. STOCRANT has a responsive mobile workspace and an Android app focused on attendance, leave requests and assigned work. Managers and admins see tools permitted for their roles."],
        ["Who manages employee records?", "The main admin and authorized HR staff manage employee records according to their permissions. Employees can request leave and use their permitted workspace tools."],
        ["How does attendance work?", "Each user except the main admin can record up to three attendance sessions per day. Records follow the configured business time zone."],
        ["Can we discuss our company requirements?", "Use the contact form below to open an email draft. Send it through your email app to complete your inquiry. Include your company name and what you want to organize."]
      ].map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="public-contact" id="contact"><div><p className="eyebrow">Let's connect</p><h2>Tell us about<br />your business.</h2><p>Have a question about STOCRANT or want to discuss your team's needs? Leave a message for the main admin.</p>{contact.email && <p><a href={`mailto:${contact.email}`}>{contact.email}</a></p>}{contact.phone && <p>{contact.phone}</p>}<small>We use your details to respond to this inquiry. Please don't include passwords or confidential employee information.</small></div><div className="public-contact-card">{sent ? <div role="status"><MobileIcon name="leave" /><h3>Your email draft is ready.</h3><p>Send it in your email app to complete your inquiry.</p><button onClick={() => { setSent(false); setForm({ name: "", email: "", company: "", message: "", website: "" }); }}>Send another message</button></div> : <form onSubmit={send} aria-busy={busy}><h3>Start a conversation</h3><p className="public-form-intro">A few details help us understand what you need.</p>{!contact.email && <p role="status">Contact is currently unavailable. Please try again later.</p>}<label>Your name<input required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>Email address<input required type="email" maxLength={160} autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label>Company <span>(optional)</span><input maxLength={160} autoComplete="organization" value={form.company} onChange={event => setForm({ ...form, company: event.target.value })} /></label><label>How can we help?<textarea placeholder="Tell us about your team and what you would like to organize?" required minLength={10} maxLength={3000} rows={4} value={form.message} onChange={event => setForm({ ...form, message: event.target.value })} /></label><label className="contact-trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={event => setForm({ ...form, website: event.target.value })} /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy || !contact.email}>{busy ? "Opening email draft…" : "Open email draft"}</button></form>}</div></section>
    </main><footer className="public-footer"><strong>STOCRANT</strong><span>People. Work. Business.</span><a href="#tour">Product tour</a><a href="#questions">Questions</a><a href="#contact">Contact us</a><a href={workspaceUrl}>{"Workspace sign in"}</a><small>© {new Date().getFullYear()} STOCRANT</small></footer>
  </div>;
}
