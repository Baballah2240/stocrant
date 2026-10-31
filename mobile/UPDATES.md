# Mobile update history

## 2026-10-31 - AER climate dial landing page

- Add shared public landing page (AER — climate dial) with neumorphism design system.
- Sections: sticky navbar, hero with animated dial visual, features, testimonials, pricing tiers, final CTA, and full footer with legal/SEO links.
- Design tokens: --aer-bg #E8EEF2, --aer-shade #c3ccd4, --aer-hi #ffffff, --aer-led #7db86a, --aer-ink #4a5a66; secondary #4db8e8 / #4a5a66 / #8a99a5.
- All interactive elements use cursor-pointer, transition-all hover states, and active pressed states.
- Fully responsive: vertical stack on mobile, 3-column grid on tablet/desktop.
- Inline SVG icons only (no emojis). SEO, viewport, and Open Graph meta tags in index.html.
- Public route at "/" and "/aer"; served before the auth wall so unauthenticated visitors see the landing page.
- Source-only update: no native APK built or installed for this change.

## 2026-10-30 - Mobile workspace layout refresh

- Add a compact, sticky mobile header with the current section; remove the unnecessary Back control on Home. Keep account navigation, profile, language, appearance and notifications accessible.
- Present authorized workspace services as a two-column grid in More, with a compact account card. Add a Finance shortcut to the Super Admin's bottom navigation; preserve the employee's personal tabs, permission-based Work tab and existing permission checks.
- Use consistent page spacing, safe-area clearance, wrapping actions and touch targets. Contain organization table headings within their scroller so they do not expand the phone viewport.
- Present HR employees as labelled phone cards while retaining sorting, search, profile links and permitted actions. Desktop employee tables retain their table layout.
- Add isolated browser verification for English/Arabic, light/dark, 360/390/700-pixel screens, simulated native tablet layout, drawer focus/Escape/navigation, employee form/profile and restricted employee navigation.
- Verification: the complete check command passed 276 tests plus type checks, builds, storage and production smoke checks. The mobile matrix covers 96 layouts and interaction regressions; desktop employee tables retain their original layout.
- Built Android 1.0.2 (version code 2). Its signature is valid and matches the previous local testing APK; all 67 bundled web assets match the new frontend build. No Android device was connected for installation or hardware testing.
- Android update uses bundled assets, the existing HTTPS server default and debug signing. Build/save verification and the exact source commit/checksum are recorded separately in ignored `mobile/releases/latest.json`; installation is not automatic.

## 2026-10-26 - Approved employee contract PDFs

- Add HR contract management covering every assigned employee, private PDF uploads/replacements and versioned HR Manager drafts. Require Company Manager approval for each published revision; other roles cannot author contracts.
- Deliver approved PDFs to the employee's own account/profile and Documents with easy downloading. Keep the previous approved PDF visible during new reviews, retain historical files, notify the employee and audit all transitions.
- Block generic contract/document editing bypasses, stale approvals, cross-company access and employee draft downloads. Include English/Arabic desktop/mobile layouts; no native build or installation performed.

## 2026-10-26 - One active session per user

- Limit ordinary accounts to one active browser/native login. Require signing out of the old session or explicitly closing it from the new sign-in screen after password verification. Super Admin retains concurrent access.
- Enforce the policy on the server for cookies and native bearer tokens, including concurrent logins, expired sessions, legacy duplicate sessions and role changes. Audit explicit session replacement.
- Check session validity on focus and while visible so a replaced session returns to sign-in. Include English and Arabic recovery copy. No native build or installation performed.

## 2026-10-26 - Animated lock-screen background

- Add the public website's drifting constellation effect behind the workspace lock card in light/dark themes and mobile layouts.
- Keep the form opaque and interactive; bound canvas resolution/particle count, pause when hidden, stop on unlock and respect reduced-motion preferences.
- No native build or installation performed.

## 2026-10-26 - Parent and reverse order numbers

- Assign random unique SO order numbers and persistent RV reverse-order numbers linked to their parent. Add stable numbers to existing orders and returns without changing internal IDs or financial history.
- Search orders by number, start a reverse order from its parent, and enter a parent number in Shop returns. Preserve the existing paid full-return, stock, approval and refund safeguards.
- Show parent numbers on customer receipts and printed labels. No native build or installation performed.

## 2026-10-26 - Shop sales dashboard, returns and labels

- Add Sales dashboard and Shop returns inside Shop settings. Show exact shop sales, credits, collections, refunds and gross profit using dispatch-time product costs; flag historical missing costs instead of estimating profit.
- Let authorized shop managers set product unit costs and create one full-order return for a fully paid dispatched/delivered order. Optional restocking is atomic and duplicate protected. Actual refunds remain linked Finance confirmations.
- Add printable order and return labels with customer, items and tracking/reference details. Include keyboard-accessible previews and print-only layout.
- Shared website/mobile source updated. No native build or installation performed.

