# Dedicated company workspace

## Complete organization and employee follow-up

The follow-up brief is retained in `project-archive/2026-10-20-COMPLETE-WORKSPACE-BRIEF.md`. Company and employee data remain in the existing store; employee address is an optional additive field. No migration, password reset, relationship rewrite or production operation is performed automatically.

Employee profiles now use the existing `/hr/employees/:id` route with persistent section links for personal, employment, contact, account/access, HR records, payroll, documents and activity. Existing account-setup hashes are supported. Salary and payroll remain permission-gated. Related records resolve explicit employee links, with unambiguous same-company legacy name fallback; ambiguous names do not grant access. Assigned shift metadata is shared by the profile and shift report without exposing salary configuration values. Existing payroll and document APIs retain their separate authorization rules.

Employee editing reuses the existing validated form, audit and account synchronization flows. Saving and cancelling return to the profile. Delete requires confirmation and existing delete permission; linked accounts, payroll and retained-document safeguards remain authoritative. An authorized unlinked legacy record can still be deleted. No account password is returned or printed.

Personal information is redacted by the API, including address. Salary permission is independent of general HR editing and personal-data permission; hidden salary defaults are removed from unauthorized mutations so an unrelated edit cannot zero the existing amount. Salary-change history details are also redacted without salary access.

Reports are available through `/company-report` and fresh backend-authorized datasets. Each request requires view and export permission for its section, company/location/ownership scope, and applicable personal-data redaction. Company reports cover company information, the complete employee list, contact directory, attendance, shifts and leave. Employee-specific profile and HR reports use the same employee scope. Payroll reports, exports and payslips remain in the existing payroll workspace. Print and Export PDF recheck authorization immediately before opening the browser print dialog; choose Save as PDF for a PDF file. No email or external document service receives the reports.

Printed pages include company branding/identity, title, generation date, repeated table headings and page counters. Tabular directories and HR reports use landscape pages; company information and employee profiles use portrait. Print rules are scoped to the report route, preserve other existing print workflows, force white paper in both themes and omit navigation/buttons. On-screen reports remain scrollable on narrow devices.

Final verification: project checks passed 126 API/unit tests plus 10 UI support tests, frontend/backend TypeScript, storage/backup checks, frontend production build and production security smoke checks. New integration coverage verifies export denial, cross-company isolation, salary/personal-data separation, protected salary updates, linked shift reports, allowed unlinked deletion and retained audit events. Company and private-document browser regressions passed. The complete-workspace browser test covers organization/company selection, eight employee sections, edit/persistence/cancel, protected deletion, actual Print/PDF actions, 68-row reports and Arabic responsive views.

Four PDF fixtures were generated locally: one-page company information, one-page employee profile, and five-page English and Arabic employee directories. PDF.js parsed every page; all 68 directory rows, repeated table headings and visible text were checked, and first/last pages were rendered to PNG for visual review. The local PDF rendering tools and QA fixtures remain ignored and are not application dependencies. Physical printers, native print dialogs, production hosting and device installation are not verified by these local checks.


The final frozen build also passed all 348 route/language/theme/viewport combinations, including live System appearance and preference persistence.

The original company redesign below remains the baseline implementation record.

Implemented on 2026-10-20 in the existing company profile route, `/organization/companies/:id`. Section URLs use `?section=...`; existing company and edit bookmarks remain valid.

The identity header displays the company name, trade name, status, company ID, logo or fallback, and recorded contact details. Company settings can save or clear an HTTPS logo URL; the API rejects unsafe protocols and embedded credentials. The company switcher contains only companies within the current account's scope.

Persistent, wrapping navigation exposes existing capabilities according to permissions:

| Section | Connected functionality |
| --- | --- |
| Overview | Real employee/active employee/pending leave/payroll-period counts, company details, recent employee records and pending leave reminders |
| Employees | Existing directory, profiles, automatic IDs/accounts, activation, search, department/status filters, name/newest sorting and pagination |
| HR & Attendance | Scoped shifts, attendance and leave records; existing record details and management lists |
| Payroll | Company payroll periods and statuses; existing payroll workspace, salary versions, earnings/deductions and reports |
| Notifications | Existing company-preselected composer for announcements, urgent shift updates, meetings and direct messages |
| Users & Permissions | Scoped assigned users, role names, statuses and existing authorized account-management controls |
| Reports | Employee summary and company-preselected attendance/payroll reports |
| Company Settings | Existing company edit/save/cancel and contact/business fields, plus validated logo URL |

The company-profile API filters records by company and existing location/ownership scope, retains employee redaction, and exposes payroll summaries only with payroll-view permission. User data retains existing account-management visibility rules. It does not return passwords or payroll amounts through the new summary. No data migration, relationship rewrite, sample metrics, native build, deployment or real payroll operation is part of this change.

Company query parameters now preselect existing payroll, attendance, communication and user-management filters. Registry record lists filter the returned authorized records by company; their all-company export action is hidden in this filtered view to prevent misleading exports. Existing report-specific exports remain available through their workflows.

Verification uses temporary data: full project checks (124 API/unit tests plus 10 lock/notification/translation tests), cross-company and permission regression tests, logo validation/save/clear tests, company edit/save/cancel, email validation, employee creation/activation and username login, company switching, all eight sections at desktop/tablet/mobile widths, selected-company payroll/attendance/composer links, and Arabic dark RTL screenshots. Existing payroll and HR communication browser workflows are also checked. No physical-device or production-hosting claim is inferred from local browser results.
