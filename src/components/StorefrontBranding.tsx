import { useLanguage } from "../language-context";
import "../storefront-branding.css";

export type Branding = { template: string; primaryColor: string; accentColor: string; font: string; banner: string; heroTitle: string; heroSubtitle: string; aboutTitle: string; aboutImage: string; whatsapp: string; instagram: string; facebook: string; tiktok: string; faq: { question: string; answer: string }[]; seoTitle: string; seoDescription: string; customDomain: string };
export const templates: { id: string; label: string; hint: string; primaryColor: string; accentColor: string; font: string }[] = [
  { id: "classic", label: "Classic", hint: "Calm and natural, for everyday goods.", primaryColor: "#244c40", accentColor: "#b78d52", font: "serif" },
  { id: "fashion", label: "Fashion", hint: "Editorial and sharp, for clothing and beauty.", primaryColor: "#1f1a17", accentColor: "#c2185b", font: "serif" },
  { id: "electronics", label: "Electronics", hint: "Clean and technical, for devices and accessories.", primaryColor: "#1d4ed8", accentColor: "#0ea5e9", font: "sans" },
  { id: "food", label: "Food", hint: "Warm and friendly, for restaurants and groceries.", primaryColor: "#9a3412", accentColor: "#f59e0b", font: "rounded" },
  { id: "minimal", label: "Minimal", hint: "Black and white, lets products speak.", primaryColor: "#111111", accentColor: "#6b7280", font: "sans" },
];
export const defaultBranding: Branding = { template: "classic", primaryColor: "#244c40", accentColor: "#b78d52", font: "serif", banner: "", heroTitle: "", heroSubtitle: "", aboutTitle: "", aboutImage: "", whatsapp: "", instagram: "", facebook: "", tiktok: "", faq: [], seoTitle: "", seoDescription: "", customDomain: "" };
const onColor = (hex: string) => { const n = parseInt(hex.slice(1), 16) || 0, l = (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? "#14221d" : "#fffdf5"; };
const fonts: Record<string, string> = { serif: 'Georgia, "Times New Roman", serif', sans: 'Inter, "Segoe UI", Arial, sans-serif', rounded: '"Nunito", "Segoe UI Rounded", "Arial Rounded MT Bold", sans-serif' };

/** Shop design editor: template, colours, font, banner, home and About text, social links, FAQ, link-preview text and custom domain, with a live preview. */
export default function StorefrontBranding({ value, onChange, shop }: { value: Branding; onChange: (value: Branding) => void; shop: { name: string; tagline: string; description: string; logo: string; slug: string } }) {
  const { t } = useLanguage();
  const b = { ...defaultBranding, ...value }, set = (changes: Partial<Branding>) => onChange({ ...b, ...changes });
  const text = (label: string, key: keyof Branding, extra: Record<string, unknown> = {}) => <label className="form-field"><span>{t(label)}</span><input value={String(b[key] ?? "")} onChange={e => set({ [key]: e.target.value } as Partial<Branding>)} {...extra} /></label>;
  const radius = b.template === "fashion" ? 0 : b.template === "food" ? 999 : b.template === "electronics" ? 12 : 6;
  const host = typeof window !== "undefined" ? window.location.host : "";
  return <section className="shop-form storefront-branding">
    <h3>{t("Design & brand")}</h3>
    <div className="branding-layout">
      <div className="branding-controls">
        <fieldset className="branding-templates"><legend>{t("Ready-made design")}</legend>
          {templates.map(tpl => <label key={tpl.id} data-selected={b.template === tpl.id}><input type="radio" name="shop-template" checked={b.template === tpl.id} onChange={() => set({ template: tpl.id, primaryColor: tpl.primaryColor, accentColor: tpl.accentColor, font: tpl.font })} />
            <span className="branding-swatch" style={{ background: `linear-gradient(135deg, ${tpl.primaryColor} 60%, ${tpl.accentColor} 60%)` }} aria-hidden="true" /><strong>{t(tpl.label)}</strong><small>{t(tpl.hint)}</small></label>)}
        </fieldset>
        <div className="shop-two-columns">
          <label className="form-field"><span>{t("Brand colour")}</span><span className="branding-color"><input type="color" value={b.primaryColor} onChange={e => set({ primaryColor: e.target.value })} /><input dir="ltr" value={b.primaryColor} onChange={e => set({ primaryColor: e.target.value })} pattern="#[0-9a-fA-F]{6}" /></span></label>
          <label className="form-field"><span>{t("Accent colour")}</span><span className="branding-color"><input type="color" value={b.accentColor} onChange={e => set({ accentColor: e.target.value })} /><input dir="ltr" value={b.accentColor} onChange={e => set({ accentColor: e.target.value })} pattern="#[0-9a-fA-F]{6}" /></span></label>
          <label className="form-field"><span>{t("Heading font")}</span><select value={b.font} onChange={e => set({ font: e.target.value })}><option value="serif">{t("Elegant (serif)")}</option><option value="sans">{t("Modern (sans-serif)")}</option><option value="rounded">{t("Friendly (rounded)")}</option></select></label>
          {text("Banner photo URL", "banner", { type: "url", dir: "ltr", placeholder: "https://" })}
          {text("Home headline", "heroTitle", { maxLength: 120, placeholder: t("A little more care.") })}
          {text("Home sub-headline", "heroSubtitle", { maxLength: 160 })}
          {text("About page title", "aboutTitle", { maxLength: 120 })}
          {text("About page photo URL", "aboutImage", { type: "url", dir: "ltr", placeholder: "https://" })}
        </div>
        <p className="hint">{t("Brand colours apply in light mode. Dark mode keeps readable default colours. The About page uses the shop description; leave a blank line between paragraphs.")}</p>
      </div>
      <aside className="branding-preview" aria-label={t("Live preview")}>
        <small className="hint">{t("Live preview")}</small>
        <div className="branding-preview-frame" style={{ ["--p" as string]: b.primaryColor, ["--a" as string]: b.accentColor, ["--on" as string]: onColor(b.primaryColor), ["--r" as string]: radius + "px", ["--f" as string]: fonts[b.font] || fonts.serif }} data-template={b.template}>
          <div className="bp-bar">{shop.tagline || t("Free delivery inside the city")}</div>
          <div className="bp-header">{shop.logo && <img src={shop.logo} alt="" />}<strong>{shop.name || t("Shop name")}</strong><span>{t("Collection")} · {t("About")} · {t("Contact")}</span></div>
          <div className="bp-hero"><div><h4>{b.heroTitle || t("A little more care.")}</h4><p>{b.heroSubtitle || shop.description || t("Your shop description appears here.")}</p><span className="bp-button">{t("Shop the collection")}</span></div><div className="bp-art" style={b.banner ? { backgroundImage: `url("${b.banner.replace(/"/g, "")}")` } : undefined} /></div>
          <div className="bp-products">{[1, 2, 3].map(i => <div key={i}><span /><b>{t("Product")} {i}</b><small>{t("Price")}</small></div>)}</div>
        </div>
      </aside>
    </div>
    <h4>{t("Social links")}</h4>
    <div className="shop-two-columns">
      {text("WhatsApp number", "whatsapp", { type: "tel", dir: "ltr", placeholder: "+249912345678" })}
      {text("Instagram link", "instagram", { type: "url", dir: "ltr", placeholder: "https://instagram.com/…" })}
      {text("Facebook link", "facebook", { type: "url", dir: "ltr", placeholder: "https://facebook.com/…" })}
      {text("TikTok link", "tiktok", { type: "url", dir: "ltr", placeholder: "https://tiktok.com/@…" })}
    </div>
    <p className="hint">{t("A WhatsApp number shows a chat button on every page of the shop.")}</p>
    <h4>{t("Frequently asked questions")}</h4>
    {b.faq.map((item, i) => <div className="branding-faq" key={i}>
      <label className="form-field"><span>{t("Question")}</span><input maxLength={200} value={item.question} onChange={e => set({ faq: b.faq.map((f, j) => j === i ? { ...f, question: e.target.value } : f) })} /></label>
      <label className="form-field"><span>{t("Answer")}</span><textarea rows={2} maxLength={1500} value={item.answer} onChange={e => set({ faq: b.faq.map((f, j) => j === i ? { ...f, answer: e.target.value } : f) })} /></label>
      <button type="button" onClick={() => set({ faq: b.faq.filter((_, j) => j !== i) })}>{t("Remove")}</button>
    </div>)}
    {b.faq.length < 20 && <button type="button" onClick={() => set({ faq: [...b.faq, { question: "", answer: "" }] })}>{t("Add question")}</button>}
    <h4>{t("Google & link previews")}</h4>
    <div className="shop-two-columns">
      {text("Search title", "seoTitle", { maxLength: 70, placeholder: shop.name })}
      {text("Search description", "seoDescription", { maxLength: 160, placeholder: shop.tagline })}
    </div>
    <div className="branding-seo-preview" aria-label={t("Search result preview")}><small dir="ltr">{b.customDomain || host}/shop/{shop.slug}</small><strong>{b.seoTitle || [shop.name, shop.tagline].filter(Boolean).join(" — ")}</strong><p>{b.seoDescription || shop.description || shop.tagline}</p></div>
    <p className="hint">{t("Shown on Google and when the shop link is shared on WhatsApp or Facebook. The banner photo, or the logo, is used as the preview picture.")}</p>
    <h4>{t("Custom domain")}</h4>
    {text("Domain", "customDomain", { dir: "ltr", placeholder: "www.yourshop.com" })}
    {b.customDomain && <ol className="hint branding-dns">
      <li>{t("At the domain provider, add a CNAME record for {domain} pointing to {host}.", { domain: b.customDomain, host })}</li>
      <li>{t("Add {domain} as a custom domain in the hosting service so it issues an HTTPS certificate.", { domain: b.customDomain })}</li>
      <li>{t("Publish the shop. Once DNS is active, {domain} opens this shop directly.", { domain: b.customDomain })}</li>
    </ol>}
  </section>;
}
