# STOCRANT production readiness

Local application audit: October 20, 2026. Local verification is complete for the checked source; this is not confirmation that a live server or installed phone has these changes. The detailed findings and cleanup inventory are in `docs/APPLICATION_AUDIT_2026-10-20.md`.

## Verified locally

- Backend/frontend TypeScript, including server unused-local and unused-parameter checks.
- 122 API/unit tests, two app-lock tests, two notification tests and six translation tests.
- Corrupt-store preservation, clean production initialization, daily backup creation and an isolated restore exercise.
- Production-mode smoke checks for SPA/assets, security headers, cookies, trusted mutation origins, cache policy and private data.
- Browser route coverage in English/Arabic and light/dark appearance at desktop, tablet and mobile widths, plus focused business workflows. See the audit report for actual commands and final results.
- Both management and independent public website builds. Dependency audits reported no known vulnerabilities in either locked tree at audit time.
- A limited tracked-source scan found no private-key blocks or tested AWS/GitHub token patterns. No credentials were printed or added to source.

No lint or formatter command is configured. The project uses TypeScript, automated tests, build checks, translation checks and whitespace validation.

## Required before a production release

1. Back up the JSON store and private document bytes together. Keep an independent private copy and perform an isolated restore drill. Backups on the same disk do not protect against losing that disk.
2. Keep exactly one API process/writer and one application instance. The JSON store and in-memory rate limiter do not support horizontal scaling; migrate to a transactional database and shared rate limiting before adding replicas.
3. Verify production mode, a persistent disk, `STOCRANT_DATA_DIR=/var/lib/stocrant`, trusted proxy configuration, allowed origins and private random session/setup secrets. The code rejects unsafe first-run production configuration. Do not put secrets in the repository or chat.
4. Review existing flagged temporary-password accounts. They must change their passwords before business API access. Old native binaries may need the current web interface for that setup until an updated APK is installed. Unflagged accounts are not automatically reset.
5. Review ambiguous/unlinked legacy name assignments and any historical partially decided transfer pairs. The audit preserves historical records rather than guessing ownership or silently rewriting financial history. New transfer pairs are created and decided atomically.
6. Run `npm run check`, both dependency audits and the relevant browser suites on the release candidate. The CI workflow builds website artifacts and Android test artifacts, but CI results for this local audit commit have not been verified.
7. Verify live HTTPS, the deployed source version, private-data controls, tenant roles, company reassignment, approvals, finance/inventory totals and customer workflows with staging accounts. Do not use real payroll or customer records for verification.
8. Configure monitoring for `/api/health`, alert delivery and clear responsibility for access requests, password resets, backups and recovery. Health reachability alone does not prove deployment correctness.
9. Build and distribute a properly signed native release when requested. Verify real-device biometrics, cancellation, session expiration, background lock, pickers, keyboard behavior, Arabic layout and OS printing. iOS requires its own macOS/Xcode/signing/device validation.
10. Configure public website values separately. Its contact form opens a mail draft using `VITE_CONTACT_EMAIL`; there is no server-side contact delivery or management inbox. Without a contact email, the form is visibly unavailable.

## Deployment boundary

This audit does not deploy hosting, install an APK, run destructive migrations or make external payments. `render.yaml` describes a single-instance service with a persistent disk and deployment after passing checks; the actual hosting account/configuration still needs separate verification and authorization. Do not infer a live deployment from a Git commit or push.

## Native release configuration

Use an existing private release keystore and keep a secured recovery copy. Supply `STOCRANT_KEYSTORE_FILE`, `STOCRANT_KEYSTORE_PASSWORD`, `STOCRANT_KEY_ALIAS` and `STOCRANT_KEY_PASSWORD` through the local shell or CI secret store. Do not save passwords in Gradle files.

Use an increasing `STOCRANT_VERSION_CODE`, set `STOCRANT_VERSION_NAME` and build against the intended deployed HTTPS API. Run Capacitor sync and the Android release task using JDK 21. Missing signing configuration intentionally prevents release tasks. Debug and release signing identities are separate distribution paths.

After any requested Android build, run `npm run mobile:save`; keep APKs, keystores, runtime data and credentials out of source control. Source-only changes do not update an installed phone.
