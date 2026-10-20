# Access, settings, approvals and employee onboarding — 2026-10-20

## Administration center

The existing React/TypeScript shared web/mobile app now has grouped Access Management, Organization and Application navigation, collapsible settings navigation, category search, compact live summaries, recent configuration history and connected module links. Phone layouts use a compact scrolling navigation bar. Existing account, app-lock, mobile-server and application-management workflows remain available.

Roles have searchable/filterable lists, assigned-user counts, protected-system indicators, status and update dates. The new role editor supports names/descriptions, supported module/action checkboxes, select/clear by module, permission search, copy, preview, explicit confirmation and current-password verification. It supports assigned-company, department, section and own-record restrictions, plus existing company/location intersections. Scope only restricts an account's existing assignments; it never grants access to another tenant.

Personal/salary read permissions are represented explicitly. Expanding an old `hr.*` grant does not silently add salary access. Account-specific permission overrides remain authoritative and are identified in the editor's explanation. Users can be assigned through the role editor or existing account editor. Role saves revoke affected sessions; inactive roles cannot sign in. Custom roles are deactivated rather than hard-deleted, preserving history. The Main Administrator role is immutable through both the new editor and the existing role mutation path, cannot be copied as a grantable wildcard, and cannot be assigned through the custom-role user picker.

**Intentional authorization change from the latest brief:** company/organization writes are now Main Administrator-only, including actors with older stored `organizations.create/edit/delete` grants. Non-main sessions receive only applicable view/export organization permissions. Delegated company HR, employee/account administration, tasks, notes, payroll and reports continue to use their existing scoped permissions. Global role, policy, security and workflow configuration remains Main-only.

## Approvals

Main Administrators can explicitly approve their own eligible administrative requests when the saved policy permits it. They must supply a reason of at least eight characters. Audit records identify requester, approver, self-approval, record type/reference, time, reason and outcome. Other users cannot self-approve.

Eligibility is restricted to organization/company, department, employee, work-item, note and location-update administrative collections. Actual employee salary changes are excluded. Finance, payroll and inventory remain mandatory separate-approver sections; the UI can require independent review for additional modules or disable the exception entirely. Existing payroll approval/payment and ordered attendance approval implementations are unchanged. An administrator cannot use this exception to bypass those workflows or their normal validation.

The requests view provides searchable status filters, references, requester/reviewer timestamps, actual submission/decision history, reasoned decisions, self-approval badges and Request Changes. Request Changes closes the unchanged submission with a retained reason; the requester revises and submits through the original module workflow. Generic approval rules continue to route to authorized scoped reviewers; no unimplemented approver assignment, invented priority/deadline, or extra attendance stage is displayed. Existing staged attendance approvals stay in Attendance & Timesheets.

## Employee identity and accounts

Employee creation remains transactional and idempotent. Generated `EMP-<year>-<random>` IDs and normalized unique usernames preserve the existing convention. A durable identity reservation ledger backfills live employee codes on normal storage load and retains them after deletion. Generated IDs check both current employees and reservations; previously issued codes cannot be reused within their existing company namespace. Historical codes deleted before this migration cannot be reconstructed automatically.

Automatic account creation and automatic email queuing are independently configurable. Main Administrators can create individual employee profiles without login accounts. Existing no-email/no-login records remain valid; missing email produces an actionable delivery failure rather than deleting the employee or guessing a recipient. Default accounts remain restricted to own records. The shipped Employee default retains its HR-only account override; custom onboarding roles must be active and cannot contain administrative/finance/payroll/approval privileges. Main Administrators can grant further access through the existing Users workflow.

After a new employee is saved, the profile opens its Account & Access confirmation, showing ID, username, account status and delivery status to authorized viewers. Creators with create/view access can see their created account's safe summary; issuing/resending invitations still requires HR-edit or account-management authorization. Pending email status refreshes while the account panel is open.

## Mail setup required

No existing email provider was configured in the repository. This adds a dependency-free Resend HTTPS integration using Node's built-in fetch and crypto. Live service credentials and a verified sending domain must be configured by the operator; they are never entered in the administration form or committed to Git.