## 2026-10-25 - Shop workflow and layout improvements

- Keep shop navigation visible with wrapping tabs; add order-stage counts and filters plus a per-order progress guide and next-step instructions.
- Disable dispatch until required tracking is entered, and disable completion until the configured full-payment requirement is met. Retain server-side validation.
- Use a desktop settings sidebar and compact mobile settings cards; group completion rules and payment methods with an unsaved-changes indicator.
- Improve storefront form grouping and mobile checkboxes. No native build or installation performed.

## 2026-10-25 - Shop settings section

- Add a clearly labeled settings section in Shops & orders, with responsive cards for orders/payments, storefront, shop users and connections.
- Keep every store setting accessible from the same section, including publishing, layout, offers, delivery, policies, payment controls, staff and integration keys. Include English and Arabic descriptions.
- No native build or installation performed.

## 2026-10-25 - Connected shop payments and management

- Record confirmed order payments inside Shops with one shared Finance transaction and reference; preserve ledger validation, duplicate protection and company scope.
- Group order/payment controls, storefront, shop users and connections under Shop settings. Configure payment methods, account, tracking and full-payment completion requirements.
- Let assigned Shop Managers create and manage Shop Staff and Customer Service accounts, and approve their shop workflow immediately. Protect other companies and platform accounts.
- Shared website/mobile source updated; no native build or installation performed.

## 2026-10-25 - Super Admin and additional owner login

- Clearly label the protected platform-wide owner role Super Admin, retaining existing Main Manager/Main Administrator account IDs and logins. Show global user control in Access & Settings and prevent custom roles from imitating the protected name.
- Preserve full access for owner accounts with legacy own-record restrictions; company admins and managers retain their company scopes.
- Add an authenticated Render Shell command to generate and verify an additional Super Admin login without archiving companies or disabling existing users. Require a unique email and password change at first sign-in. Live account creation remains an explicit runtime action.
- No native build or installation performed.

## 2026-10-25 - Role editor crash fix

- Fix Create role and Edit role crashing when rendering Shops permissions. Add the Shops & orders label and a safe display-name fallback for future permission modules, including search and permission previews.
- Verify actual role creation and editing with shop permissions, immediate Main changes, and English/Arabic desktop/mobile forms. No native build or installation performed.

## 2026-10-25 - Main Administrator rule editing

- Add approval-rule editing in Access & Settings: create rules, change their section/action and enable or disable them. Keep role creation/editing available to Main Admin.
- Validate rule edits and reject duplicates and unrelated fields. Keep changes immediate and audited; other admins cannot change global rules. Approval rules continue to apply to other users.
- No native build or installation performed.

## 2026-10-25 - Administrator handover

- Allow the Main Administrator to disable an unchanged account after its company or role is archived. Keep reactivation and scope-change validation, designated-admin protection and last-Main protection.
- Allow organization edits to retain their existing designated-admin fields; changes to those fields still use the dedicated assignment controls.
- Add a Render Shell handover command that verifies a private backup and replacement Main login before archiving companies/organizations and disabling old users through the running API. Keep all business records. The command must be run explicitly; source publication does not perform a live handover.
- No native build or installation performed.

## 2026-10-25 - Company Customer Service

- Show company questions and shop conversations only within the staff account's assigned company. Allow Customer Service staff to read and reply to that shop's support requests without shop-management or Finance access.
- Automatically use the assigned company for questions and appointments, and hide company selectors for single-company staff in Customer Service and Shops. Keep company selection for Main Admin and explicitly assigned multi-company accounts.
- Keep platform website inquiries behind explicit platform-inbox access. Keep reply and resolution permissions separate. No native build or installation performed.

## 2026-10-25 - Assigned company access

- Restrict admins and managers to explicitly assigned companies across company selectors, business records, Finance, payroll, reports, exports and audit history. Keep the platform Main Administrator's access to all companies.
- Add company selection when assigning an Organization Admin and when editing account access. Organization membership alone no longer grants access to sibling or newly created companies; accounts without company assignments see no company records.
- Preserve role, location and employee ownership restrictions within assigned companies. No native build or installation performed.

## 2026-10-25 - Main Administrator approval exemption

- Apply Main Administrator changes immediately without configurable approval queues, including Finance, transfers, inventory, documents and tasks. Keep approval rules for other users.
- Main payroll adjustments are approved on save; finalizing a Main payroll run goes directly to Approved without a second approver. Main attendance entries/finalization do not require HR/General/Finance stages.
- Keep audit attribution, validation, duplicate-payment/stock checks and controlled correction flows. Update policy copy and Arabic labels. No native build or installation performed.

