# Invitations pilot

Open **Access & Settings → Invitations**. Choose the recipient, one company and an active company-scoped role. Link an employee when the recipient needs personal attendance. If HR already created an invited account, select that employee to reuse it. Active accounts are managed through Users, not reinvited.

Create invitation link generates a private link without sending email. Send / resend email asks for confirmation and rotates the token. Regenerate link also invalidates the previous link. Revoke prevents acceptance. Expired pending invitations can be regenerated or revoked; accepted and revoked invitations cannot be reused. Validity follows Onboarding & Security's invitation-hours setting.

Links open `/login#invite=…`, keeping the token out of server URL logs; the app removes it from browser history on load. Only a SHA-256 digest is stored. The recipient supplies the invited email and a password of at least 12 characters. Acceptance rechecks the current issuer's authority, company/role availability, employee ownership, uniqueness, and token status after password hashing. It does not accept client-supplied company, role or permission overrides.

Email uses the existing Resend server configuration: `STOCRANT_EMAIL_API_KEY`, `STOCRANT_EMAIL_FROM` and an HTTPS `STOCRANT_APP_URL`. Provider acceptance is reported separately from inbox delivery. A failed send can be retried through Send / resend email. No durable email retry is scheduled for this explicit invitation flow; regenerating invalidates older email links.

## Local/staging verification

Set `STOCRANT_ATTENDANCE_PILOT=1` in the server process environment before running the pilot. This overrides saved attendance deduction settings, rejects enabling attendance deductions, and rejects separate payroll previews/generation/recalculation that would deduct salary. Existing payroll records are preserved. The server does not load `.env` automatically. Do not enable a live pilot without configuring its server environment separately.

- `npm test` includes `server/invitations.test.ts`: isolated Amal fixtures for Employee, HR Manager, General Manager and Finance Manager; password setup; exact company/role; cross-company denial; administrator permission limits; expiry, rotation, revocation, replay and concurrent acceptance; local email provider stub; HR → General Manager → Finance attendance approval; skipped-stage denial; pilot attendance/payroll deduction protection.
- `npm run test:invitations`: builds and runs an isolated headless Chrome test of the desktop invitation form, mobile width and recipient password setup. Requires Chrome or `CHROME_EXE`. Screenshots stay in ignored `.local-preview/invitations/`.
- `npm run check`: project type checks, server/script tests, translation checks, builds and production smoke checks.

Tests use temporary business data and a local email provider stub. They do not invite a real Amal account. Live delivery, live hosting deployment, pilot environment configuration and phone installation must be verified separately. Ask for authorization before sending live invitations.

## Verified 2026-11-07

Passed `npm run check`: 271 server tests, script and translation tests, TypeScript checks, website/shop/workspace builds and production smoke checks. Passed the invitation browser test at desktop and 390px mobile width, including recipient password setup. Desktop/mobile screenshots were inspected locally. Seven invitation/pilot regression tests cover all four Amal roles and the ordered attendance approval flow.

Fixed during verification: company-role invitations now reuse HR-created invited accounts without retaining Employee permission overrides; invitation URLs open the application instead of the public marketing page; mobile links use the configured API server; pilot mode protects both attendance posting and separate payroll calculations. Live invitations were not sent. Live deployment and device installation remain unverified and were not performed.
