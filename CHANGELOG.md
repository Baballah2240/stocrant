# Changelog

## 2026-10-20 — Work Activity and Today dashboard filter

- Added real completion/activity history charts, hourly Today and daily longer ranges, saved timezone/date preferences, scoped point drill-down and record links on desktop and phone home screens.
- Synchronized selected dashboard periods with dated analytics and recent activity while preserving current backlog and snapshot metrics. Recorded completion transitions prevent repeated comments/edits from inflating completed-task counts; task updates now produce one activity entry.
- Added timezone/DST/role/API coverage and browser checks for date changes, totals, errors, empty/loading states, English/Arabic, both themes and responsive layouts. No new dependencies or storage collections. See `docs/WORK_ACTIVITY.md`.

## 2026-10-20 — Access, settings and secure employee onboarding

- Added a searchable administration center, grouped responsive navigation, live settings summaries, custom role creation, supported permission matrices, scope controls, confirmation and protected Main Administrator roles.
- Added configurable, reasoned Main-only self-approval for eligible administrative requests; retained mandatory independent financial/payroll/inventory and attendance review. Request Changes and submission/decision history are now available in approval review.
- Added encrypted durable onboarding mail, configurable activation policy, provider idempotency/retry, account confirmation and email status. Reserved employee IDs survive deletion; concurrent creation with an email is idempotent.
- Company and organization writes are now Main-only, as required by the latest brief. Existing delegated company HR, account, task, payroll and report scopes remain available.
- Added isolated provider/API tests, administration browser checks, Arabic/English and responsive theme validation. Required mail environment, migrations and limits: `docs/ACCESS_ONBOARDING.md`.

## 2026-10-20 — Dashboard and company management upgrade

- Added structured company management, inline company editing, richer employee directory controls, managers, department/section dashboards and direct private-document/activity views.
- Added permission-scoped analytics for administrator, manager and employee dashboards, with Chart.js chart/table views, date/category filters and persisted personal widget preferences.
- Upgraded notification history with read/category/date/search filtering, pagination, synchronized counts and offline/error states. Existing HR message retention remains enforced.
- Validated same-company reporting links and cycles in the shared server mutation policy. Preserved legacy strings/history and applied salary redaction to CRUD responses as well as reads.
- Extended Arabic/English and light/dark responsive verification. Implementation details, metric definitions and limits: `docs/DASHBOARD_COMPANY_UPGRADE.md`.

## 2026-10-20 — Organization Manager company access, tasks and notes

- Extended the shipped Organization Admin role with scoped payroll and company report/delete permissions. Existing shipped-role grants upgrade additively; explicit custom roles/account restrictions remain intact. Global administrator accounts and settings remain protected.
- Added dedicated Tasks, Notes and HR & Leave company sections, live task counts, employee task/note sections and scoped report links. Existing employee/user/attendance/payroll/document workflows remain connected.
- Reused work items/activity for validated individual/team assignments, dates, priority, status, progress, reassignment, completion/cancellation and authored comments. Added search, employee/status/priority/date/overdue filters and pagination. Team members' permitted personal work lists now include their assignments.
- Added company/employee/task notes with categories, follow-up dates, immutable authors/creation timestamps, search/filtering, management-only defaults and explicit linked-employee visibility. Current task assignments determine shared-note access after reassignment.
- Enforced scope and related-record checks on every new API. Added authorized task/note printing/PDF reports, private-note export redaction, deletion audit scope and safeguards against orphaning retained tasks/notes.
- The shared route matrix passed all 348 route/language/theme/viewport combinations with no uncaught errors. Final company-work filter sizing was additionally checked at desktop, tablet and phone widths.
- Verified 133 API/unit plus 10 UI support tests, TypeScript, build, storage/security checks, organization-manager browser workflows, company/profile/document/payroll regressions and rendered Arabic task/note PDFs. Details: `docs/ORGANIZATION_MANAGER.md`.
- Employee task viewing requires Operations view, granted through existing Users & Access; automatic employee accounts keep their existing HR-only defaults. Existing approval stages, self-approval rules, inactive-scope policies and retained-record protections remain authoritative. PDF export uses the platform print dialog. No production deployment, native build or phone installation was performed.

## 2026-10-20 — Complete organization, employee profiles and reporting

### Completed

