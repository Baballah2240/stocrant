# STOCRANT Mobile Apps (Android + iOS)

## Live web app over USB (development)

Set `$env:STOCRANT_MOBILE_WEB_URL='http://localhost:5173'` before `npm.cmd run mobile:apk` to load the running web app instead of bundled assets. Install that APK, then run `adb -s AMEGJV5A23G10506 reverse tcp:5173 tcp:5173`. Keep the USB cable connected and both local servers running. The phone uses the same API through Vite's `/api` proxy and receives interface updates without reinstalling. Repeat the reverse command after reconnecting or rebooting the phone. Normal builds without this environment variable continue to use bundled assets.

## Employee-first mobile workspace

Native apps and browser windows up to 700 px wide open the mobile HR home.
Bottom navigation gives quick access to Home, Attendance, Leave, My Work and
More. Features are shown according to saved account permissions.

- Employees can check in/out, view their attendance history, submit leave,
  cancel pending leave requests, read their documents and policies, and view
  assigned work. An active linked employee profile is required for attendance
  and leave submission.
- Managers and the main admin also get shortcuts to team HR, operations,
  inventory, finance and company services permitted by their account.
- Leave requests always start pending. Only the main admin manages HR records
  and approves/rejects leave through HR. A leave notification opens the request.
- Personal self-service does not grant general employee editing permission.
  The server derives the employee and company from the authenticated account.
- Profile photos, personal details, password changes and reset notifications
  are shared with the web app. Open the profile in the header or More.

Leave duration currently counts calendar days; leave balances and holiday
deductions are not configured. Notifications refresh while the app is open;
background push notifications are not implemented.

The Android debug APK is generated at
`android/app/build/outputs/apk/debug/app-debug.apk`. Enter your reachable HTTPS
STOCRANT server on the mobile sign-in screen. Use `mobile:apk:lan` only for
trusted local-network testing. The backend must also be updated to expose the
new self-service endpoints. iOS assets can be synced on Windows, but compiling
and signing the iOS app requires macOS and Xcode.

The native apps are a Capacitor shell around the same React build that serves the
website. There is **one codebase**: the API, permissions and audit trail are
shared, so a user sees exactly what their role allows on the phone as on the web.

```
src/            React app (shared by web + both native shells)
android/        Native Android project (Gradle)  → build on any OS
ios/            Native iOS project (Xcode)       → build on macOS only
capacitor.config.ts   App id, name, splash screen, status bar
```

---

## 1. Who gets access

Access is decided **on the server**, never by the app. The website uses an
HTTP-only session cookie; native apps use the same signed server session in an
Authorization header because WebView-to-server requests may not carry a
cross-site cookie. The API returns only what the signed-in user's role permits
— identical to the website.

| Role | Typical mobile use |
|---|---|
| **Main Manager** (`role-main-manager`) | Everything: organizations, locations, HR, operations, inventory, finance, access & settings |
| **Manager** (`role-manager`) | Runs their location/operations areas; sensitive actions queue for approval |
| **Employee** (`role-employee`) | Own records only — sees the work assigned to them, their own profile and alerts |

Three layers enforce it, and the mobile app inherits all three:

1. **Role permissions** — saved server-side per user. A client-supplied
   `x-role` header is ignored (covered by a test).
2. **Scope limits** — organization/location restrictions, plus `ownRecordsOnly`
   roles that cannot read or edit another person's record even by guessing its id.
3. **Field redaction** — salary, personal contact details and payroll amounts are
   stripped from responses for users without the matching permission.

Managers therefore only need to be created once, in **Access & Settings → Users**
(web or mobile). Set the role, the organizations/locations they cover, and
whether they are limited to their own records. The next time they sign in on a
phone they get exactly that access — no separate mobile provisioning step.

### Notifications

---

## 2. Build the apps

