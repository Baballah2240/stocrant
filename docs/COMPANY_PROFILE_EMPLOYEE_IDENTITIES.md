# Company profile and employee identity update

Implemented and verified locally on 2026-10-19. Existing application architecture, company routes, employee IDs, passwords and business relationships are retained.

## Company profile

`/organization/companies/:id` now opens a dedicated company profile. Its existing `/edit` URL opens an explicit edit mode with Save/Cancel, validation and success/error feedback. The two-column desktop layout becomes one column on mobile, supports English/Arabic and RTL, and uses the existing dark/light theme.

The header contains a breadcrumb, company icon, company/trading names, status, and permission-aware actions. Cards group overview, contacts, business information and organization/access. Organization names are resolved server-side instead of displaying raw IDs. Optional empty values are hidden or marked Not provided. Creation date uses existing metadata, never an invented historical date.

Only existing schema fields are edited: name, trading name, organization type, status, primary contact, phone/email, country, industry, combined tax/registration ID, currency and notes. A separate company logo, address, city, website or commercial-registration field is not supported by the current schema, so no fictional values or duplicate fields were added. The company icon is a fallback; employee photos use existing account avatars where available and permitted.

The Employees section offers counts, name/Employee ID/username search, department/status filters, ten-row pagination, profile/edit/account links, and Add Employee with company/organization preselected. Company-context forms lock the company selector. Direct API requests still validate company scope. Employee/account summaries and assigned users are independently permission-filtered; organization administrators appear only to account managers permitted to see them.

## Employee IDs, usernames and accounts

- HR-created records get server-generated `EMP-YYYY-XXXXXXXX` identifiers using cryptographic entropy. Allocation checks all companies and retries collisions. Existing codes remain unchanged, and subsequent edits cannot replace them. Main Admin legacy imports may retain custom identifiers for compatibility.
- New employee forms show the ID as read-only. After saving, the employee profile immediately displays the assigned ID and linked-account information.
- Account usernames are generated from a normalized name, falling back to the Employee ID for names without Latin characters. Collisions get a random suffix. Usernames are globally unique without case sensitivity, 3–40 characters, and start with a Latin letter. Authorized administrators can change them in Users; HR employee payloads cannot change account usernames/roles/permissions.
- Login accepts either the existing email field or a username. Existing email login remains supported; registration and password-reset email requirements are unchanged.
- The existing employee/account transaction creates both records or neither, with Employee defaults and correct company/location scope. New forms use a stable request UUID, so concurrent retries without contact information cannot create duplicate employee/accounts. Pending approval submissions also reuse their pending request. With an HR approval rule, IDs and accounts are allocated only on approval.
- The employee profile includes a direct account-setup card with username, account/activation status, role, company/organization names and private invitation generation. No separate manual credential creation is required. Existing single-use 48-hour invitations, scrypt password setup, employment suspension, session revocation and last-Main-Admin safeguards remain in place. No mail/SMS integration is assumed or invoked.

## Additive migration and storage constraints

On store load, accounts lacking a username receive a unique one. Existing usernames, emails, password hashes, account/employee IDs, and company relationships are preserved. Before the first migrated write, the original file is copied to `stocrant.pre-identities-v5-backup.json` in the private data directory. No production dataset was restored or overwritten.

The application uses a JSON store, not a SQL database. Unique constraints are enforced before every atomic disk write: Employee IDs remain company-unique for historical compatibility, generated IDs check globally, and usernames are globally unique. Transactions roll back constraint violations. Nontransactional write failures invalidate the in-memory cache so the next read restores the intact on-disk state. Existing conflicting/invalid identities fail closed for review instead of being silently rewritten.

New metadata: `accessUsers.username`, the existing linked-account backlink, and `employees.employeeRequestKey` for idempotent form submissions. No additional employee/user tables or plaintext credentials are introduced.

## Files

- Backend: `server/employee-identity.ts`, `server/routes/company-profile.ts`, `server/storage.ts`, `server/registry.ts`, `server/workspace.ts`, `server/employee-accounts.ts`, `server/organization-policy.ts`, `server/routes/auth.ts`, `server/routes/workspace.ts`, `server/hr-messages.ts`, `server/auth.ts`, `server/app.ts`.
- UI: `src/components/CompanyProfile.tsx`, `EmployeeAccountPanel.tsx`, `EntityForm.tsx`, `EntityDetail.tsx`, `AuthPage.tsx`, `AccessWorkspace.tsx`; `src/App.tsx`, `src/types.ts`, `src/translations.ts`, `src/company-profile-translations.ts`, `src/company-profile.css`.
- Checks: `server/company-profile.test.ts`, updated approval fixture in `server/hr-communication.test.ts`, `scripts/verify-company-profile.mjs`, `package.json`.
- Mobile history: `mobile/UPDATES.md`. The Android debug package is rebuilt and saved in the ignored `mobile/releases/` directory with its checksum manifest. No automatic hosting deployment or phone installation is implied.

## Verified

- `npm run check`: both TypeScript checks, 81 API tests (nine new company/identity cases), eight lock/notification/translation tests, storage/backup checks, production build and production security smoke checks passed.
- `node scripts/verify-company-profile.mjs`: readable organization labels, employee pagination/search by username, edit/save/cancel, email validation, preselected/locked company, automatic ID/account display, inline invitation, desktop/tablet/mobile viewport, Arabic dark RTL and real username sign-in passed in isolated Chrome.
- `node scripts/verify-hr-communication.mjs`: existing activation, HR messages, urgent alerts, private receipts and acknowledgment browser regressions passed.
- Android debug build completed successfully and was saved locally; this build has not been installed on the phone during this task. Production distribution still needs the deployed HTTPS API and stable release signing.

All test accounts and records were created in temporary isolated databases. No real external messages or production changes were made. The JSON backend remains intended for a single writable application process; multiple writers require a shared transactional database.
