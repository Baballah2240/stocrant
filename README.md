# STOCRANT

Business management for companies with restaurants, retail stores, offices,
warehouses and branches. Manage the organization hierarchy, locations,
workforce and HR, payroll, inventory, finance and operations from one system.

- **Frontend:** React 19 + Vite + React Router v6 (TypeScript)
- **Backend:** Express 5 + Zod (TypeScript)
- **Data:** JSON file at `data/stocrant.json` (seeded on first run and additively migrated when the data model evolves)

## Setup

```bash
npm install
```

## Development

Run the API and the Vite dev server together:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:api      # builds the server, then serves http://localhost:3000
npm run dev:frontend # Vite dev server on http://localhost:5173 (proxies /api -> :3000)
```

Open **http://localhost:5173** — Vite serves the app and proxies `/api` to the
Express backend on port 3000.

## Mobile apps (Android + iOS)

Native shells built with Capacitor around the same React bundle as the website —
one codebase, so permissions, audit trail and data are identical on both.

```bash
npm install
npm run mobile:build        # build the web bundle, copy into both native shells
```

**Android** — build on any OS. `android/build-apk.bat` produces an installable
debug APK (needs `JAVA_HOME` set to a JDK 21); use `npm run mobile:apk`, or open
`android/` in Android Studio via `npm run mobile:android`.

**iOS** — must be built on macOS with Xcode. The `ios/` project is committed and
ready; run `npm run mobile:build` then `npm run mobile:ios`.

Point the packaged app at your deployment with `VITE_API_BASE_URL=…` at build
time, or per device in **Access & Settings → Mobile app**. Full details,
including how role-based access applies to mobile users, are in
**[MOBILE.md](MOBILE.md)**.


## Core business hierarchy

```text
Company → Locations → Areas / zones → Workforce assignments
                       └→ HR, attendance, leave and payroll
```

- **Organizations:** legal company profiles and business settings.
- **Locations:** restaurants, retail stores, offices, warehouses and branches.
- **Workforce & HR:** departments, employees, attendance, leave, payroll,
  tasks and performance.
- **Operations:** suppliers, customers, products, sales, purchases, expenses
  and returns.
- **Inventory:** warehouse locations, stock, movements, transfers and purchase
  orders.

## Production

```bash
npm run build:full   # vite build -> dist/web/, then tsc -> dist/
npm run start        # build:full, then node dist/index.js
```

In production a single Node process serves both the API and the built frontend:
`GET /` returns `dist/web/index.html`, `/assets/*` are served statically, and
non-`/api` GET routes fall back to the SPA shell. API routes live under `/api/*`.

To run the server without rebuilding:

```bash
npm run build:full && node dist/index.js
```

### Secure first-run setup

STOCRANT requires an authenticated account. On the first visit, create the first
**Main Manager** account using the setup key. Passwords are hashed using Node's
`scrypt`; sessions are opaque, signed, server-stored, HTTP-only cookies. Neither
passwords nor selected roles are stored in browser storage.

For local development only, the fallback setup key is `local-setup`. Set real
random secrets before any shared or production use:

```powershell
$env:STOCRANT_SETUP_KEY = "a-long-private-one-time-setup-key"
$env:STOCRANT_SESSION_SECRET = "a-long-random-session-signing-secret"
npm run dev
```

After a Main Manager is created, add employees from **Access & Settings**. The
server authorizes every protected request from the saved account role, section
permission, organization/location scope, and own-record restriction.

### Data migration, backup and restore

The version-2 migration is **additive**. It keeps existing stores, zones, people
and generic collections; adds authenticated-workspace collections; and maps
legacy tasks/inventory into separate compatible workspace data. Existing seeded
records are marked `demo`; newly entered records are marked `company`.
Before the first migration of an existing JSON file, STOCRANT automatically
creates `data/stocrant.pre-v2-backup.json` beside it.

Before updating or deploying, stop the service and copy the data file:

```powershell
Copy-Item .\data\stocrant.json .\backup\stocrant-$(Get-Date -Format yyyyMMdd-HHmmss).json
```

To restore, stop STOCRANT, replace `data/stocrant.json` with a verified backup,
then restart. On Render, back up `/var/lib/stocrant/data/stocrant.json` from the
persistent disk before a major update.

### Render deployment and custom domain

The repository includes `render.yaml` for a single Node.js web service with a
persistent disk and `www.mohbaba.online` configured as its custom domain. See
[`DEPLOY_RENDER.md`](DEPLOY_RENDER.md) for the complete GitHub, Render, DNS and
HTTPS verification steps.

> **Security note:** production requires `STOCRANT_SESSION_SECRET` and a private
> `STOCRANT_SETUP_KEY` before the first account is created. JSON persistence is
> suitable for this single-instance deployment; move to a managed database before
> horizontally scaling or using high-concurrency workloads.

## Environment

| Variable             | Default            | Purpose                                   |
| -------------------- | ------------------ | ----------------------------------------- |
| `PORT`               | `3000`             | HTTP port for the API / static server     |
| `STOCRANT_DATA_DIR`  | application root   | Base directory; data is written to `<value>/data/stocrant.json` |
| `STOCRANT_SESSION_SECRET` | required in production | HMAC secret used to sign secure session cookies |
| `STOCRANT_SETUP_KEY` | required for first production setup | One-time key required to create the initial Main Manager |

## Scripts

| Script                    | What it does                                              |
| ------------------------- | --------------------------------------------------------- |
| `npm run dev`             | API + Vite dev server (concurrently)                      |
| `npm run dev:api`         | Build server and run `dist/index.js`                      |
| `npm run dev:frontend`    | Vite dev server with `/api` proxy                         |
| `npm run build`           | Compile server TypeScript to `dist/`                      |
| `npm run build:frontend`  | Vite production build to `dist/web/`                          |
| `npm run build:full`      | Frontend into `dist/web/`; server into `dist/`      |
| `npm run start`           | `build:full` then serve                                   |
| `npm test`                | Build server, run `node --test dist/routes.test.js`       |
| `npm run typecheck`       | `tsc --noEmit` for the server                             |
| `tsc --noEmit`            | Type-check the frontend (`src/`) using `tsconfig.json`    |

## Tests

```bash
npm test
```

Tests run against a throwaway temp directory (`STOCRANT_DATA_DIR` is set by
`server/test-env.ts`), so they never touch `data/stocrant.json`.

## Cleanup

- `dist/` — build output (safe to delete; regenerated by `npm run build*`).
- `data/` — runtime data store. Delete `data/stocrant.json` to reset to the
  seeded demo data.
- `server_out.log` / `*.log` — any captured logs are safe to remove.
