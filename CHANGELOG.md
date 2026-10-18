# Changelog

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