## 2026-10-25 - Finance integration review

- Share operating-income and cost classification between API and browser reports so loans, advances and transfers remain separate from profit. Add exact per-company/currency receivables, bills/refunds due and approved unpaid payroll to Finance.
- Connect source documents, shop orders, Finance settlements and payroll through scoped links; show only eligible source-payment actions and handle bills in currencies without an account yet. Refresh Finance after returning to the app.
- Enforce source company, currency, type and settlement limits at the storage boundary, including controlled reversals. Preserve permissions, approvals and posted history. No native build or installation performed.
- Link stock receipts and incoming movements to same-company purchase documents, show their receipt count in Finance and protect linked purchases from deletion or invalid scope/status changes. Receiving does not invent a cash payment.

## 2026-10-25 - Shop-only customer service

- Add a private support page to the customer storefront and a company-scoped Customer service inbox in Shops & orders, separate from general Customer Service.
- Support product/order/delivery/return questions, order links verified against the customer's browser, threaded replies, open/waiting/resolved states, search and pagination. Preserve company permissions, retry protection, conversation limits and Arabic/responsive layouts.
- Replies appear in the storefront conversation; no email or SMS is sent. Customer access requires the original browser cookie. No native build or installation performed.

## 2026-10-25 - Store sizing, placement and product motion

- Let the customer storefront header scroll away while keeping its single shopping bag visible as a floating control.
- Add saved card size, image shape, text size, spacing, Featured product ordering and individual float/pulse/glow controls in Customer storefront. Scope product choices to the company and hide unpublished product references from public settings.
- Keep responsive layouts, Arabic and reduced-motion support. No native build or installation performed.

## 2026-10-25 - Company store link in shop connections

- Show the selected company's saved storefront address and publication status in Shops & orders → Shop connections, with an Open shop link for published stores and a shortcut to storefront settings.
- Use the configured server origin on mobile, keep company switching scoped, and support Arabic and draft/unconfigured states. No native build or installation performed.

Keep mobile changes here in the same commit as their corresponding website changes.

## 2026-10-24 - Connected finance workspace

- Add Finance overview, Sales, Purchases, Banking, all movements and cash-basis profit/loss views using the existing account ledger and source settlements.
- Bring salary configuration, payroll approvals, payments and payslips into Finance; retain permissions and independent approvals. Refresh linked balances after payments.
- Exclude financing, advances and transfers from operating profit; show cash movement separately. Include Arabic and responsive layouts. No native build or phone installation performed.

## 2026-10-23 - Visible shopping bag

- Keep the store header and bag at the top while scrolling. The bag highlights when it contains products and gently moves after successful additions; reduced-motion settings disable the movement.
- Maintain touch targets, Arabic support and anchor spacing for the sticky header. No native package was built or installed.

## 2026-10-23 - Related store products

- Opening a product image shows its details and up to four other published products, prioritizing the same category. Related cards support photos, likes and adding to the bag, with Arabic and responsive layouts.
- No native package was built or installed for this storefront update.

## 2026-10-23 - Store product likes

- Add accessible heart buttons to product cards and product detail pages, with a liked-products filter and header shortcut.
- Save preferences per shop in the visitor's browser without requiring an account. Support Arabic, touch controls and light/dark themes.
- Storefront web update only; no native package built or installed.

## 2026-10-23 - Optional product warranty indicator

- Add a product warranty checkbox and optional details to the shared product creation/editing form.
- Show a small shield/check icon and localized warranty label beneath covered products in the store, with details on the product page. Products without a warranty have no badge.
- Preserve warranty settings when pausing/resuming sales. No native package built or installed.

## 2026-10-23 - Store sections, categories, offers and display controls

- Add workspace controls for ordered categories and homepage sections, category labels/visibility, grid/list product display, row/grid sections, default sorting, and search/hero/story/promotion visibility.
- Add scheduled percentage offers scoped to all products, a category or selected products. The best active offer applies once; guest quotes, stock reservations, order lines and linked Finance sales use the same discounted prices.
- Add store-header search, category/offer filtering, visible result counts and original/offer price labels. Refresh schedule changes and require checkout review when a price or display configuration changes.
- Suggest saved store categories when adding or editing products. Keep English/Arabic and responsive controls in shared source; no native package built or installed.

## 2026-10-23 - Product photo uploads and clearer shop management