- Improved organization-to-company context, company logo/ID/contact summaries and scoped attendance statistics. Retained company switching, search, filters, sorting, pagination and automatic employee/account identities.
- Added employee sections for personal, employment, contact/address, account/access, attendance/shifts/leave, payroll, documents and activity. Profile edits and cancellation return to the profile; linked account setup URLs still open the correct section.
- Expanded company-directory role/contact/salary details using backend-redacted data. Added optional editable employee addresses without rewriting existing records.
- Separated salary access from general HR editing and personal-data access. Restricted editors cannot overwrite salary through default form values. Personal-data self-access uses the employee link, and salary-change history is redacted without salary permission.
- Added backend-authorized report datasets and previews for company information, complete employee lists, contact directories, employee profiles, attendance, shifts and leave. Existing payroll reports/payslips remain connected to the authorized payroll workflow.
- Added Print and Export PDF actions with fresh permission checks, company branding, report dates, repeating table headings, page counters, appropriate portrait/landscape pages, English/Arabic layout, white paper in both themes and no printed navigation or buttons.
- Preserved employee/account relationship validation, secure activation and password management, audit events, payroll rules and retained-record deletion safeguards.

### Verification and remaining limits

- The final frozen build passed all 348 route/language/theme/viewport combinations with no uncaught errors.

- Full project checks passed 126 API/unit tests plus 10 lock/notification/translation tests, TypeScript, storage/backup verification, production frontend build and security smoke checks. Focused company, private-document and complete-workspace browser tests cover actual edits, save/cancel, employee creation/activation, protected deletion, company selection and responsive Arabic/English layouts.
- Generated and inspected one-page company/profile PDFs and five-page, 68-employee English/Arabic directories. Verified every row, repeated headings, visible text, page numbers, white print margins and hidden controls. Detailed results are in `docs/COMPANY_WORKSPACE.md`.
- Export PDF uses the browser print dialog's Save as PDF destination. Physical printers and native device dialogs were not tested. Existing guards may block deletion of employees with linked logins, payroll or retained documents; deactivate/archive through existing workflows instead of forcing deletion.
- No destructive migration, application dependency upgrade, production deployment, APK build or phone installation was performed. Shared mobile source notes accompany this change.

## 2026-10-20 — Dedicated company management workspace

- Reorganized company profiles into permission-aware Overview, Employees, HR & Attendance, Payroll, Notifications, Users & Permissions, Reports and Company Settings sections.
- Added persistent section navigation, company switching, company identity/contact header, summary cards, recent employee records, pending leave updates and primary actions.
- Added editable HTTPS company logo URLs with server validation, clear/reset support and image-failure fallback.
- Retained company edit/save/cancel and employee/account workflows; added employee sorting alongside existing search, department/status filters and pagination.
- Added scoped company HR records and payroll-period summaries to the existing profile API. Payroll/user data and actions require their existing permissions; company switching uses authorized companies only.
- Connected company-filtered payroll, attendance, message composer, user management and registry lists. No sample statistics, invented workflows, migrations or business-data rewrites.
- Verified through project checks, company scope API regression tests and real browser editing, employee creation/activation, switching, navigation and responsive English/Arabic checks. Shared mobile notes accompany source changes; no deployment or native installation performed.

## 2026-10-20 — Application audit and reliability fixes

### Security and financial integrity

- Connected temporary-password setup in both the UI and business APIs; password rotation clears the existing flag and invalidates old sessions. Unflagged accounts are not reset.
- Fixed cross-company/location approval summary leakage and retained separate confidential-document authorization. Fixed own-record access based on editable display names while preserving uniquely linked legacy assignments.
- Made internal-transfer creation and paired approval/rejection atomic, with UUID grouping and rollback when either side fails. Historical partially decided pairs are not silently rewritten.
- Shared formula-safe CSV encoding across collection, payroll and attendance exports. Changing mobile servers clears the prior native token; health probes do not send it.

### Workflows, forms and user experience

- Repaired dashboard task/notification/policy destinations and added the missing scoped task-detail route. Corrected Arabic Operations select values, status feedback and interface copy.
- Added server validation for work updates and actual dates; strengthened registry enums, whitespace, time and numeric validation without rewriting unchanged historical enum/date/time values.
- Added generic-form company assignment, legacy company-value preservation, structured field errors, adjacent localized feedback, associated labels, decimal inputs and unsaved-change protection.
- Replaced indefinite metadata/record loading with recoverable error and missing-section states. Added stale-response protection and safer session refresh behavior.
- Repaired blank/default server restoration, timeouts and unmount cancellation. Improved searchable picker keyboard navigation and focus restoration.
- Centralized corrupted lock/error Arabic and known action messages, used American English date formatting, corrected separators, and refined Operations/Finance layout.
- Updated the separate public site's obsolete HR/attendance FAQ and made its mail-draft contact action honest and unavailable when unconfigured.

