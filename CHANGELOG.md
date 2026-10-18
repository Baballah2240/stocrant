# Changelog

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
