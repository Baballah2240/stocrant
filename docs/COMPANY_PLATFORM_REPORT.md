# Stocrant company platform — implementation report

## Product direction

Stocrant manages independent companies in a shared platform. A company can use its internal business workspace without purchasing a website. A public company website is an optional service, and an online shop remains a separate commerce workflow.

This upgrade adds a working company website service and its administration interface. It preserves existing records, access rules, finance approvals and salary authorization. It does not reset companies, alter account roles, change historical money movements or automatically publish existing companies.

## Delivered

- **Company Services:** Organizations → company profile → Company services.
- **Workspace configuration:** Choose company quick links for HR, Finance, Inventory, Operations and Shops. Links retain the company context. Staff permissions continue to enforce access; these preferences are not permission grants or module licensing.
- **Optional website:** Super Admin enables/disables the service for each company. Company users with company edit permission maintain content and publication for their assigned company. Company Services requires company view permission and company-level access.
- **Separate branding and content:** Unique website address, accent color, default language, English/Arabic title, introduction, tagline, services and explicit public contact details.
- **Working public pages:** `/company/<address>` renders current published content directly from the server. No static mockup or separate manual rebuild is required to update content. Published shops belonging to the same company are linked automatically.
- **Publication checks:** Requires an enabled service, active company and organization, unique address, title/introduction in the selected language and a public contact. Draft, disabled and inactive-company pages return 404.
- **Data protection:** Public pages render an explicit public field allowlist. Internal employees, salaries, accounts and finance records are never serialized into them. Public text is HTML-escaped; colors and contact fields are validated; pages have a restrictive content security policy.
- **Concurrent edits:** Version checks reject stale saves instead of overwriting newer changes. Company service changes are recorded in the existing audit log.
- **Responsive and bilingual:** Shared website/mobile administration source, accessible form labels, keyboard focus, RTL layout and reduced-motion support.

## How to use

1. Create or open a company in Organizations. Assign its managers and employees to that company using the existing user management tools.
2. Open **Company services**. Configure the company quick links.
3. As Super Admin, enable **Website service enabled** if the company wants a website.
4. Enter a unique address such as `amal-services`. Fill the public title, introduction, services and contact details. Add Arabic/English content and choose the default language and accent color.
5. Select **Publish company website** and save. Open the displayed link. On a local installation this link is local; on a deployed server it uses that server’s public address.
6. Configure products, fulfilment, policies and checkout separately in Shops & Orders. A published company shop appears as a link on the public company page.
7. To suspend the website, unpublish it or let Super Admin disable the website service. Company business history is retained.

## Existing connected workflows retained

- Company profiles and assigned staff access.
- HR records, employee contracts, payroll and payslips.
- Finance ledger, accounts, payment references, reconciliation and reversals.
- Salary approval by the assigned company General Manager or Super Admin.
- Shop orders, storefront settings and company-scoped customer support.

## Practical limits and next product milestones

- This release provides a structured company website editor, not an unrestricted drag-and-drop page builder or arbitrary executable customer code.
- Workspace shortcuts customize navigation; they do not disable backend modules or constitute a subscription entitlement system.
- Paid plans, invoicing for Stocrant’s own service, subscription entitlements and automated provisioning are not implemented by this change.
- Custom customer domains require domain ownership verification, DNS, HTTPS certificates and hosting routing. The new company pages currently use paths under the application host.
- Existing online shop domains and publishing configuration remain separate and unchanged.
- Company website content edits use company edit authorization and an audit trail; this release does not add an editorial approval workflow for public content.
- No live deployment or Android installation is implied by committing/pushing this work. Native package rebuilds and deployment must be verified separately.
- Industry-specific workflows (for example school administration) need dedicated requirements; branding does not turn a business module into a school management system.

## Validation

- `npm run check` passed: types, server tests, translations, all web builds and production smoke checks.
- Company service integration tests passed, including cross-company read/write rejection, service provisioning, publication requirements, stale edits, duplicate addresses, HTML escaping, Arabic rendering, invalid color rejection, internal-field rejection and inactive-company hiding.
- `node scripts/verify-company-services.mjs` passed 18 layouts: company administration at 1366, 390 and 320 pixels in English/Arabic and light/dark mode; public websites at the same widths in both languages. It also saved edits through the real UI and verified they persisted.
- Final public renderer extraction, validation additions and layout refinements were followed by targeted server, frontend, translation and browser checks.
- Screenshots were visually reviewed; no production business data was used. Test fixtures and generated screenshots are excluded from source control.

To repeat the browser workflow after building, run `npm run test:company-services` (requires local Chrome).