- Add up to six product photos from the device, with previews, cover selection, removal and optional HTTPS links. Optimize uploaded photos in the browser and save them under the server's persistent data directory.
- Support authenticated photo previews from the native app's configured server. Product galleries appear in the published Amal storefront.
- Refresh Shops & orders with larger product images, sale-status badges, product search/status filters, order search/status filters and a responsive order list/detail layout.
- Include Arabic copy and mobile layouts in the shared source. No native package built or installed.

## 2026-10-23 - Company control, shop delegation and dashboard sizes

- Upgrade shipped Company Manager permissions to include company editing, Finance, Payroll, approvals and shop configuration within the assigned company. Preserve explicitly customized role/account restrictions and tenant boundaries.
- Add a Shop Manager role and a full shop permission preset. Staff can manage products, shipments, orders, storefront settings and connections without receiving user administration.
- Add one-third, half, two-thirds and full dashboard card widths with adjustable heights, automatic-height reset, touch-friendly controls and account-owned saved layouts. Mobile uses a single column.
- Shared workspace source updated; no native package built or installed.

## 2026-10-23 - Amal product focus and richer storefront colors

- Refresh Amal's collection with mint, peach, sky and lilac product cards, rounded controls and gentle decorative movement in the hero.
- Bring the hovered product above a soft page blur on desktop; keep links and Add to bag clickable and give keyboard navigation the same emphasis.
- Keep one-tap product browsing on touchscreens and stop decorative movement/lift for reduced-motion preferences. Verify English/Arabic and light/dark responsive layouts.
- Storefront presentation update only; no native package built, synchronized or installed.

## 2026-10-23 - Amal customer storefront and manager publishing controls

- Add a Customer storefront tab to Shops & orders for company-scoped branding, contact details, fulfilment regions/fees, reservation duration, policies, draft preview and publication. Default the new shop identity to Amal.
- Add product categories to product creation/editing and Excel import. Keep the catalog, reservations, incoming stock and fulfilment in the existing company workflow.
- Add a separate responsive customer storefront with English/Arabic and light/dark themes, search/categories/sorting, product pages, persistent bag, server-quoted guest checkout and private tracking links. No connection key or workspace access is exposed to visitors.
- Send a scoped administrator alert for each new order and open its exact company/order from notifications. Use the configured server origin when opening a public shop from a native workspace.
- Expire unprepared guest reservations on the server while preserving prepared orders. Keep cash confirmation in Finance and online payments disabled.
- Shared workspace source updated; no local native build, synchronization or phone installation was performed.

## 2026-10-23 - Connected shop foundation

- Add Shops & orders to the shared mobile/website workspace, with company-scoped catalog, product editing, Excel preview/import, incoming shipments, reservations and order preparation/dispatch/delivery.
- Preserve existing inventory as the stock source and link dispatch to an unpaid sale in Finance. Protect reservations, immutable shop stock records and duplicate submissions; retain company and employee permission boundaries.
- Add named, revocable server connection keys for the future storefront. Keep keys out of public browser code, stored source and ordinary API lists.
- Add English/Arabic responsive forms, product cards, shipment/order history and navigation. Explain shop services and the staged launch process on the public website.
- This is a shared source update; no native package was built, synchronized or installed. The customer storefront, payment provider and domain configuration are a separate phase.

## 2026-10-23 - Cleaner records layout and workspace menus

- Replace stacked employee/record actions with a compact Open link and an accessible action menu. Keep edit/delete actions permission-aware, preserve deletion confirmation, and retain records while deletion awaits approval.
- Tighten desktop rows, add name/avatar and status treatments, align search/status/sort controls, and paginate long directories. Stack record details into readable labeled cards on phones.
- Group desktop/tablet workspace navigation, improve active/focus states, and use logical spacing for Arabic. Keep mobile drawer/bottom navigation and existing routes intact.
- Verify search, filters, sorting, paging, keyboard/outside-click menu dismissal, menu positioning, Arabic/English light/dark layouts and employee permissions using isolated data. Shared source update only; no native package rebuilt or installed.

## 2026-10-23 - Organization main admins and company HR/staff assignment

- Add a scoped main-admin card to each organization page. Platform Main Admins can assign an existing active organization account or create a new organization admin with a temporary password. Organizations can be created first and show an admin-setup reminder until assignment.
- Add HR & staff access controls to company Users & Permissions and Attendance & Shifts. Organization admins can appoint company admins; company admins can assign HR Manager, HR Staff and own-record Staff roles within their company.
- Restrict role lists to grants the acting admin can delegate. Block company-admin peer promotion, cross-company assignments and changes to the designated organization main admin until a replacement is assigned.
- Keep the previous organization's admin account after replacement; removing its access requires a separate explicit account change. New admin passwords require first-login rotation; role changes revoke existing sessions.
- Add English/Arabic responsive controls and refresh company account summaries after assignment. Verified isolated hierarchy/account workflows, existing management/administration flows, and mobile RTL layouts. Shared source only; no native package rebuilt or installed.