### Performance and cleanup

- Replaced repeated per-account/per-item movement scans with single-pass aggregation and isolated the dashboard duration timer. Removed unnecessary pointer tracking.
- Removed verified unused `Dashboard.tsx`, `FinanceOverview.tsx`, `ModuleOverview.tsx`, `CursorMotion.tsx` and `src/theme.ts`. Connected the previously unused password-change screen instead of deleting it.
- Moved 24 pre-existing scratch files into ignored `.local-preview/archived-scratch-2026-10-20/` with a recovery manifest and hashes. Removed unused imports, enabled strict unused-code checks, corrected the package entry point and repaired README text.

### Verification and rollout

- `npm run check` passed 122 API/unit tests plus ten lock/notification/translation tests, both TypeScript checks, storage verification, production build and production security smoke checks. No lint/formatter script is configured.
- The 348-combination route/language/theme/viewport matrix and existing company, payroll, private-document, HR communication and notification browser workflows passed. Focused final audit reruns are recorded in `docs/APPLICATION_AUDIT_2026-10-20.md`.
- Both locked dependency audits reported zero known vulnerabilities; the separate public website build and light/dark desktop/tablet/mobile browser checks passed. Added its build and dependency audit to CI. No major dependency upgrades or destructive migrations were performed.
- Shared mobile source notes accompany these changes. No hosting deployment, APK build, phone installation or real payment was performed. Production limits and required external checks are documented in `PRODUCTION_READINESS.md`.

Full findings, affected areas, cleanup inventory, tests and remaining operational requirements: `docs/APPLICATION_AUDIT_2026-10-20.md`. Original request: `docs/project-archive/2026-10-20-APPLICATION-AUDIT-BRIEF.md`.

## 2026-10-19 ? Mobile app icon

- Updated the native launcher identity with the existing ledger mark in sky blue, mint and navy. Added shared geometry/palette, editable SVG, PNG master and preview under mobile/branding/.
- Regenerated 15 Android launcher assets and the opaque iOS master; added npm run mobile:icons for reproducible generation. Verified dimensions/decoding and rebuilt the Android debug package.
- Saved the updated mobile package locally; no device installation, GitHub push or iOS binary build was performed in this task.


## 2026-10-19 ? Company profile and employee identity workflow

- Replaced the generic company detail page with a responsive, localized company profile, readable organization names, grouped contact/business/access cards and explicit Save/Cancel editing. Added a scoped employee table with username/ID search, filters, pagination and company-preselected creation.
- Added server-generated immutable Employee IDs, unique usernames, email-or-username login, authorized username editing and idempotent employee submissions, including approval-gated creation. Existing secure linked-account creation and private activation are now shown directly in employee profiles.
- Added backed-up username migration and JSON-store unique constraints without changing historical Employee IDs, passwords or company relationships.
- Verified npm run check (81 API tests plus eight other tests, both type checks, storage checks, production build and security smoke) and isolated company/HR communication browser workflows. Rebuilt and saved the mobile debug package locally; no phone installation or production deployment was performed.
- Implementation, affected files, migration and schema limitations: docs/COMPANY_PROFILE_EMPLOYEE_IDENTITIES.md.


## 2026-10-19 ? Mobile update and source checkpoint

- Rebuilt and verified the Android debug APK with the latest HR, document and notification screens; synchronized Capacitor resources. No USB device was detected, so device installation/runtime checks remain pending.
- Repaired the corrupted Gradle wrapper JAR from the installed Gradle 8.14.3 distribution and verified the wrapper.
- Saved build, connection and safe in-place installation notes in docs/MOBILE_UPDATE.md. The local APK, runtime data, generated resources and secrets are excluded from Git.


## 2026-10-19 ? Employee accounts and HR communication

