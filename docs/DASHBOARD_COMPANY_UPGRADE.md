# Dashboard and company management upgrade — 2026-10-20

This extends the existing React/TypeScript/Vite shared web/mobile application and Express JSON-store APIs. Authentication, tenant and location scoping, payroll, HR approval stages, private documents, account activation, audit history, and existing theme/language providers remain authoritative.

## Delivered behavior

- Company headers use an existing logo or initials, business classification, status, contacts and authorized actions. Technical identifiers are in a closed disclosure. Information cards support inline Save/Cancel, backend validation and immediate updates. The existing full edit route remains available.
- Company navigation adds Information, Managers, Departments and Sections, Documents and Activity History alongside the existing operational sections. Documents reuse the private document service and its upload/archive/approval workflows.
- The employee directory supports name/employee-ID/username search; department, section, manager, status and job filters; sortable columns; 10/25/50 rows; column visibility; per-page selection and confirmed bulk employment-status updates. Existing profile, account, editing and authorized report links remain connected. Salary is an optional column only when returned by the authorized API.
- Manager cards show direct reports, reporting relationships, assigned organizational units, authorized contacts and actual open team-task counts. Searchable assignment forms edit stable employee/department/section links. Department and section dashboards show their members and open work; existing records can be edited, moved and deactivated.
- Desktop and mobile dashboards share a reusable analytics workspace. It exposes authorized summary links, category distributions, dated metrics, status stacks, bar/doughnut/line/area views, a precise data table, tooltips, optional legends, date ranges, filters and reset. Widget visibility/order and chart selections persist per account and workspace on the current device. Existing personal attendance, leave, documents, tasks and operational/financial widgets remain.
- Notification history has All/Unread/Read, category, text and date filters, ten-row pagination, read/all-read actions, sender/priority/timestamp details and real record links. It retains HR acknowledgment/detail behavior, protects retained HR messages from deletion, refreshes through existing polling and synchronizes read counts with the header panel. Offline/error/retry states are explicit.
- New components use existing visual tokens, English/Arabic translations, locale formatting and RTL direction. Theme changes update chart colors without reloading. No restaurant-specific features were added.

## Data and security

No destructive migration or new storage collection is required. Existing `departments` rows accept optional `kind` (`department`/`section`), `parentDepartmentId`, `managerId` and status. Employees accept optional `departmentId`, `sectionId` and `managerId`. Legacy department and manager strings are retained until an explicit structured assignment; the application does not guess identities from ambiguous names.

All new links are validated in the common mutation policy, including generic CRUD and approval application. They must reference records within the actor's existing scope and the same company. Reporting cycles, section-parent cycles, invalid section membership, inactive new assignments and removals/transfers that orphan linked records are rejected. Sections with assigned employees require reassignment before moving or changing type; the server never leaves their department links inconsistent. Deactivation retains history and existing assignments. Assigning a reporting manager does **not** grant new application permissions or expand an account's company/location access.

The analytics API aggregates only records accepted by existing permissions and scope checks. Employee-only access counts personal rows; unauthorized company/manager filters fail. Responses contain counts and permitted selector names, without salary, contacts or notification bodies. Generic CRUD mutation responses now apply the same salary/contact redaction as reads. Significant changes continue to use existing audit and approval transactions.

## Analytics definitions and limits

- Workforce and company status are current snapshots; temporal grouping/date ranges are unavailable for these metrics.
- New hires use recorded hire dates. Attendance uses record dates; leave uses request start dates; tasks use creation timestamps and current status; notifications use creation timestamps.
- No historical headcount, performance rating, cumulative growth, or completion trend is inferred from a current snapshot. Zero date buckets mean no matching dated records. Undated records are excluded from dated metrics, with an explanation in the interface.
- Team filters consider every task assignee. Department/section/manager task categories classify the primary assignee, as stated in the interface. Tasks are counted once, rather than inflating totals by team size.
- Date queries are limited to a year. Actual records and independent status series are available in the table alternative; the charts use a zero baseline and no invented comparison periods.
- Manager totals refer to employees linked as a reporting or organizational-unit manager. Unlinked role titles and free-text legacy manager names are not treated as verified supervision.
- Company notification analytics include owned alerts linked to identifiable company HR messages, documents, work, leave or approval records. General account notices without a company association remain in personal/global notification metrics.
- Browser preferences are device-local, not cross-device settings. Polling uses the existing 30-second interval, not WebSockets. Existing HR-message retention rules apply; no unsupported archive operation is presented.
- Chart.js is the only added application dependency (plus its transitive color helper). Selected controllers/scales/plugins are registered explicitly. The charts are loaded in the dashboard/company route chunk. Integration and accessibility follow the official [integration](https://www.chartjs.org/docs/latest/getting-started/integration.html) and [accessibility](https://www.chartjs.org/docs/latest/general/accessibility.html) documentation; every chart has an accessible name and table alternative.

## Validation

- `npm run check`: server/frontend TypeScript, 140 API tests, 10 UI support tests, storage corruption/backup/restore checks, frontend production build and production security smoke checks.
- `server/dashboard-upgrade.test.ts`: same-company/acyclic reporting links, hierarchy retention, legacy data preservation, mutation salary redaction, administrator/organization/company-manager/employee analytics scope, exact date buckets, invalid ranges and private notification read counts.
- `scripts/verify-dashboard-upgrade.mjs`: actual browser editing, department/section creation, reporting assignments, managers/team views, directory filters/page sizes/bulk edits, chart types/date ranges/scope, persistent chart/layout settings, notification filters/read actions, real administrator/manager/employee sessions and English/Arabic light/dark desktop/tablet/phone layouts. Browser data lives in isolated temporary stores and is removed afterward.
- Existing company, complete-workspace, organization-manager, document, payroll and notification-panel browser checks passed. The full 348-case route matrix passed; a further 12-case dashboard matrix checked the final analytics/preference adjustments after that build. See the task log for final commands/results.

There is no configured lint command; TypeScript, translation checks and `git diff --check` cover source checks. Production data is not used by these tests. Native packaging, physical device testing, hosting deployment and phone installation are separate actions and were not performed for this source upgrade.
# Dashboard layout customization — November 2026

Open **Dashboard → Customize dashboard**. Choose Balanced, Daily focus or Management focus, then select Comfortable or Compact spacing. Presets are previews until **Save layout** is pressed; **Cancel** restores the saved arrangement and spacing.

Each card has an expandable **Edit card** control with keyboard-friendly earlier/later buttons, a drag handle, width and height controls, and visibility. **Show all cards** restores hidden cards in the preview. **Reset layout** restores defaults and still requires saving.

Layouts and spacing belong to the signed-in manager account and survive reloads. Existing saved arrangements are retained. Presets only use cards already available to the user and never grant permissions. Version checks reject stale saves from another session. Older clients can continue saving layouts without a density field.

Tablet layouts use two columns where space permits; phones stack cards and preserve readable summaries. Fixed card heights use contained scrolling, with automatic heights available to remove it. Reduced-motion settings are respected.

Validation: full repository checks passed; `scripts/verify-dashboard-customization.mjs` verified 20 English/Arabic, light/dark desktop/tablet/mobile layouts, saving and reloading, preset visibility, recovering hidden cards, canceling previews and mobile edit controls.
