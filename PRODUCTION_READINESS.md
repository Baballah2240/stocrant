# STOCRANT launch preparation

Reviewed on 13 October 2026. The code has passed local checks; these changes still need publishing and live verification. A passing build does not prove the production server has the new code.

## Verification completed

- Frontend and server TypeScript checks.
- 32 API tests covering authentication, company boundaries, permissions, attendance, inventory, finance, approvals, notification actions, and concurrent account updates.
- Four lock timer and notification activity tests.
- Storage checks: corrupt files remain untouched, production starts without demo data, a daily backup is created, and an isolated business snapshot restores correctly.
- Isolated production smoke checks: built pages and assets, security headers, secure cookies, untrusted origin rejection, API cache policy, and private data protection.
- `npm audit`: no known dependency vulnerabilities at review time.
- Android debug build and connected-device installation succeeded. A release dry run correctly refused missing signing credentials.
- Both live health endpoints responded with HTTP 200. This only checks reachability.

Run `npm run check` and `npm audit` before every release. GitHub Actions now runs the checks automatically. `render.yaml` selects deployment after passing CI checks; sync the Blueprint or apply the same setting in Render. See https://render.com/docs/deploys.

## Fixes from this review

- Concurrent first-time setup cannot overwrite the first Main Manager.
- Concurrent account creation cannot create duplicate emails.
- Password resets preserve newer account edits; profile/password changes and login recheck the current account after asynchronous password verification.
- Sensitive API responses use `Cache-Control: no-store`.
- Workspace pages load separately, reducing the main JavaScript bundle from about 502 KB to 244 KB. Router preloads and shared chunks also contribute to the first download.
- App and route failures show recovery controls instead of internal stack traces.
- Android app data backup is disabled; release builds require a private signing keystore.

## Required before accepting real customers

1. Publish the tested changes to the connected GitHub repository and confirm CI passes. Previous Git access returned “Repository not found”; check the account and repository access.
2. Verify the Render service uses the persistent disk, `STOCRANT_DATA_DIR=/var/lib/stocrant`, production mode, and private random session/setup secrets. Do not paste secrets into chat or commit them. Disable first-time setup by completing it; the setup endpoint refuses further accounts afterward.
3. Keep exactly one Node process and one Render instance. The JSON store and rate limiter are single-process designs. Migrate to a transactional database and shared rate limiting before adding replicas or promising larger-scale service.
4. Copy backups to an independent private destination and perform a restore drill on an isolated instance. Backups on the same disk do not protect against loss of that disk. Restore the data and confirm company records, account access, and totals before relying on recovery.
5. Use test accounts in staging to verify Main Manager, manager, employee, pending/rejected accounts, company reassignment, approvals, inventory movements, and financial reports. Keep these exercises out of real business records.
6. On a real phone, test fingerprint setup, successful unlock, cancellation, unavailable biometrics, background lock, expired session, picker search, required selections, Arabic layout, and notification scrolling. Automated timer/API checks do not verify the phone's biometric hardware or visual behavior.
7. Configure availability monitoring for `/api/health` and alert delivery to the operator. Decide who handles access requests, password resets, support, and backup recovery.
8. Publish a signed Android release and complete the intended distribution channel's privacy and release requirements. The APK installed during development is a debug build. iOS requires a separate Xcode/signing build and device validation.

## Signed Android release

Use an existing private release keystore and keep a secured recovery copy. Inject these variables through your local shell or CI secret store: `STOCRANT_KEYSTORE_FILE` (absolute file path), `STOCRANT_KEYSTORE_PASSWORD`, `STOCRANT_KEY_ALIAS`, and `STOCRANT_KEY_PASSWORD`. Do not save passwords in Gradle files.

Set `STOCRANT_VERSION_CODE` to an increasing positive integer and `STOCRANT_VERSION_NAME` to the release label. Build frontend assets with `VITE_API_BASE_URL=https://stocrant-web.onrender.com`, run `npx --no-install cap sync android`, then run `.\gradlew.bat bundleRelease` from the Android directory using JDK 21. The result is `android/app/build/outputs/bundle/release/app-release.aab`. Missing signing settings intentionally stop release tasks. Debug installation and a release signed with a different key are separate distribution paths.

## Suggested next features

1. A daily company summary: pending approvals, overdue work, low stock, attendance exceptions, and recent money movements.
2. Stock reorder suggestions: highlight items below their reorder point and prepare a purchase request for approval.
3. Approval reminders and escalation: remind the responsible manager and show how long each request has waited.
4. A searchable audit history: filter by company, user, action, and date; export the permitted results.
5. Better onboarding: guide the Main Manager through company, location, first user, permissions, and first business record.
6. A transactional database migration: company-scoped tables, migrations, tested restore procedures, and concurrency-safe stock and finance writes before scaling.
