import { useState, useEffect } from "react";
import "./LandingPage.css";

const SVG = {
  logo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  testimonials: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21v-2a4 4 0 0 1 4-4h14a4 4 0 0 1 4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 3a10 10 0 0 1-3.14 1.53 4 4 0 0 0-7.86 3v1A10 10 0 0 0 3 4.63a4 4 0 0 0 2.74 7.82A4 4 0 0 1 1.5 6.63a5 5 0 0 0 9.17 10.85A10 10 0 0 1 22 12z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="17.5" x2="17.51" y2="17.5" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.8 19.8 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
};

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#testimonials", label: "Testimonials" },
  { href: "#pricing", label: "Pricing" },
  { href: "#about", label: "About" },
];

const features = [
  {
    title: "Real-time climate dial",
    body: "Monitor ambient conditions with a responsive neumorphic interface that reacts to every input.",
    icon: SVG.clock,
  },
  {
    title: "Precision controls",
    body: "Fine-tune temperature and airflow with soft, tactile feedback designed for all-day use.",
    icon: SVG.users,
  },
  {
    title: "Secure cloud sync",
    body: "Your climate profile stays encrypted and synchronized across every device you own.",
    icon: SVG.shield,
  },
];
const testimonials = [
  {
    name: "Elena Rivers",
    role: "Product Designer",
    text: "The climate dial transforms how I manage my workspace. Beautiful, calm, and effortless.",
    stars: 5,
  },
  {
    name: "Marcus Tan",
    role: "Architect",
    text: "Neumorphism done right — soft shadows, buttery transitions, and a UI that feels alive.",
    stars: 5,
  },
  {
    name: "Sophie Chen",
    role: "Engineer",
    text: "I never thought a climate control interface could be this enjoyable to use every day.",
    stars: 4,
  },
];