- Added atomic employee/linked account creation, restricted Employee defaults, private single-use activation, missing-contact setup, duplicate/rollback protection, and termination session revocation. Existing accounts and approval rules are retained.
- Added company/location-scoped HR account status, invitations and ordinary Employee suspension; elevated roles and reactivation remain in authorized user management.
- Added notification composition/preview, one or many recipients, scheduling, urgent banners, safe meeting links, durable history, honest delivery/read receipts, acknowledgments and reminders. In-app polling only; no external messages were sent.
- Added English/Arabic responsive UI and direct API permission checks. Preserved notification and document workflows; fixed employee account metadata being interpreted as a finance relationship and kept account backlinks synchronized.
- Verified npm run check (72 API tests plus 8 lock/notification/translation tests, type checks, storage checks, production build/security smoke) and three isolated browser suites: HR communication, HR documents and notification center.
- Details, affected files, additive data collections, invitation handling and deployment limits: docs/HR_EMPLOYEE_COMMUNICATION.md.


## 2026-10-19 — Private HR document management

- Replaced the generic file-link-only document screen with a responsive employee/company document library, grouped create/edit form, searchable company/employee dropdowns, upload progress and recoverable form state. Added organization/company/employee/type/status/date filters, sorting, pagination, expiry summaries and an employee-profile Documents section.
- Added actual binary uploads to private disk storage with generated file references and metadata in the existing `documents` collection. Added format/size checks, Office ZIP validation, private authenticated preview/download endpoints, draft cleanup, metadata-only edits, retained attachment versions and confirmed archive/restore. Added a default 10 MiB limit (configurable up to 25 MiB).
- Added an additive backed-up document migration; historical values and unambiguous employee links are preserved. File bytes are never embedded in JSON. Employee deletion/transfer is blocked where retained documents would be orphaned. Fixed the first-edit version increment for legacy documents.
- Enforced HR action grants, company/location boundaries, own-employee visibility, company-file sharing and historical-file access across dedicated endpoints, generic collection URLs, exports, self-service and policy summaries. Uploads recheck authentication after streaming; filesystem failures return safe user-facing errors.
- Integrated existing HR approval rules for creates, metadata/file edits, archive and restore. Added private pending-change review pages, reserved uploads, revalidation on decision, request/record history links and HR-only review enforcement. Unrelated approvers cannot read confidential HR payloads or decide document requests.
- Added in-app expiry warnings with configurable windows, scoped HR summaries, authorized recipients and event deduplication. Generic notification text omits document titles/numbers and employee names. No external messages are sent.
- Added centralized English/Arabic document copy and localized validation errors, RTL layouts, mobile filter disclosure, private preview styles and focused browser checks. No dependencies were added.
- Verification: `npm run check` passed 61 API integration tests (including 14 new document tests), 2 app-lock tests, 2 notification/activity tests, 4 translation tests, both TypeScript checks, storage/backup checks, production frontend build and production smoke checks. Isolated Chrome tests passed real upload, search/preselection, recovery without duplicate upload, draft preservation on language change, preview/download, employee integration, metadata edits, replacement/history, confirmed archive/restore, pending document review/approval, pagination and Arabic/mobile dark layout. Notification panel browser regressions also passed.
- Saved implementation and operations details in `docs/HR_DOCUMENTS.md`. The separate local preview is maintained without importing or overwriting business backups. Before deployment, back up JSON and private attachment files together; antivirus/content-disarm scanning is not bundled, and Office files require a viewer/download. No real production-data migration or production deployment was performed.


## 2026-10-19 — Notification center

- Redesigned the notification panel with compact cards, fixed header/search/filter controls, separate scroll content, readable timestamps and clearer read/unread states. Added All, Unread, Requests and Activity filters, message/type search, loading/empty/error states and feedback.
- Added a full-screen mobile layout with safe-area spacing, body scroll containment, keyboard focus restoration and reduced-motion support through existing panel styles. Retained existing account-only backend permissions and administrator response actions.
- Replaced corrupted inline Arabic copy with centralized translations, added Arabic search/filter/action labels and localized timestamps, and retained light/dark theme colors.
- Fixed repeated opening of a read notification incorrectly decrementing unread counts; protected stale detail loads when closing/reopening; added confirmation before deletion and approval/rejection.
- Added `scripts/verify-notification-panel.mjs` and `npm run test:notification-panel`, using an isolated temporary data store and headless Chrome. Supports `CHROME_EXE` for alternate Chromium locations. No real accounts or business data are used.
- Verified `npm run check` (55 automated tests, type checks, storage verification, production build and production smoke checks), then reran frontend type checking, translation tests and frontend build after the final copy changes. Browser checks passed search, request filtering, read-count regression, account privacy, mobile full-screen/scrolling, Escape/focus restoration and Arabic RTL. Browser checks require Chrome to be allowed to start its renderer.