## 2026-10-23 - Sudanese pound support

- Add SDG to shared company creation/editing currency selectors and backend company validation.
- Accept SDG in Finance accounts, transactions, payroll settings and salary configurations. Use two decimal places and preserve separate per-currency balances.
- Verify company setup, payroll defaults/settings/salary, an SDG expense and exact ledger/display totals with isolated data. Shared source update only; no native package rebuilt or installed.

## 2026-10-23 - Compact notes and personal dashboard layouts

- Make the manager notebook a compact half-width card with two note previews; open it to search or manage the full notebook. Editing and reminder links expand it automatically.
- Add manager-only dashboard customization: reorder with touch/keyboard buttons or desktop drag handles, choose half/full width, hide/show components, save, cancel and reset to defaults.
- Save layouts on the server per authenticated manager account, with version checks to prevent one device overwriting a newer layout from another. Hidden notebooks still open from private reminder links.
- Keep unsaved notes and chart state when entering customization or moving cards. Stack cards on phones, support Arabic/light/dark layouts, and keep the desktop attendance card readable when resized.
- Verified the full project check, private layout persistence/isolation/conflict tests, compact notebook and customization browser workflows, and dashboard activity regressions. Shared source update only; no native package rebuilt or installed.

## 2026-10-23 - Manager dashboard and private notebook

- Keep the manager dashboard available at phone sizes for Manager, Organization Admin, Company Manager, HR Manager, General Manager, Finance Manager and Main Admin accounts. Employees retain their mobile people view.
- Add an owner-only personal notebook with optional phone links and reminder times, search, pinning, completion, editing and confirmed deletion. Company management notes remain a separate shared feature.
- Deliver generic private reminder previews to the owner's in-app inbox on authenticated notification polling, including catch-up after returning. Store reminder times in UTC and edit them in the device's local timezone. This does not send SMS, email or offline device alarms.
- Add English/Arabic layouts and light/dark styles to shared source, with touch-sized form inputs and optimistic version checks to prevent overwriting newer notes.
- Align delegated organization controls with existing API permissions and explain missing attendance employee links correctly.
- Verified isolated organization/company/employee creation, manager onboarding, private reminders, Main Admin isolation, desktop/mobile layouts, and broader administration, attendance, Operations, reporting and dashboard regressions. Source update only; no native package was rebuilt or installed.

## 2026-10-23 - Website appearance on sign-in

- Reuse the public website's connected-star animation and scoped light/dark palette on login, registration, password-reset requests and first setup.
- Keep the form on an opaque, high-contrast surface, with touch-sized controls, English/Arabic layouts and existing safe-area spacing. Stars respect reduced motion and stop in hidden tabs.
- Share the browser appearance preference between the public website and workspace, including System mode and changes from another tab. Keep native appearance synchronization and per-device preferences.
- Source update only; no native app package was rebuilt or installed. Render secret configuration and AI setup remain unchanged.

## 2026-10-22 - Public explorer and private website inquiry inbox

- Make the browser's public root a floating section explorer with focus details and an anonymous shop website service page. Keep the native home/dashboard route and existing business modules.
- Add responsive, translated Customer Service inquiry triage to shared source: scoped access, assignments, contact links, private follow-up notes and status history. Public submissions notify authorized platform inbox staff; assigned staff can handle only their own inquiries.
- Use `/workspace` for the browser dashboard while native navigation retains `/`. The public website remains available through the native system-browser link.
- This source update does not rebuild or install a new native package. The installed Android package remains the previous build.

## 2026-10-22 - Android package with current workspace upgrades

- Include the shared attendance clock/history, detailed notifications, Operations collaboration, payroll payments, finance ledger, and the public website link in the bundled app.
- Use the live HTTPS workspace as the native default while preserving per-device server overrides and browser same-origin behavior.
- Save task attachments and payroll/ledger CSV exports through Android's system file picker; keep authenticated downloads inside the app and send only file bytes to the picker. Cancellation leaves the workspace unchanged. Native saves are limited to 20 MiB.
- Use Android's print/PDF dialog for payroll, payslips and finance, and open the public website in the system browser.
- Keep status/navigation icons readable in light/dark mode and prevent long dashboard filter labels from expanding phone layouts.
- Give the activity chart and analytics panel distinct component keys so changing dashboard filters does not repeatedly restart requests.
- Verification includes the full project check, isolated Operations/payroll/attendance browser workflows, dashboard filters and layouts, and a real-device bridge test for appearance, invalid-link rejection and file-picker cancellation. The connected Android phone accepts an in-place update without clearing app data.
- Save the Android package with its checksum and source/dirty-state manifest under ignored `mobile/releases/`. Generated packages and signing material remain outside Git. Windows can synchronize iOS assets but cannot compile or install an iOS binary.