| Server environment variable | Required value |
|---|---|
| `STOCRANT_EMAIL_API_KEY` | Resend key authorized to send mail |
| `STOCRANT_EMAIL_FROM` | Sender address, optionally with a display name, on a verified domain |
| `STOCRANT_APP_URL` | Public application URL using HTTPS, without credentials, query or fragment |
| `STOCRANT_ONBOARDING_KEY` | Stable base64 encoding of exactly 32 random bytes for AES-256-GCM |

Generate the encryption key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and store it in the server's secret/environment manager. Keep it stable across restarts. The `.env.example` contains placeholders only; ordinary `npm start` inherits process environment and does not automatically load a private `.env`. If using a private environment file, build first and launch with Node's `--env-file` option, or configure the deployment service environment. Restart the server after changing environment configuration. Never use a `VITE_` prefix for these secrets.

The Main-only Onboarding & Security screen reports configuration flags, account/email automation policy, restricted default role, 1–168 hour invitation validity, email language and support address. It does not claim that a merely configured sender has been verified by the provider. Missing configuration creates a visible failed delivery record; after configuration, use Send / retry onboarding email on the employee's account panel.

## Delivery and token handling

The employee/account transaction stores a durable outbox entry. Its full mail payload, including the activation link, is AES-256-GCM encrypted. Invitation verification stores only a SHA-256 digest of a cryptographically random 32-byte token. No permanent password is emailed. Password setup uses existing password validation and rate limiting; tokens expire, are consumed once, and are invalidated by resends or relevant linked-account identity changes.

The normal `server/index.ts` process scans the outbox every 15 seconds, in bounded batches. Failed provider calls back off and stop after three attempts; an authorized retry reuses the same encrypted request and idempotency key while within the safe retry window. Later resends issue a new invitation without recreating the employee or account. Payloads include branding/company, employee name/code, username, expiry, secure link, first-login instructions and optional support email, in English or Arabic. Account and mail details are not published to notifications or audit payloads.

`Sent` means the provider returned an acceptance ID, **not** proof of inbox delivery. Invitation acceptance/account activation is tracked separately and does not rewrite the delivery outcome. No delivery/bounce webhook or inbox-read tracking is configured. See the official [send-email API](https://resend.com/docs/api-reference/emails/send-email) and [idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys). Provider idempotency lasts 24 hours; automatic retries are bounded, and retained-payload retries stop before that boundary. Keep the encryption key available to process pending messages; rotation requires safely replacing outstanding invitations. This worker follows the existing single-process JSON-store architecture, not a multi-instance distributed job queue.

## Files, migrations and validation

Core additions: `server/admin-policy.ts`, `server/onboarding.ts`, `server/routes/administration.ts`, `server/administration.test.ts`; `RoleManagement`, `AdministrationPolicy`, `ApprovalRequests`, `SettingsNavigation`; shared administration CSS/translations and `scripts/verify-administration.mjs`. Existing auth, permissions, common employee mutation, storage, employee/account/profile and settings code is reused and extended. The original brief is archived under `docs/project-archive/ACCESS_ONBOARDING_BRIEF.md`.

Storage changes are additive: `onboardingEmails` and `employeeIdentities` collections; optional administration policy and role status/scope fields. Existing usernames, passwords, employee IDs, tenant links, account overrides, payroll records and audit events are not rewritten. Tests use isolated temporary data; production runtime data was not modified.

Validation includes 148 API tests plus 10 UI support tests, server/frontend TypeScript, storage backup/restore checks, production build/security smoke tests, real Chrome administration workflows and English/Arabic light/dark desktop/tablet/phone layouts. The full 348-case route matrix and existing organization-manager workflows passed. Final focused checks passed for the 12-case administration route matrix, payroll, company profiles, complete workspace/PDF reports, HR documents and HR communication/activation; screenshots were visually reviewed. The dependency audit reported zero vulnerabilities. Details are recorded in the task log. There is no configured lint command; translation checks, TypeScript and whitespace checks are used.

Transport tests use an isolated HTTP provider fixture to verify the real worker request, encrypted persistence, idempotent retries and token activation. Live Resend delivery, DNS/domain configuration, actual mailbox receipt, native packaging and hosting deployment require separate operator setup/verification; none is implied by the source commit or GitHub push.