## 2026-10-19 — Resume saved attendance/HR checkpoint

- Resumed the saved attendance, timesheet, payroll approval and employee-directory implementation. The local Cline storage contained no usable conversation transcript; the saved Git checkpoint and changelog were used instead.
- Fixed an unterminated and duplicated personal-data permission function that prevented the server from compiling. Retained existing personal-data access grants in one implementation.
- Aligned sign-in HR permissions with backend authorization so explicitly authorized HR users can see the actions they are permitted to perform. Updated regression coverage for allowed create/edit, denied delete, and removed grants; client-selected role headers still cannot bypass permissions.
- Moved company/organization session revocation into the common mutation path, covering changes applied through approval as well as direct edits. Approval decisions now commit record changes, history and session revocation together. Added a regression test proving reactivation cannot revive an old session.
- Included organization and translation regression suites in the standard check command.
- Added `npm run preview:local`: a loopback-only development preview using the ignored `.local-preview/data` store, initially empty. Existing `data` files and backups are not restored, replaced or modified by this preview. The preview is not a production deployment.

### Verification completed

- `npm run check`: passed both TypeScript checks, 47 API tests, 2 app-lock tests, 2 notification tests, 4 translation tests, storage/backup integrity checks, Vite production build and isolated production smoke checks.
- Preview HTTP checks: `/`, `/api/health` and `/api/auth/status` passed on `http://localhost:3000`; first-time setup is required. No preview account was created.
- No real business records, passwords or backup contents were printed or committed. Authenticated visual testing and validation against the active historical database remain outstanding; the workspace has backups but no current `data/stocrant.json`.

## 2026-10-18 — Attendance, timesheets and payroll workflow

### Workforce attendance

- Added the dedicated **Attendance & Timesheets** HR workspace with business-timezone clocking, daily/monthly/yearly filters, search, pagination, CSV export, attendance metrics, and responsive trend/table views.
- Added employee correction requests with immutable original snapshots, HR comments, audit events, and in-app links/notifications.
- Added staged attendance approvals for HR Manager, General Manager, and Finance Manager; the configured stage order is enforced server-side and decisions are idempotent.
- Wired the **Employee Directory** table into the HR dashboard with search, department/location/status filters, HR-only toggle, sortable columns, pagination, permission-aware View/Edit/Delete actions, and id-based deletion.

### Payroll and security

- Added company attendance settings for work schedules, break/grace/overtime rules, deduction policy, business timezone, and stage configuration.
- Attendance deductions are opt-in, calculated from approved attendance only, posted idempotently to draft payroll, and deferred to a payroll adjustment when payroll is finalized or paid.
- Blocked generic edits/deletes of finalized attendance records; corrections must use the audited workflow.
- Standardized the default business timezone to `Asia/Qatar` across hosted configuration, API attendance paths, and environment documentation.

## 2026-10-18 — Organization workflow and production hardening

### Organization ownership and access

- Retained the organization-first hierarchy: **Organization → Company → Employee → User**.
- Hardened delegated access so Organization Admins receive company scope only for active companies whose parent organization is active.
- Prevented user assignment, employee assignment, and related-record assignment to inactive companies or companies below inactive organizations.
- Kept deactivated organizations and companies in storage for audit/history while removing them from delegated operational scope.
- Confirmed organization deactivation revokes active delegated sessions.

### UX, language, and documentation

- Preserved the centralized English/Arabic translation system and document-level LTR/RTL switching already used by the application.
- Corrected malformed dash encoding in the README.
- Removed unused frontend localization/permission variables and restored the missing HR activity-date helper import so strict frontend type checking passes.
- No production data, environment files, deployment configuration, migrations, or runtime records were deleted during this change.

### Verification to run before release

- Run `npm run check` in a clean terminal after installing the supported Node.js version.
- Back up `data/stocrant.json` (or Render's persistent-disk data file) before deploying.
- Validate real Main Admin, Organization Admin, Company Manager, English, Arabic/RTL, and mobile workflows in staging before production rollout.