## 2026-10-22 - Website link on the left of sign-in

- Move the public website link beside the STOCRANT name on the left of the login header in English and Arabic; keep language and appearance controls on the right.
- Wrap the header on small phone screens. Source update only; no native build or phone installation performed.

## 2026-10-22 - Public website link on sign-in

- Add a translated STOCRANT website link at the side of the login header, alongside language and appearance controls, with a wrapping layout for small phones.
- Open the public website separately, using the configured server's `/website/` address in the native app. A separately hosted public URL can be supplied at build time.
- Source update only; no native app build or phone installation performed.

## 2026-10-22 - Shared Operations and task collaboration

- Replace the shared phone/website Operations list with a central task workspace, searchable assignment selectors, dashboard counts, scoped filters and detailed task pages.
- Keep one parent task for company/team/group assignments; add individual progress, checklists, review/rework, blockers, extension requests, chronological replies/mentions and private supporting files.
- Connect scoped, deduplicated task/deadline notifications and secure task links; preserve legacy tasks, personal work, notes, approval policies and historical activity through additive migration and explicit in-place upgrade.
- Automated backend/build/translation checks are documented in `docs/OPERATIONS_TASKS.md`. Browser E2E was attempted but Chrome exited before verification; mobile/RTL visual QA remains pending.
- No native app binary was rebuilt or installed and no hosting deployment was performed.

## 2026-10-21 - Connected payroll and financial ledger

- Shared phone/website payroll now records full or partial employee payments with immutable ledger allocations, paid/outstanding amounts, payment histories and retry protection.
- Connect approved source settlements, advance/loan recoveries, authorized reversals, exact currency totals and monthly cash-flow reporting to the existing cash ledger. Preserve salary snapshots, independent approvals and own-payslip privacy.
- Add commit-time financial constraints, additive finance-history migration/backup, chained audit history and rollback documentation. Details and remaining integration/storage limitations: `docs/FINANCIAL_FLOW.md`.
- No native app build, phone installation or hosting deployment performed. Browser visual verification remains pending because the Chrome E2E process exited before verification.

## 2026-10-21 - Newest notifications first

- Combine device activity and account notifications in one chronological list, newest first, across the shared website and mobile panel.
- Show decision/read timing in summaries and effective date, shift, location and acknowledgment status in notification details and history.
- Source update only; no native build, installation or hosting deployment performed.

## 2026-10-21 - Complete notification details

- Show full notification messages with priority, sender, read state, exact timestamps, shift/location and acknowledgment requirements in the shared phone/website panel.
- Add clear labeled details and permission-checked links for related tasks, stock, documents, leave, attendance and approval records; preserve existing HR acknowledgment and administrator decisions.
- Verified Arabic/English, both themes and responsive layouts. Source changes do not deploy hosting, rebuild an APK or install a phone update.

## 2026-10-21 - Accurate personal attendance clock and history

- Added a server-calibrated HH:MM:SS clock, saved-timestamp working timer, clear check-in/out actions, schedule summary and late/early indicators to shared mobile and website screens.
- Unified mobile and HR punches on the existing attendance collection with UTC timestamps, safe repeated requests, duplicate prevention, overnight check-out and existing approval/session rules.
- Added own-record history with Today/week/month/custom filters, pagination and session details; preserved legacy minute precision and existing payroll break calculations.
- Verified English/Arabic RTL, light/dark and phone/tablet/desktop browser layouts. No native APK was built or installed, and no live hosting deployment is included. Details: `docs/MOBILE_ATTENDANCE.md`.

## 2026-10-21 - Release CI SDK setup repair

- Explicitly select the supported `platform-tools` package for Android CI setup. The action's old default requested the retired `tools` package and failed before compiling the app, preventing a fully passing release check.
- Retained website verification, SDK license handling, Android package compilation and artifact publication. No generated APK, credentials or runtime data is committed.

## 2026-10-21 - Reference-inspired dashboard and colorful activity charts

- Updated the shared desktop and phone dashboard with a rounded analytical card grid, clearer colorful KPI icons, teal/violet Work Activity lines, actual status rings and activity-volume bars.
- Preserved real data, timezone filters, scoped task permissions, drill-down, current backlog and existing self-service controls. New chart summaries reuse the existing activity request; task completion is explicitly a current all-dates snapshot.
- Added interactive series toggles, sparse-data markers, accessible status counts and compact recent-activity rows. Arabic/English and both themes remain supported; dashboard styling is scoped so the project-wide light-blue theme remains elsewhere.
- No native binary was built or installed. Source publication does not deploy hosting or update a phone. Details: `docs/DASHBOARD_REFERENCE.md`.

