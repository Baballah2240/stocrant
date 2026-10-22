# Public experience and website inquiries

## Routes and navigation

The integrated server serves the public explorer at /, the shop website service at /services/shop-websites, module pages at /explore/:module, and /privacy. /website/ remains a homepage alias for existing login/native links. Public assets have a separate /site-assets/ namespace. Browser management entry is /workspace; existing business URLs such as /finance and /hr retain protected modules. Native home remains / inside the bundled management app.

The full-width explorer fills the opening viewport; introductory copy follows below. Desktop hover shows a compact module preview. Click/tap opens a keyboard-dismissable dialog; shop websites opens the service page directly. Gentle floating and connection animations stop while a module is focused and respect reduced-motion preferences. There is no pause/resume control. The public root is shown even to signed-in visitors. Existing workspace authentication, records and module permissions are retained.

## Motion and scrolling

The public background uses a decorative canvas of connected stars with slow movement, size and brightness variation. It runs at a bounded 30fps with at most 95 stars (fewer on phones), pauses in hidden tabs and renders a static frame for reduced-motion users. Native document scrolling is retained; a sticky header, offset anchors and a Discover more link guide visitors between sections. Opening module details locks background scrolling and closing them restores it. Page scrolling dismisses hover previews.

Main sections have a viewport-sized minimum height. Desktop uses proximity scroll snapping below the sticky header; phones and short windows retain free scrolling. Content can exceed a viewport without clipping. Light and dark themes use distinct, high-contrast surfaces with blue accents and no tile backlight.

Login, registration, reset requests and first setup reuse the public constellation renderer and scoped palette. The browser website and workspace share `stocrant-theme` (light/dark/system), retain legacy website preference migration and follow changes from other same-origin tabs. Native apps use their own local preference and retain native appearance synchronization. Marketing scroll snapping and typography are not applied to management pages. Auth stars unmount after sign-in and never intercept form input.

## Service scope and pricing

Essentials, Connected and Custom packages show **Custom quote** because approved prices, currencies, taxes and service terms have not been supplied. The page distinguishes initial work, ongoing care and third-party fees. No amount is charged and no storefront is provisioned. Payment, shipping and STOCRANT integration requirements are assessed and agreed before implementation for a client.

The service page keeps starting-point choices, expandable package details, cost explanations and the inquiry form in one request section. A selected package is shown directly in the form summary; Help me choose resets it without clearing visitor inputs. There is one question form and no duplicate package dropdown.

## Visitor-to-staff handoff

POST /api/public/inquiries accepts name, email, mobile number, message, service/package preference, optional business/existing website, contact consent and a UUID retry key. It appends a private websiteInquiries record and staff notifications in one storage transaction, then returns only acceptance and a reference. Identical retries reuse the reference; modified content with the same key is rejected. Validation, a honeypot, a request-body limit and an in-process IP-hash limiter reduce basic abuse. The limiter resets on restart and is per process; multi-instance hosting requires a shared limiter before scaling. No public list/read/update endpoint exists.

In Customer Service, Main Admin sees all public leads. Trusted staff can receive platform inbox access through the explicit customerService.inquiries capability plus Customer Service view access. Company-scoped customerService.* does not grant platform-wide inquiry access. Main Admin must grant this capability only to platform operators. Operators can assign a lead to active Customer Service users; those users see only assigned inquiries and need edit access to change status or add private notes. Notification detail checks current inquiry access after reassignment/revocation.

New submissions notify Main Admin and explicit platform inbox staff inside STOCRANT. Assignment notifies the assignee. Staff can filter the queue, follow contact links, record notes and use New / In progress / Contacted / Quoted / Closed / Spam statuses. Version checks prevent overwriting concurrent changes. Notes and status changes never send messages to visitors automatically. Customer Service must call or email the visitor; response speed depends on staffing.

Contact data is private and absent from notification previews and inquiry audit summaries. The privacy page explains collection and manual correction/removal requests. Use existing protected runtime storage/backups. No credentials, visitor records or generated native packages belong in Git.

## Verification and deployment

npm run check covers server/frontend types, backend integration tests, translations and production routing. npm run test:public-website builds everything and uses an isolated store plus headless Chrome to verify layouts, focus/tap behavior, public submission/retry and staff follow-up in English/Arabic. Test leads never enter the production inbox.

The existing Render web service builds with npm ci --include=dev && npm run build:full. A GitHub push only supplies source; verify the live root and /api/public/info after hosting deployment completes. Reverting the source commit restores previous public routing; retain the additive private inquiry collection for follow-up. Do not remove real inquiry records as part of a code rollback.
