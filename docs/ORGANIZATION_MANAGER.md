# Organization Manager company management

Implemented on 2026-10-20 in the existing shared web/mobile application. The requested Organization Manager maps to the existing **Organization Admin** role (`role-organization-admin`), assigned through `tenantOrganizationIds`. Ordinary Manager accounts are not promoted automatically.

## Scope and permissions

- The shipped organization role now includes company deletion/export and payroll management in addition to its existing HR, attendance, operations, finance, inventory, scoped account and audit permissions.
- An existing role with exactly the previous shipped grant set is upgraded additively and idempotently. Explicit account overrides and customized role grants remain authoritative. No account password or organization/company assignment is rewritten.
- Company, location, ownership and related-record checks remain on the backend. An organization manager cannot enter another organization's companies or attach its employees/tasks to their records.
- Global access-role definitions, organization lifecycle, Main Admin/Organization Admin accounts, configured approval stages and independent/self-approval safeguards retain their existing protection. Password resets use the existing hashed temporary-password flow, revoke sessions and require password rotation.
- Existing inactive company/organization assignment rules and retained-record deletion guards remain in force. Linked tasks/notes also prevent employee reassignment or deletion that would orphan their history.

## Company and employee workspaces

Companies now expose Overview, Employees, Attendance & Shifts, HR & Leave, Tasks, Notes, Payroll, Notifications, Users & Permissions, Reports and Company Settings according to permissions. Existing company switching, employee/account creation, unique IDs, profiles, payroll, attendance correction and private-document workflows remain connected. The overview includes live open/overdue task counts; team assignments appear in each permitted employee's personal work list.

Tasks reuse `workItems` and `workActivity`. A manager can enter a title, description, priority, one or several assignees, start/due dates, status and progress; edit/reassign/complete/cancel tasks; and add authored follow-up comments. New tasks use Pending, In Progress, Completed and Cancelled, while legacy Planned, Assigned and Awaiting Approval states remain valid. Completion sets progress to 100. Existing inactive assignees can be retained on historical edits, while new inactive assignments are rejected. Search, employee/status/priority/date/overdue filters and pagination use the actual scoped records.

Existing free-form company/employee notes remain in their original information and employment forms; they are not silently reclassified or published. New structured notes use the additive `companyNotes` collection, with company, optional employee/task links, category, follow-up date, body and visibility. Author and creation date are assigned by the server and retained on edit. Management-only is the default. Linked-employee visibility is explicit; a note linked to a task follows its current assignees after reassignment. Employee-facing notes and exports exclude management-only notes. Search and employee/category/creation-date filters remain within the selected company. Notes can be edited/deleted with permission and confirmation; tasks with retained notes/activity are cancelled rather than deleted.

Employee profiles include Tasks and Notes when Operations view permission allows it. Automatically created employee accounts retain their existing HR-only defaults. An authorized manager can grant Operations view through Users & Access; this does not grant task creation or unrestricted records. Task assignee sets, scoped legacy access rules and record ownership are enforced by the API.

## Reports

Task-progress, company-note and employee-specific task/note reports reuse the existing authorized report preview and browser Print / Save as PDF flow. Operations view/export permission and the same task/note visibility checks apply to fresh report requests. Existing employee, contact, attendance, shift, leave and payroll reports remain available through their respective permissions. Print output includes company identity, dates, repeated table headings and page counters, supports Arabic/English and excludes application controls.

## Verification

- `npm run check`: 133 API/unit tests plus 10 lock/notification/translation tests, frontend/backend TypeScript, storage/backup verification, production build and security smoke checks passed.
- The shared route matrix passed all 348 route/language/theme/viewport combinations with no uncaught errors. Final company-work filter sizing was additionally checked at desktop, tablet and phone widths.
- Seven new organization-manager integration cases cover assigned child companies, payroll/report access, manual attendance, foreign-company denial, team assignments/dates/reassignment, employee task visibility/dashboard counts, comments, private/shared notes, scoped reports, allowed note deletion/audit events, account permissions, secure password reset/session revocation and additive-role upgrade behavior.
- `scripts/verify-organization-manager.mjs`: real organization-manager sign-in/password rotation, employee/account creation, team task creation/completion/comments, live overview counts, private note create/edit/search, task filters, scoped account editor, company switching and responsive English/Arabic views.
- Existing company, complete-workspace, private-document and payroll browser regressions passed. Existing complete-workspace tests still generate one-page profiles/company reports and five-page 68-employee English/Arabic directories.
- New Arabic task and note PDFs were generated from actual test records, parsed and rendered locally with PDF.js, and visually reviewed. QA artifacts and rendering dependencies remain ignored and are not application dependencies.

Physical devices/printers, native dialogs, hosting deployment and phone installation are separate platform checks. No native build, deployment, destructive migration, real payroll payment, external message or customer-data modification was performed.

Original brief: `project-archive/2026-10-20-ORGANIZATION-MANAGER-BRIEF.md`. Dated changes and platform limitations are also recorded in `CHANGELOG.md` and `mobile/UPDATES.md`.