## 2026-10-21 - Light blue project-wide recoloring

- Changed the primary accent color from blue-600 (`#2563eb`) to light blue (`#3b82f6`) across the shared website/mobile themes (`src/theme.css`, `src/ui-refresh.css`) and the public website (`public-website/src/theme.css`), covering light, dark and iOS premium layers plus `--ios-blue`.
- Updated hardcoded accent instances (buttons, badges, focus rings, avatar/hero gradients, finance trend chart stroke) to the new light blue.
- No native binary was rebuilt or installed. Source publication does not deploy hosting or update a phone.

## 2026-10-20 - Work Activity chart and Today filter

- Added the shared Chart.js Work Activity line/area chart to desktop and manager/employee phone homes, with point/table drill-down, exact totals, recent work events and permission-scoped record links.
- Added Today, 7-day, 30-day and custom dashboard periods, hourly/daily buckets and a per-account saved timezone preference. Date changes update dated insights; outstanding/overdue tasks remain current across all creation dates.
- Added empty/loading/error/retry states, accessible data tables, cyan/blue theme-aware colors, Arabic RTL and responsive layout checks. Actual completion transitions prevent repeated completed-task comments from inflating completion counts.
- No native binary was rebuilt or installed. Source publication does not deploy hosting or update a phone. Details: `docs/WORK_ACTIVITY.md`.

## 2026-10-20 - Access, settings and employee onboarding

- Redesigned the shared administration center with grouped/searchable navigation, compact summaries, roles/permission matrices, policy controls and request review history. Phone navigation uses a compact scrolling bar with RTL support.
- Added Main-only administrative policy configuration and reasoned eligible self-approval, while preserving independent payroll/finance/inventory and attendance controls. Company/organization writes are Main-only under the latest brief.
- New employee creation opens account confirmation with generated identity and delivery status. Automatic accounts and encrypted activation-email delivery are configurable; existing private activation and no-login workflows remain available.
- Role changes revoke affected sessions, scope can be restricted to departments/sections/own records, and system-role protections remain server-enforced. Added English/Arabic copy and theme-aware responsive validation.
- Live mail requires the documented server environment/provider setup. No native build, phone installation or hosting deployment was performed for this source update.

## 2026-10-20 - Dashboard and company management upgrade

- Shared company navigation now includes inline information editing, managers, department/section dashboards, documents and activity. The responsive directory adds reporting filters, sorting, column choices, page sizes and authorized bulk status changes.
- Mobile and web dashboards share scoped interactive analytics, chart/table views, date filters and device-local widget/chart preferences. Existing themes and Arabic RTL apply to charts and controls.
- Notification history adds read/category/date/search filters, pagination, synchronized read counts and offline feedback. Existing HR retention and acknowledgment rules remain enforced.
- Reporting relationships use validated same-company links with cycle and orphan protection. Existing employee/account/payroll data remains in the same source/storage architecture.
- Verified through isolated API and Chrome workflows, including phone-width rendering. No native build, installation or hosting deployment was performed.

## 2026-10-20 - Organization Manager company work

- Added company Tasks, Notes, separate HR & Leave navigation and live task counts; employee profiles can show permitted tasks and notes.
- Shared task forms support employee/team assignment, dates, status, priority, progress, comments and filters. Notes support linked records, follow-up dates, author timestamps and restricted visibility.
- Updated shipped organization-manager permissions additively for payroll and company reports. Account and cross-organization safeguards remain on the API; employees require Operations view to see assigned work.
- Added authorized task/note report previews and Arabic/English Print / Save as PDF layouts. Responsive browser checks passed; physical native dialogs and phone installation were not tested. No APK build or installation was requested/performed.

## 2026-10-20 - Complete employee workspace and reports

- Added dedicated employee sections for personal/employment/contact/address details, account setup, HR records, payroll, documents and history. Save and Cancel return to the employee profile; legacy account-setup links remain supported.
- Expanded permission-aware directory details and company attendance summaries. Salary visibility and updates are protected independently from general HR editing; existing records and relationships remain intact.
- Added authorized company/employee report previews with Print and Export PDF actions. PDF saving uses the platform print dialog; report styles support Arabic/English and exclude application controls.
- Verified responsive browser layouts and generated English/Arabic short and multi-page PDFs. Native print dialogs, APK builds and phone installation remain separate platform checks; none was performed here.

