/** Public rendering is isolated from internal company/account records. */
type Row = Record<string, any>;
const escape = (value: unknown) => String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));

export function renderCompanyWebsite(settings: Row, store: Row | undefined, ar: boolean): string {
  const text = (key: string) => escape(ar ? settings[key + "Ar"] || settings[key] : settings[key] || settings[key + "Ar"]);
  const title = text("title"), accent = /^#[0-9a-fA-F]{6}$/.test(settings.accent) ? settings.accent : "#34786b";
  return `<!doctype html>
<html lang="${ar ? "ar" : "en"}" dir="${ar ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${text("tagline")}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${text("tagline")}">
<style>:root{--accent:${accent}
}
*{box-sizing:border-box}
body{margin:0;background:#f5f7f8;color:#1d2d36;font:17px/1.7 system-ui,sans-serif}
a{color:inherit;text-underline-offset:4px}
a:focus-visible{outline:3px solid var(--accent);outline-offset:5px}
header,main,footer{max-width:1120px;margin:auto;padding:24px}
nav strong{min-width:0;overflow-wrap:anywhere}
nav{display:flex;gap:20px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.hero{padding:clamp(32px,8vw,100px) 0}
.hero h1{font-size:clamp(36px,6vw,72px);line-height:1.15;max-width:18ch;margin:18px 0;overflow-wrap:anywhere}
.eyebrow{color:inherit;font-weight:700;border-inline-start:4px solid var(--accent);padding-inline-start:12px}
.intro{max-width:65ch;white-space:pre-line}
.grid{display:flex;gap:24px;flex-wrap:wrap}
.card{background:white;border:1px solid #dce3e7;border-radius:24px;padding:28px;flex:1 1 300px;min-width:0;overflow-wrap:anywhere}
.card p{white-space:pre-line}
h2{font-size:24px}
footer{font-size:14px;border-top:1px solid #dce3e7;margin-top:40px}
.cta{display:inline-block;border:1px solid var(--accent);border-radius:999px;padding:12px 24px;text-decoration:none;transition:background .2s}
.cta:hover{background:#e4ede9}
.contact{display:flex;gap:16px;flex-wrap:wrap}
</style>
</head>
<body>
<header>
<nav aria-label="${ar ? "التنقل" : "Navigation"}">
<strong>${title}</strong>
<div>
<a href="#contact">${ar ? "تواصل معنا" : "Contact"}</a> · <a href="?lang=${ar ? "en" : "ar"}" lang="${ar ? "en" : "ar"}">${ar ? "English" : "العربية"}</a>
</div>
</nav>
</header>
<main>
<section class="hero">
<p class="eyebrow">${text("tagline")}</p>
<h1>${title}</h1>
<p class="intro">${text("about")}</p>
<a class="cta" href="#contact">${ar ? "لنتحدث عن احتياجاتك" : "Let’s talk about your needs"}</a>${store ? ` <a class="cta" href="/shop/${encodeURIComponent(store.slug)}/">${ar ? "المتجر" : "Visit our shop"}</a>` : ""}</section>
<div class="grid">${text("services") ? `<section class="card">
<h2>${ar ? "خدماتنا" : "Our services"}</h2>
<p>${text("services")}</p>
</section>` : ""}<section class="card" id="contact">
<h2>${ar ? "تواصل معنا" : "Contact us"}</h2>
<p>${escape(settings.address)}</p>
<div class="contact">${settings.email ? `<a href="mailto:${escape(settings.email)}">${escape(settings.email)}</a>` : ""}${settings.phone ? `<a dir="ltr" href="tel:${escape(String(settings.phone).replace(/[^+\d]/g, ""))}">${escape(settings.phone)}</a>` : ""}</div>
</section>
</div>
</main>
<footer>© ${new Date().getFullYear()} ${title}</footer>
</body>
</html>`;
}
