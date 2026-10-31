import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./LandingPage.css";

type IconName = "arrow" | "chart" | "people" | "shop" | "check" | "grid" | "menu" | "close" | "layers" | "mail" | "linkedin" | "facebook" | "x";

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    chart: <><path d="M4 4v16h16M8 15l4-5 4 2 4-7" /><path d="M16 5h4v4" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M21 20v-2a6 6 0 0 0-3-5.2" /></>,
    shop: <><path d="M4 10v10h16V10M3 4h18l1 6a3 3 0 0 1-5 2 3 3 0 0 1-5 0 3 3 0 0 1-5 0 3 3 0 0 1-5-2l1-6Z" /><path d="M9 20v-5h6v5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    layers: <><path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 6 9 7 9-7" /></>,
    linkedin: <><path d="M5 10v10M5 5v.01M10 20V10h4v2a4 4 0 0 1 7 3v5M14 20v-5" /><circle cx="5" cy="5" r="1" /></>,
    facebook: <path d="M14 21v-8h3l.5-4H14V7c0-1 .5-2 2-2h2V2h-3a5 5 0 0 0-5 5v2H7v4h3v8" />,
    x: <><path d="m4 3 12 18h4L8 3H4ZM4 21l6.5-7.5M14 10.5 20 3" /></>,
  };
  return <svg className={`aer-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

const navigation = [["#aer-features", "The workspace"], ["#aer-workflows", "Why Stocrant"], ["#aer-pricing", "Plans"]];
const workspaces: { id: string; label: string; icon: IconName; headline: string; subline: string; detail: string }[] = [
  { id: "finance", label: "Finance", icon: "chart", headline: "A clearer", subline: "financial picture.", detail: "Sales, purchases and money movements." },
  { id: "people", label: "People", icon: "people", headline: "Your people.", subline: "All together.", detail: "Employee records, contracts and payroll." },
  { id: "shops", label: "Shops", icon: "shop", headline: "From your shop", subline: "to their door.", detail: "Products, orders and customer support." },
];
const features: { icon: IconName; number: string; title: string; text: string; tags: string[] }[] = [
  { icon: "chart", number: "01", title: "Follow the money.", text: "Keep sales, purchases, banking and payroll within reach. See the records behind your financial picture.", tags: ["Finance", "Sales & purchases", "Payroll"] },
  { icon: "people", number: "02", title: "Make room for people.", text: "Bring employee profiles, HR documents and everyday work together, with access shaped around each person's role.", tags: ["Human resources", "Teams", "Permissions"] },
  { icon: "shop", number: "03", title: "Keep business moving.", text: "Connect your shop, stock and orders to the team handling them. Give customer questions a place to be answered.", tags: ["Shops & orders", "Inventory", "Customer service"] },
];
const examples = [
  { icon: "chart" as const, role: "For the finance team", quote: "Show me the transaction behind the number, so I can understand what happened.", note: "One place to follow the details." },
  { icon: "people" as const, role: "For the company manager", quote: "Give each person the tools they need, with the right company records in view.", note: "Clear responsibilities. Considered access." },
  { icon: "shop" as const, role: "For the shop team", quote: "Help us follow an order from the customer's request to the final handover.", note: "A workflow the whole team can follow." },
];
const plans = [
  { name: "Essentials", eyebrow: "A focused start", text: "A considered setup for your core day-to-day work.", items: ["An agreed set of workspaces", "Staff and role configuration", "Your company structure", "Setup requirements reviewed"], featured: false },
  { name: "Connected", eyebrow: "Bring it together", text: "Plan the connections between your people, money and operations.", items: ["A connected workflow review", "Finance, HR and operations scope", "Shop and inventory requirements", "A tailored implementation plan"], featured: true },
  { name: "Organization", eyebrow: "Room to grow", text: "Discuss a setup shaped around a broader organization.", items: ["Multiple-company requirements", "Role and access planning", "Deployment requirements reviewed", "A specification agreed with you"], featured: false },
];

function Brand({ footer = false }: { footer?: boolean }) {
  return <a href="#aer-top" className="aer-brand" aria-label="Stocrant home"><span className="aer-brand-mark" aria-hidden="true"><span /><span /><span /></span><span>stocrant<span className="aer-brand-dot">.</span>{footer && <small>Business, in balance.</small>}</span></a>;
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState(0);
  const terms = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const selected = workspaces[selectedWorkspace];
  const inquiryUrl = "/services/shop-websites#inquire";
  const shareUrl = encodeURIComponent("https://www.mohbaba.online/");

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [menuOpen]);

  return <div className="aer-landing" id="aer-top" lang="en" dir="ltr">
    <a className="aer-skip-link" href="#aer-main">Skip to content</a>
    <header className="aer-header"><div className="aer-container aer-navbar"><Brand /><button ref={menuButton} type="button" className="aer-menu-toggle" aria-expanded={menuOpen} aria-controls="aer-navigation" aria-label={menuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? "close" : "menu"} /></button><nav id="aer-navigation" className={`aer-navigation${menuOpen ? " is-open" : ""}`} aria-label="Main navigation">{navigation.map(([href, text]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{text}</a>)}<a href="/workspace" className="aer-nav-cta">Open workspace <Icon name="arrow" /></a></nav></div></header>

    <main id="aer-main">
      <section className="aer-hero aer-container" aria-labelledby="aer-hero-title">
        <div className="aer-hero-copy"><p className="aer-eyebrow"><span className="aer-led" /> A LITTLE MORE CONNECTED</p><h1 id="aer-hero-title">Your business.<br />In a better<br /><span>state of flow.</span></h1><p className="aer-lead">People, money and everyday work. Bring the moving parts of your business into one calm, connected workspace.</p><div className="aer-actions"><a className="aer-button aer-button-primary" href="/workspace">Open your workspace <Icon name="arrow" /></a><a className="aer-button aer-button-soft" href="#aer-features">Take a closer look <Icon name="grid" /></a></div><div className="aer-hero-note"><span className="aer-note-line" /><span>Less switching.<br /><strong>More perspective.</strong></span></div></div>
        <div className="aer-visual" aria-label="Interactive preview of Stocrant workspaces">
          <div className="aer-visual-caption"><span>THE CONNECTED WORKSPACE</span><span>0{selectedWorkspace + 1} / 03</span></div>
          <div className="aer-dial-stage"><div className="aer-dial-orbit" aria-hidden="true" /><div className="aer-dial-shell"><div className="aer-dial-ticks" aria-hidden="true" /><div className="aer-dial-track" aria-hidden="true" /><div className="aer-dial-face"><div className="aer-dial-symbol"><Icon name={selected.icon} /></div><p className="aer-dial-kicker">{selected.label.toUpperCase()}</p><div className="aer-dial-heading" aria-live="polite" aria-atomic="true"><strong>{selected.headline}<br />{selected.subline}</strong></div><span className="aer-dial-status"><span className="aer-led" /> Part of the bigger picture</span></div></div><div className="aer-floating-tag aer-floating-tag-top" aria-hidden="true"><span className="aer-tag-icon"><Icon name="layers" /></span><span>ONE WORKSPACE<strong>Many possibilities</strong></span></div><div className="aer-floating-tag aer-floating-tag-bottom" aria-hidden="true"><span className="aer-check-circle"><Icon name="check" /></span><span>CONNECTED BY DESIGN<strong>Everything has its place</strong></span></div></div>
          <div className="aer-dial-controls" role="group" aria-label="Preview a workspace">{workspaces.map((workspace, index) => <button key={workspace.id} type="button" data-workspace={workspace.id} aria-pressed={index === selectedWorkspace} onClick={() => setSelectedWorkspace(index)}><Icon name={workspace.icon} /><span>{workspace.label}</span></button>)}</div><p className="aer-preview-caption">{selected.detail} <span>Product illustration.</span></p>
        </div>
      </section>
      <div className="aer-connection-strip aer-container" aria-label="Connected business areas"><span>GOOD THINGS WORK TOGETHER</span><div>{["Finance", "People", "Operations", "Shops", "Inventory"].map(item => <span key={item}>{item}</span>)}</div></div>

      <section className="aer-section aer-container" id="aer-features" aria-labelledby="aer-features-title"><div className="aer-section-heading"><div><p className="aer-eyebrow">MADE FOR YOUR EVERYDAY</p><h2 id="aer-features-title">A place for every part.<br /><span>A view of the whole.</span></h2></div><p>Start with the work in front of you. Keep the connections that matter close by.</p></div><div className="aer-three-columns">{features.map(feature => <article className="aer-feature-card" key={feature.number}><div className="aer-card-top"><span className="aer-feature-icon"><Icon name={feature.icon} /></span><span>{feature.number}</span></div><h3>{feature.title}</h3><p>{feature.text}</p><div className="aer-feature-tags">{feature.tags.map(tag => <span key={tag}>{tag}</span>)}</div></article>)}</div><a className="aer-text-link" href="/explore/finance">Explore the finance workspace <Icon name="arrow" /></a></section>

      <section className="aer-workflow-section" id="aer-workflows" aria-labelledby="aer-workflows-title"><div className="aer-container"><div className="aer-section-heading"><div><p className="aer-eyebrow">BUILT AROUND REAL WORK</p><h2 id="aer-workflows-title">Different roles.<br /><span>A shared direction.</span></h2></div><p>Three examples of the everyday questions a connected workspace helps your team work through.</p></div><div className="aer-three-columns">{examples.map(example => <figure className="aer-quote-card" key={example.role}><div className="aer-quote-top"><Icon name={example.icon} /><span>ILLUSTRATIVE FEEDBACK</span></div><blockquote>{example.quote}</blockquote><figcaption><strong>{example.role}</strong><span>{example.note}</span></figcaption></figure>)}</div><p className="aer-disclosure">These are example use cases, not customer testimonials or endorsements.</p></div></section>

      <section className="aer-section aer-container" id="aer-pricing" aria-labelledby="aer-pricing-title"><div className="aer-section-heading aer-heading-centered"><div><p className="aer-eyebrow">FIND YOUR STARTING POINT</p><h2 id="aer-pricing-title">Your setup.<br /><span>At your scale.</span></h2></div><p>Every business works a little differently. Choose a direction, then agree the scope and price with us.</p></div><div className="aer-three-columns aer-plan-grid">{plans.map(plan => <article className={`aer-plan-card${plan.featured ? " is-featured" : ""}`} key={plan.name}>{plan.featured && <span className="aer-plan-badge"><span className="aer-led" /> THE CONNECTED CHOICE</span>}<p className="aer-plan-eyebrow">{plan.eyebrow}</p><h3>{plan.name}</h3><p>{plan.text}</p><div className="aer-plan-price">Let's talk<span>Personal quote · agreed scope</span></div><ul>{plan.items.map(item => <li key={item}><Icon name="check" />{item}</li>)}</ul><a className={`aer-button ${plan.featured ? "aer-button-primary" : "aer-button-soft"}`} href={inquiryUrl}>Discuss this setup <Icon name="arrow" /></a></article>)}</div><p className="aer-disclosure">Plans describe starting points for a conversation. Availability, deployment and support are confirmed in your agreed specification.</p></section>

      <section className="aer-contact aer-container" id="aer-contact" aria-labelledby="aer-contact-title"><div className="aer-contact-panel"><span className="aer-contact-orbit" aria-hidden="true" /><div><p className="aer-eyebrow"><span className="aer-led" /> A CLEARER NEXT CHAPTER</p><h2 id="aer-contact-title">Give your business<br />a little more <span>flow.</span></h2><p>Explore your workspace, or start a conversation about your shop and the connections you need.</p><div className="aer-actions"><a className="aer-button aer-button-primary" href={inquiryUrl}>Let's talk about your setup <Icon name="arrow" /></a><a className="aer-text-link" href="/workspace">Already part of Stocrant? Sign in <Icon name="arrow" /></a></div></div><div className="aer-contact-emblem" aria-hidden="true"><Icon name="layers" /></div></div></section>
    </main>

    <footer className="aer-footer"><div className="aer-container"><div className="aer-footer-top"><div className="aer-footer-brand"><Brand footer /><p>A considered space for your people, your work and everything that connects them.</p><div className="aer-socials"><a href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Share Stocrant on LinkedIn (opens a new tab)"><Icon name="linkedin" /></a><a href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Share Stocrant on Facebook (opens a new tab)"><Icon name="facebook" /></a><a href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${encodeURIComponent("Business, in balance. Explore Stocrant.")}`} target="_blank" rel="noopener noreferrer" aria-label="Share Stocrant on X (opens a new tab)"><Icon name="x" /></a></div><small>Share a little perspective.</small></div><nav className="aer-footer-column" aria-label="Product"><h3>The workspace</h3><a href="/explore/finance">Finance</a><a href="/explore/people">People & HR</a><a href="/services/shop-websites">Shops & orders</a><a href="/explore/inventory">Inventory</a></nav><nav className="aer-footer-column" aria-label="Resources"><h3>A closer look</h3><a href="#aer-features">Features</a><a href="#aer-pricing">Plans & pricing</a><a href="/services/shop-websites">Shop websites</a><a href="/sitemap.xml">Sitemap</a></nav><nav className="aer-footer-column" aria-label="Contact and legal"><h3>Here to help</h3><a href={inquiryUrl}>Contact the team <Icon name="mail" /></a><a href="/workspace">Workspace sign in</a><a href="/privacy">Privacy policy</a><button type="button" aria-controls="aer-terms-dialog" onClick={() => terms.current?.showModal()}>Terms of use</button></nav></div><div className="aer-footer-bottom"><p>© 2026 Stocrant. All rights reserved.</p><span><span className="aer-led" /> A little more clarity. A lot more possibility.</span><a href="#aer-top">Back to top <Icon name="arrow" /></a></div></div></footer>
    <dialog className="aer-terms-dialog" id="aer-terms-dialog" ref={terms} aria-labelledby="aer-terms-title" onClick={event => { if (event.target === event.currentTarget) terms.current?.close(); }}><div><div className="aer-dialog-heading"><p className="aer-eyebrow">STOCRANT</p><button type="button" className="aer-icon-button" aria-label="Close terms of use" onClick={() => terms.current?.close()}><Icon name="close" /></button></div><h2 id="aer-terms-title">Terms of use</h2><p>Browsing this website does not create an account, place an order or authorize payment.</p><p>Workspace tools require an authorized account. Use only the company records and functions permitted by your role. Keep your sign-in details private and provide accurate information when contacting the team.</p><p>Product examples are illustrative. Pricing, deployment, service scope and support are agreed separately with your organization before a service is supplied.</p><p>For a question about your account or an agreed service, contact the team or your organization administrator. See our <a href="/privacy">privacy information</a> for details about inquiry data.</p><button type="button" className="aer-button aer-button-primary" onClick={() => terms.current?.close()}>Close and continue <Icon name="check" /></button></div></dialog>
  </div>;
}
