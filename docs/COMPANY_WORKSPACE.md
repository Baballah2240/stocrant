# Dedicated company workspace

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