const pricing = [
  {
    name: "Starter",
    price: "$0",
    period: "/mo",
    desc: "Perfect for personal use.",
    featured: false,
    items: ["Climate dial access", "Basic presets", "Cloud sync", "Community support"],
  },
  {
    name: "Professional",
    price: "$14",
    period: "/mo",
    desc: "For growing teams.",
    featured: true,
    items: ["Unlimited dials", "Advanced presets", "Priority sync", "24/7 support", "Team workspaces"],
  },
  {
    name: "Enterprise",
    price: "$49",
    period: "/mo",
    desc: "For large organisations.",
    featured: false,
    items: ["Unlimited everything", "Custom branding", "SSO & audit logs", "Dedicated success manager", "SLA guarantee"],
  },
];
export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <main className="aer-surface" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav className="aer-navbar">
        <div className="aer-container">
          <a href="/" className="aer-logo" aria-label="AER home">
            <div className="aer-logo-mark">{SVG.logo}</div>
            <span className="aer-logo-text">AER<span> Climate Dial</span></span>
          </a>
          <div className="aer-nav-links">
            {navLinks.map((n) => (
              <a key={n.href} href={n.href} className="aer-nav-link">{n.label}</a>
            ))}
          </div>
          <div className="aer-nav-actions">
            <a href="#pricing" className="aer-btn aer-btn-outline">Pricing</a>
            <a href="/login" className="aer-btn aer-btn-outline" style={{ marginRight: 8 }}>Sign in</a>
            <a href="#contact" className="aer-btn aer-btn-primary">Get Started</a>
          </div>
        </div>
      </nav>
      <section className="aer-hero" id="hero">
        <div className="aer-container">
          <div className="aer-hero-content">
            <div className="aer-hero-kicker">{SVG.clock} Climate control, reimagined</div>
            <h1 className="aer-h1">Breathe easier with <span style={{ color: "var(--aer-secondary-1)" }}>AER.</span></h1>
            <p className="aer-lead">
              A neumorphic climate dial that blends soft light, gentle shadows, and precision
              controls into a single, calm interface for your environment.
            </p>
            <div className="aer-hero-buttons">
              <a href="#features" className="aer-btn aer-btn-primary">{SVG.users} Explore Features</a>
              <a href="#testimonials" className="aer-btn aer-btn-outline">{SVG.testimonials} See Testimonials</a>
            </div>
          </div>
          <div className="aer-dial-wrap">
            <div className="aer-dial-glow" />
            <div className="aer-dial-ring" />
            <div className="aer-dial">
              <div className="aer-dial-face" />
              <div className="aer-dial-center" />
              <div className="aer-dial-needle" />
            </div>
          </div>
        </div>
      </section>
      <section className="aer-features" id="features">
        <div className="aer-container aer-text-center">
          <h2 className="aer-h2">Designed for calm control</h2>
          <p className="aer-p" style={{ maxWidth: "600px", margin: "0 auto 48px" }}>
            Every interaction is shaped by neumorphism — soft depth, tactile response, and
            gradients that follow the light.
          </p>
          <div className="aer-feature-grid">
            {features.map((f, i) => (
              <article key={i} className="aer-card aer-feature-card">
                <div className="aer-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="aer-testimonials" id="testimonials">
        <div className="aer-container aer-text-center">
          <h2 className="aer-h2">What creators say</h2>
          <p className="aer-p" style={{ maxWidth: "600px", margin: "0 auto 40px" }}>
            Join designers, engineers, and teams who shape their environment with AER.
          </p>
          <div className="aer-testimonial-grid">
            {testimonials.map((t, i) => (
              <article key={i} className="aer-card aer-testimonial-card">
                <div className="aer-stars">
                  {[...Array(t.stars)].map((_, s) => (
                    <SVG.star key={s} />
                  ))}
                </div>
                <p>{t.text}</p>
                <div className="aer-testimonial-author">
                  <div className="aer-author-avatar">{SVG.users}</div>
                  <div className="aer-author-info">
                    <h4>{t.name}</h4>
                    <span>{t.role}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="aer-pricing" id="pricing">
        <div className="aer-container aer-text-center">
          <h2 className="aer-h2">Simple, transparent pricing</h2>
          <p className="aer-p" style={{ maxWidth: "600px", margin: "0 auto 40px" }}>
            Choose the tier that fits your climate. Upgrade or cancel anytime.
          </p>
          <div className="aer-pricing-grid">
            {pricing.map((plan, i) => (
              <article key={i} className={`aer-card aer-pricing-card${plan.featured ? " highlight" : ""}`}>
                {plan.featured && <div className="aer-badge">Most popular</div>}
                <h3>{plan.name}</h3>
                <div className="aer-price">{plan.price}<span>{plan.period}</span></div>
                <p>{plan.desc}</p>
                <ul className="aer-feature-list">
                  {plan.items.map((item, j) => (
                    <li key={j}>
                      {SVG.check} {item}
                    </li>
                  ))}
                </ul>
                <a href="#contact" className="aer-btn aer-btn-primary" style={{ width: "100%" }}>
                  Get started
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="aer-cta" id="contact">
        <div className="aer-container aer-text-center">
          <div className="aer-cta-content">
            <h2 className="aer-h2">Ready to shape your climate?</h2>
            <p className="aer-p">
              Join thousands of teams already breathing easier with AER.
            </p>
            <div className="aer-cta-buttons">
              <a href="#" className="aer-btn aer-btn-primary">{SVG.phone} Contact Sales</a>
              <a href="#" className="aer-btn aer-btn-outline">{SVG.mail} hello@aer.climate</a>
            </div>
          </div>
        </div>
      </section>
      <footer className="aer-footer">
        <div className="aer-container">
          <div className="aer-footer-brand">
            <a href="/" className="aer-logo" aria-label="AER home">
              <div className="aer-logo-mark">{SVG.logo}</div>
              <span className="aer-logo-text">AER<span> Climate Dial</span></span>
            </a>
            <p>
              A neumorphic climate dial for calm, precise environmental control. Designed in the
              2020s digital era, built for light-mode clarity.
            </p>
            <div className="aer-socials">
              <a href="#" className="aer-social" aria-label="Facebook">{SVG.facebook}</a>
              <a href="#" className="aer-social" aria-label="Twitter">{SVG.twitter}</a>
              <a href="#" className="aer-social" aria-label="Instagram">{SVG.instagram}</a>
              <a href="#" className="aer-social" aria-label="LinkedIn">{SVG.linkedin}</a>
            </div>
          </div>
          <div className="aer-footer-col">
            <h4>Product</h4>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#testimonials">Testimonials</a></li>
              <li><a href="#about">About</a></li>
            </ul>
          </div>
          <div className="aer-footer-col">
            <h4>Legal</h4>
            <ul>
              <li><a href="/privacy">Privacy Policy</a></li>
              <li><a href="/terms">Terms of Use</a></li>
              <li><a href="/cookies">Cookie Policy</a></li>
              <li><a href="/legal">Legal Notice</a></li>
            </ul>
          </div>
          <div className="aer-footer-col">
            <h4>Contact</h4>
            <ul>
              <li><a href="mailto:hello@aer.climate">{SVG.mail} hello@aer.climate</a></li>
              <li><a href="tel:+15550100">{SVG.phone} +1 (555) 0100</a></li>
              <li><a href="/support">{SVG.globe} Support Center</a></li>
              <li><a href="/careers">{SVG.users} Careers</a></li>
            </ul>
          </div>
          <div className="aer-footer-col">
            <h4>SEO & Resources</h4>
            <ul>
              <li><a href="/sitemap">Sitemap</a></li>
              <li><a href="/rss">RSS Feed</a></li>
              <li><a href="/press">Press Kit</a></li>
              <li><a href="/api">API Docs</a></li>
            </ul>
          </div>
        </div>
        <div className="aer-footer-bottom">
          <p className="aer-copy">© 2026 AER Climate Dial. All rights reserved.</p>
          <div className="aer-footer-seo">
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Use</a>
            <a href="/contact">Contact</a>
            <a href="/sitemap">Sitemap</a>
          </div>
        </div>
      </footer>
    </main>
  );
}