# STOCRANT public website

An independently built React/Vite public explorer, served by the existing STOCRANT server at /. Gentle module motion, hover focus and click/tap details introduce the protected workspace. The shop website service explains scope, quote-based packages, requirements and a public inquiry form. /website/ remains a homepage alias.

Run npm ci and npm run dev here (port 5174). The development /api proxy targets port 3000. From the repository root, npm run build:full builds both interfaces and the server; npm run test:public-website verifies the isolated visitor-to-staff flow.

The form POSTs to /api/public/inquiries and receives a durable reference. The integrated server stores the request and notifies private Customer Service inbox staff. Visitors need no account. Customer Service follows up manually; the form does not send SMS or email.

Production uses same-origin /workspace and /api by default. Optional VITE_WORKSPACE_URL and VITE_PUBLIC_API_URL are documented in .env.example. A separately hosted static site must send inquiries to the STOCRANT API and have its HTTPS origin allowed through STOCRANT_ALLOWED_ORIGINS. Static hosting also needs SPA fallback for public deep links. The configured deployment is the existing Render web service.

All package prices are **Custom quote** until the business supplies approved amounts and currencies. This release does not provision storefronts, take payments or synchronize external shops.

See [public experience operations](../docs/PUBLIC_EXPERIENCE.md).