## 2026-10-20 - Dedicated company workspace

- Added shared company navigation for overview, employees, HR/attendance, payroll, communication, users, reports and settings, shown according to permissions.
- Added company switching, identity/contact header, compact statistics, recent employee records, pending leave updates and searchable/filterable/sortable employee management.
- Company settings supports a validated HTTPS logo URL; unavailable images use the shared fallback icon.
- Company links preselect payroll, attendance, notification recipients and record lists. Responsive wrapping navigation supports Arabic RTL and English LTR with light/dark surfaces.
- Preserved existing editing, employee creation, account activation and business data. Source-only update; no native build or phone installation performed.

## 2026-10-20 - Application audit and workflow repairs

- Enforced flagged temporary-password setup in the shared UI and business APIs, improved session refresh handling, and retained existing password/session policies. Unflagged accounts remain unchanged.
- Fixed Arabic Operations status values, task and notification navigation, private policy links, form labels, decimal input, scoped company selection, inline validation, draft/discard handling and recovery states.
- Improved mobile picker keyboard/focus behavior and default server restoration; server changes clear the old native token and connection checks have timeouts/cancellation.
- Shared API repairs cover approval privacy, own-record identity checks, atomic transfer pairs, export safety and validation. Existing records are preserved.
- Source-only update: no native build or installation was requested. Flagged accounts using older binaries may need to complete password setup through the current web interface until a new APK is installed.

## 2026-10-20 - Shared management interface redesign

- Updated shared workspace surfaces, dashboard metrics, forms, tables, tabs, dialogs and responsive spacing for Morning and Night appearances in English and Arabic.
- Added a persistent Morning / Night / System selector to the header, mobile account drawer and sign-in screen, including live system changes and early preference application.
- Main Admin now sees the management dashboard on mobile. Employee self-service, attendance, account controls and existing permissions remain available.
- Extended the existing Arabic dictionary and preserved raw API values for translated enum choices. Added route/theme/viewport checks and retained existing payroll, company, document and HR communication browser regressions.
- Shared source only: no native APK was requested, built or installed for this redesign.

## 2026-10-19 - Payroll management

- Added shared responsive payroll management and employee-only payslips with English/Arabic layouts, salary versions, attendance/shift calculations, approved source adjustments, independent approvals and confirmed Finance payment records.
- Payroll access follows backend company, location, ownership and action permissions. Existing accounts and historical records remain intact.
- Shared source and browser/mobile viewport workflows are verified. A new native APK has not been built or installed for this payroll task; build/save it with the existing mobile workflow when requested.

## 2026-10-19 ? App logo

- Refined the existing ledger mark into a blue-to-mint app icon on navy. Saved an editable SVG, 1024px PNG and rounded preview in mobile/branding/.
- Generated all Android launcher, round and adaptive foreground sizes and the opaque iOS icon from shared design parameters. Validated 17 native/master PNG dimensions and rebuilt/saved the Android debug package locally.
- Source command: npm run mobile:icons. This icon update has not been installed on the phone or pushed to GitHub during this task.

## 2026-10-19 ? Company profiles and employee identities

- Shared website/mobile company profile now has grouped information cards, readable organization names, a scoped employee table and English/Arabic responsive layouts.
- Employee creation generates an immutable Employee ID and unique username, creates the linked restricted account, and supports private password-setup invitations directly from the employee profile.
- Added email-or-username login, company preselection and duplicate-submission protection. Existing records, account links and passwords are retained.
- Verified 89 automated tests, production checks, company/HR browser workflows, and rebuilt the Android debug APK into mobile/releases/. This build is saved locally; it was not installed on the phone during this task.

## 2026-10-19

- Shared HR employee accounts, secure activation invitations, private documents, notification history, urgent alerts, meeting links and acknowledgments are included in the Android app.
- English/Arabic and responsive layouts share the website implementation.
- Repaired the Android Gradle wrapper and verified the debug APK build/signature.
- Installed the updated APK in place on the connected Android phone, preserving app data. Configured USB access to the separate local preview.
- Added a local release folder/manifest script and GitHub build artifacts for website and Android updates from the same source commit.

The APK installed locally is a USB development build. Production distribution needs a deployed HTTPS API and a stable private release-signing key. GitHub CI debug APKs are test artifacts and may use a different signing key from the installed app.

- HR dashboard: compact company scope, quick actions, clearer employee table with result counts and resettable filters. Desktop sidebar keeps module icons when collapsed, with accessible hover labels. Shared mobile layout supports Arabic and scrollable employee records.

- Hide desktop and tablet sidebar scrollbar tracks while preserving navigation scrolling; prevent sideways scrolling in the desktop icon rail.