Requires Node 20+, and for Android the Android SDK + JDK 21
(Android Studio's bundled JDK at `C:\Program Files\Android\Android Studio\jbr` works).

```bash
npm install
npm run mobile:build      # vite build + copy web assets into both shells
```

### Android

```bash
# One-off, already done in this repo:
npx cap add android

# Debug APK for installing on a phone:
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk

# Release bundle for Google Play (needs a signing keystore):
cd android && ./gradlew bundleRelease
```

**On Windows in this repo**, `build-apk.ps1` resolves the JDK and SDK paths for
you, so `JAVA_HOME` does not need to be configured:

```bash
npm run mobile:apk      # builds the web bundle, syncs, then produces the APK
npm run mobile:apk:lan  # debug-only: bakes in this PC's Wi-Fi :3000 address
```

Open in Android Studio (emulator, logs, signing UI):

```bash
npm run mobile:android
```

Install a debug build on a connected device:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### iOS

iOS **must** be built on a Mac with Xcode — Apple does not permit building signed
iOS binaries anywhere else. The `ios/` project in this repo is complete and
ready; on a Mac run:

```bash
npm install
npm run mobile:build
npx cap open ios          # opens Xcode
```

Then in Xcode: select your Team under *Signing & Capabilities*, choose a
simulator or a device, and press Run. For TestFlight/App Store use
*Product → Archive → Distribute App*.

---

## 3. Point the app at your server

A packaged app is served from `capacitor://` (iOS) or `https://localhost`
(Android), so a relative `/api` path resolves to nothing. The origin is
resolved in this order:

1. **Saved on the device** — from the mobile sign-in screen (or later from
   **Settings → Mobile server connection**). Entered addresses are validated
   against `/api/health` before being stored, so a typo cannot silently break
   every later request.
2. **Baked in at build time** — `VITE_API_BASE_URL`:

   ```bash
   VITE_API_BASE_URL=https://stocrant.example.com npm run mobile:build
   ```

3. **Same-origin** — empty, which is correct for the hosted website.

The address is per-device and never shared with other users.

### CORS and HTTPS
The server already allows native clients: they send no browser `Origin` header,
so credentialed requests are accepted. If you also serve a website from another
domain, list it in `STOCRANT_ALLOWED_ORIGINS` (comma-separated).

Always use **HTTPS** in production. The session cookie is marked `Secure`, and
`cleartext` is disabled in `capacitor.config.ts`, so plain `http://` will fail
against a production build. (Chrome treats `http://localhost` as a secure origin,
which is why local development still works.)

For a phone on the same trusted Wi-Fi as a developer PC, use
`npm run mobile:apk:lan`. It detects the current Wi-Fi IPv4 address, builds a
**debug-only** APK configured for `http://PC-LAN-IP:3000`, and enables Android
cleartext only through `android/app/src/debug/AndroidManifest.xml`. The release
APK/AAB remains HTTPS-only.

---

## 4. Useful commands

| Command | What it does |
|---|---|
| `npm run mobile:build` | Build the web bundle and copy it into both native shells |
| `npm run mobile:android` | Sync then open the Android project in Android Studio |
| `npm run mobile:ios` | Sync then open the iOS project in Xcode (macOS) |
| `npm run mobile:apk` | Build a debug APK you can install on a device |
| `npx cap sync` | Copy the latest web build + plugins into the native projects |
| `npx cap doctor` | Check the native toolchain |
| `npm test` | Server test suite (auth, scoping, notifications, finance, inventory) |

After changing anything in `src/`, run `npm run mobile:build` again — the native
apps embed a static bundle, so they do not hot-reload from a dev server.

---

## 5. Adding native capabilities

```bash
npm install @capacitor/camera @capacitor/push-notifications
npx cap sync
```

Both platforms then pick the plugin up automatically. Anything requiring a
permission prompt (camera, photos, push) must be declared in
`android/app/src/main/AndroidManifest.xml` and `ios/App/App/Info.plist`.

---

## 6. Deploying the server the app talks to

The apps are only a shell — the API must be reachable over HTTPS.

- **Render / Railway / Fly.io** — see the deployment section of `README.md`.
  Set `STOCRANT_SESSION_SECRET` (persistent!), `STOCRANT_SETUP_KEY`, and
  `STOCRANT_ALLOWED_ORIGINS`.
- Remember that all sessions are invalidated whenever
  `STOCRANT_SESSION_SECRET` changes — users simply sign in again; data is safe.
- Keep the same `STOCRANT_DATA_DIR` mounted so the app and the website see the
  same records.

Every signed-in user gets an in-app bell. Low stock, overdue work, pending
approvals and denied sign-in attempts are recorded per user, so a manager is
never shown an alert that belongs to somebody else.

All signed-in users except the main admin can request leave, including accounts without an employee profile or HR permissions. Requests are linked to the requesting account and remain pending for main-admin review.
