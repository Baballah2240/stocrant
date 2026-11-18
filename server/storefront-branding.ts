/** Shop design: ready-made templates, brand colours and fonts, banner, social links, About/FAQ content,
 * search/social preview text and an optional custom domain. Merchant text is stored as entered. */
import { z } from "zod";
import { getCollection } from "./storage.js";

type Row = Record<string, any>;
export const SHOP_TEMPLATES = ["classic", "fashion", "electronics", "food", "minimal"] as const;
export const SHOP_FONTS = ["serif", "sans", "rounded"] as const;
/** Default colours and font for each template; merchants can override them. */
export const TEMPLATE_PRESETS: Record<(typeof SHOP_TEMPLATES)[number], { primaryColor: string; accentColor: string; font: (typeof SHOP_FONTS)[number] }> = {
  classic: { primaryColor: "#244c40", accentColor: "#b78d52", font: "serif" },
  fashion: { primaryColor: "#1f1a17", accentColor: "#c2185b", font: "serif" },
  electronics: { primaryColor: "#1d4ed8", accentColor: "#0ea5e9", font: "sans" },
  food: { primaryColor: "#9a3412", accentColor: "#f59e0b", font: "rounded" },
  minimal: { primaryColor: "#111111", accentColor: "#6b7280", font: "sans" },
};
const color = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #244c40.");
const https = z.union([z.literal(""), z.string().trim().max(2000).url().refine(v => v.startsWith("https://"), "Use an HTTPS link.")]);
const image = z.union([https, z.string().regex(/^\/api\/shop-images\/[A-Za-z0-9_-]{1,120}$/)]);
const domain = z.union([z.literal(""), z.string().trim().toLowerCase().max(253).regex(/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a domain like www.example.com, without https://.")]);
export const brandingSchema = z.object({
  template: z.enum(SHOP_TEMPLATES).default("classic"),
  primaryColor: color.default(TEMPLATE_PRESETS.classic.primaryColor),
  accentColor: color.default(TEMPLATE_PRESETS.classic.accentColor),
  font: z.enum(SHOP_FONTS).default("serif"),
  banner: image.default(""),
  heroTitle: z.string().trim().max(120).default(""),
  heroSubtitle: z.string().trim().max(160).default(""),
  aboutTitle: z.string().trim().max(120).default(""),
  aboutImage: image.default(""),
  whatsapp: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 ]{7,20}$/, "Enter the WhatsApp number with country code, like +249912345678.")]).default(""),
  instagram: https.default(""),
  facebook: https.default(""),
  tiktok: https.default(""),
  faq: z.array(z.object({ question: z.string().trim().min(1).max(200), answer: z.string().trim().min(1).max(1500) }).strict()).max(20).default([]),
  seoTitle: z.string().trim().max(70).default(""),
  seoDescription: z.string().trim().max(160).default(""),
  customDomain: domain.default(""),
}).strict();
export type Branding = z.infer<typeof brandingSchema>;
export const defaultBranding: Branding = brandingSchema.parse({});
export function brandingFor(s: Row): Branding { const parsed = brandingSchema.safeParse(s.branding ?? {}); return parsed.success ? parsed.data : defaultBranding; }

/** The application's own hostnames can never be claimed as a shop domain. */
function platformHosts() {
  const hosts = new Set(["localhost", "127.0.0.1"]);
  for (const value of [process.env.STOCRANT_APP_URL, process.env.STOCRANT_PUBLIC_URL]) { try { if (value) hosts.add(new URL(value).hostname.toLowerCase()); } catch { /* ignored */ } }
  return hosts;
}
export function validateBranding(b: Branding, storefrontId: string | undefined, requestHost: string) {
  if (!b.customDomain) return;
  if (platformHosts().has(b.customDomain) || b.customDomain === requestHost.toLowerCase().split(":")[0]) throw Object.assign(new Error("Use the shop's own domain, not the Stocrant address."), { statusCode: 400 });
  if ((getCollection("shopStorefronts") as Row[]).some(s => s.id !== storefrontId && brandingFor(s).customDomain === b.customDomain)) throw Object.assign(new Error("This domain is already connected to another shop."), { statusCode: 409 });
}
/** Published shop whose saved custom domain matches the request host. */
export function slugForDomain(hostname: string) {
  const host = hostname.toLowerCase();
  // Runs on every page request: compare the stored (already validated) value instead of re-parsing every shop.
  return (getCollection("shopStorefronts") as Row[]).find(s => s.published && s.branding?.customDomain === host)?.slug as string | undefined;
}

const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Rewrites the shop page head so search engines and WhatsApp/Facebook link previews show the shop's own name, text and image. */
export function shopHead(html: string, s: Row | undefined, origin: string) {
  if (!s) return html;
  // Draft shops keep the generic page head so their unpublished name and text are not exposed.
  if (!s.published) return html.replace(/<meta name="robots"[^>]*>/g, "").replace("</head>", `<meta name="robots" content="noindex"/></head>`);
  const b = brandingFor(s), title = b.seoTitle || [s.name, s.tagline].filter(Boolean).join(" — "), description = b.seoDescription || s.description || s.tagline || s.name;
  const abs = (v: string) => !v ? "" : v.startsWith("/") ? origin + v : v;
  const picture = abs(b.banner || s.logo || ""), icon = abs(s.logo || "");
  const tags = [
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(description)}"/>`,
    `<meta name="theme-color" content="${escape(b.primaryColor)}"/>`,
    s.published ? "" : `<meta name="robots" content="noindex"/>`,
    `<meta property="og:type" content="website"/>`, `<meta property="og:site_name" content="${escape(String(s.name))}"/>`,
    `<meta property="og:title" content="${escape(title)}"/>`, `<meta property="og:description" content="${escape(description)}"/>`,
    picture ? `<meta property="og:image" content="${escape(picture)}"/>` : "", `<meta name="twitter:card" content="${picture ? "summary_large_image" : "summary"}"/>`,
    icon ? `<link rel="icon" href="${escape(icon)}"/>` : "",
  ].filter(Boolean).join("");
  return html.replace(/<title>[\s\S]*?<\/title>/, "").replace(/<meta name="(description|robots|theme-color)"[^>]*>/g, "").replace("</head>", tags + "</head>");
}
