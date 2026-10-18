# Employee accounts and HR communication

Implemented and verified locally on 2026-10-19. No production deployment or external messages were sent.

## Using the feature

1. Create an employee through HR. The employee and an invited application account are saved atomically. If an HR create-approval rule applies, both are created only when the request is approved. Duplicate employee IDs/emails are rejected.
2. The account has the Employee role, explicit `hr.view` permission, own-record access, and the employee's company/location. No usable password is generated or displayed. Additional permissions, role selection beyond Employee, and account reactivation use the existing authorized user-management workflow.
3. Open **HR → Employee accounts & notifications**, or the action on an employee row/profile. Select **Create activation invitation**. Privately hand the link to the verified employee. It is a bearer credential: never publish it, put it in tickets, or store it in project documentation.
4. Invitations expire after 48 hours, are single use, and are replaced when reissued. Only a SHA-256 digest is stored. The fragment token is removed from the address bar by the activation page and is not sent in the initial page URL. Password setup uses the existing scrypt hashing function and requires at least 12 characters. The employee then signs in normally.
5. Email is optional at creation. If absent, an internal placeholder reserves the login identity; the invitation lets the employee supply a unique email. If HR already recorded an email, activation must use it. There is no automatic email/SMS delivery or verification service; HR must verify identity before handing over an invitation.
6. Employee edits synchronize linked name/contact information without duplicating the account. Deactivation/termination suspends the account, removes sessions and outstanding invitations, and retains historical records. Reactivating the employee profile alone does not reactivate account access. The last active Main Admin remains protected.
7. Legacy employees/accounts are preserved. An existing email/account collision fails safely rather than silently taking over or relinking an account; an authorized administrator must link it explicitly through Users.

## Notifications

- Select one, several, or the filtered employees of a company. Search covers name, mobile, email and employee ID. The main directory retains department, location and employment filters; communication also offers position/company filtering and linked-account status.
- Compose a title and plain-text message, type and priority, optional HTTPS meeting/reference URL, effective/meeting date, shift time, location, acknowledgment requirement, and future send time. Preview recipients/content before confirming.
- Urgent Shift Change always uses Urgent priority. Notifications never change official attendance or shift records.
- Immediate and scheduled messages are persisted. Production and local-preview entrypoints scan due messages every 15 seconds; inbox/history reads also dispatch overdue messages. Overdue sends recover after restart. Sender permissions, company/location boundaries, employment state and original recipient account relationships are checked again when sending.
- Scheduled recipient lists are snapshots, not live company mailing lists. New hires are not automatically added. Suspended/terminated/deleted or relinked accounts are skipped; sender access loss blocks the send. The history reports individual recipients as **not sent** where appropriate.
- The header bell and `/notifications` show only the current account's notifications. Polling is every 30 seconds while the application runs. Urgent unread/unacknowledged items appear above workspace content. Long messages, dates, safe external meeting links, read/all-read and acknowledgments are available.
- HR history distinguishes **sent** (persisted for the account), **delivered** (retrieved by that authenticated account through the inbox API), **read**, and **acknowledged**, with timestamps. Delivery is not a push/device receipt, and read/acknowledgment cannot prove human comprehension. Fetching the urgent banner also retrieves the inbox.
- HR messages are retained when other disposable notifications are deleted. Reminders resurface the original unread/unacknowledged item, retain its original message/link and receipts, and are limited to one per hour. They are not external push notifications.
- English/Arabic, RTL, dark/light themes and mobile layouts use existing app infrastructure.

## Data and permissions

Additive collections allocated by the existing JSON store: `employeeInvitations` (digest, account ID, expiry, issuer) and `hrMessages` (sender, content, original employee/account recipient mapping, schedule/status, reminder time). Existing `accessUsers`, `employees`, `notifications`, `sessions`, `approvalRequests`, and `auditLog` gain linked metadata or records. Existing business collections and identifiers are retained; no account/password backfill or destructive migration is performed.

`accessUsers.employeeId` is the unique account relationship, with a server-managed `employees.accountId` backlink. Account administration keeps backlinks synchronized. Client employee payloads cannot assign account IDs, roles, permissions, password hashes or activation state. Activation revalidates invitation/account/employment/company and email uniqueness after asynchronous hashing, then consumes the invitation atomically.

HR communication requires `hr.view` plus `hr.edit` and rejects own-record-only managers. Direct endpoints enforce company/location/ownership rules independently of the UI. HR can suspend ordinary Employee accounts; administrator suspension and expanded access require authorized Users management. Notifications are always recipient-account scoped, including reads and acknowledgments. Administrative account actions and message creation/sending/acknowledgment/reminders are audited without passwords or invitation tokens.

Keep the entire existing data directory and private document attachments in backups. Deploy the JSON backend as one writable application process; a shared database/worker would be needed for multiple writers. Scheduling requires the server to be running. This implementation supplies in-app polling, not an external mail, SMS or device-push transport. Invitation sharing must use an independently authorized trusted channel.

## Affected implementation files

- Backend: `server/employee-accounts.ts`, `server/hr-messages.ts`, `server/routes/auth.ts`, `server/routes/workspace.ts`, `server/workspace.ts`, `server/organization-policy.ts`, `server/notifications.ts`, `server/registry.ts`, `server/types.ts`, `server/app.ts`, `server/index.ts`.
- UI: `src/components/HRCommunication.tsx`, `EmployeeActivation.tsx`, `EmployeeInbox.tsx`, `HRMessageDetails.tsx`, `EmployeeDirectory.tsx`, `EntityForm.tsx`, `EntityDetail.tsx`, `HRWorkspace.tsx`, `AccessWorkspace.tsx`, `NotificationBell.tsx`, `Layout.tsx`; `src/main.tsx`, `src/App.tsx`, `src/types.ts`, `src/translations.ts`, `src/hr-communication-translations.ts`, `src/hr-communication.css`.
- Verification/runtime: `server/hr-communication.test.ts`, adjusted account fixtures in existing API tests, `scripts/verify-hr-communication.mjs`, `scripts/start-local-preview.mjs`, `package.json`.

## Verification

- `npm run check`: passed both TypeScript checks, 72 API tests (including 11 employee/communication cases), 2 lock tests, 2 notification/activity tests, 4 translation tests, storage/backup checks, production frontend build and production security smoke checks.
- `node scripts/verify-hr-communication.mjs`: isolated Chrome passed employee selection/account status, private invitation, preview/send, history state, Arabic mobile dark viewport, activation/password setup, urgent banner, safe meeting links and acknowledgment.
- `node scripts/verify-hr-documents.mjs` and `node scripts/verify-notification-panel.mjs`: existing document and notification browser regressions passed.
- Fixtures use temporary databases and generated credentials. Browser checks do not seed the normal local preview or production.
