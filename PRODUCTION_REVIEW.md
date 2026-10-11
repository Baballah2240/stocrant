# Production review

The public introduction and contact form are available at `/welcome`. Signed-out web visitors at `/` see that website; `/login` opens sign-in. Native users retain their employee workspace. Contact messages are saved locally and appear under **Access & Settings → Contact inbox**, visible only to the main admin. This does not send email automatically.

## Changes

- Patched React Router and Vite dependencies. Run `npm audit` to check current advisories.
- Isolated frontend assets in `dist/web`; compiled server code is not publicly served.
- Enforced production origin checks, security headers and a content security policy.
- Required a private session secret of at least 32 characters; ignored malformed cookies and returned safe JSON errors for invalid bodies.
- Checked mutation scope before approval and prevented edits to audit ownership fields. Finance and inventory summaries honor the user's scope.
- Preserved unreadable data instead of replacing it with demo records. New production installations start empty.
- Added flushed atomic writes and a daily snapshot under `data/backups`. Keep independent off-server backups too; monitor disk usage and retention.
- Attendance uses `STOCRANT_TIME_ZONE` (default `Asia/Riyadh`), with one check-in and one check-out per account per day. Main admin cannot use attendance.
- Added request timeouts and graceful server shutdown.
- Removed 114 obsolete root logs and scratch files after copying the current data into `data/backups`. Source, native projects and business data were retained.

## Verification

Run `npm run check`, `node scripts/verify-storage.mjs`, `npm run check:data`, and `npm audit`. The data check is read-only and prints integrity findings rather than personal records. API tests use isolated temporary data, not the business database.

## Deploy and connect mobile

Use Node 24, HTTPS, one server process and a persistent writable disk. This application uses a JSON-file database and in-memory rate limits; multiple replicas require a shared database and rate-limit store first. Set `NODE_ENV=production`, `STOCRANT_SESSION_SECRET`, the initial `STOCRANT_SETUP_KEY`, and `STOCRANT_DATA_DIR`. Optional `STOCRANT_CONTACT_EMAIL` and `STOCRANT_CONTACT_PHONE` appear on the website. Set additional trusted frontend origins explicitly if needed.

Build with `npm ci && npm run build:full`; start with `node dist/index.js`. See `DEPLOY_RENDER.md`. The local website has not been published by this review; deployment needs access to the hosting account and configured production secrets.

The connected Android phone loads the same local web app over USB, so web interface changes reach it without reinstalling. Keep both servers running and restore `adb reverse tcp:5173 tcp:5173` after reconnecting. For updates away from this computer, build the native shell with `STOCRANT_MOBILE_WEB_URL` set to the actual HTTPS app origin. That URL must host this same API and frontend; native plugin changes still need a new app build. Do not ship a production app pointing at a development HTTP server.

No browser automation surface was available for visual verification. Real-device acceptance, public HTTPS deployment, backup restoration on the hosting platform and monitoring remain deployment checks; automated tests cannot establish that a system is bug-free.

Final local results: 25 API tests passed; storage verification, both TypeScript checks and frontend/Android builds passed; npm audit reported zero known vulnerabilities. HTTP smoke checks passed for the public website, API health and web assets; compiled server source returned 404. Existing business collections were verified against the pre-review backup after removal of temporary test artifacts. The Android update was installed successfully with app data retained.
