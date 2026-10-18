# Changelog

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
