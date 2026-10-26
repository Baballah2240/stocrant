# School Display · جدول المدرسة

An independent Windows classroom overlay with a local bilingual web control panel. No cloud account, internet connection, OpenAI API or subscription is required at runtime.

## Use the Windows application

1. Open `releases/School-Display-Setup-1.0.0-x64.exe` to install, or run the portable executable.
2. School Display opens the control panel at **http://127.0.0.1:4318/control** and places its read-only overlay above ordinary desktop windows.
3. Create your one administrator account. Choose a password of at least 12 characters and keep it safely. There is no default account or password.
4. Open **Display & school** to enter the school name, timezone and display language. Choose Arabic, English or bilingual. The control panel language is independent.
5. Open **Timetable**. The initial draft contains a Sunday–Thursday sample; edit its teachers, subjects, rooms, lessons and breaks for your school. Save the draft, then publish.
6. Changes reach the overlay within about three seconds. Holidays override the weekly timetable.
7. The tray icon opens the control panel. **Administrator → Protected controls** requires your password to close the Windows application, pause via settings, or renew display access.

The overlay is non-focusable and click-through, so teachers can work in the application behind it. Settings allow top/bottom placement, compact/standard size, target monitor, pre-lesson notice and optional sound. Windows startup is opt-in. Pausing hides the native overlay; the web preview remains available.

Closing a normal window does not close the overlay. This application is not an operating-system lockdown: Task Manager, OS administrators, shutdown, secure desktops and some exclusive fullscreen applications can override it. Test actual teaching applications on classroom hardware. If a teacher switches HDMI input to a separate laptop, install/run the app on that laptop to display above its output.

## Local scope and data

The service listens only on `127.0.0.1`, on port 4318. The control panel is available on the same computer, not other devices on the school network. Run one instance; close a development web server before opening the desktop application.

Installed/portable app data is in `%APPDATA%/School Display/school.sqlite` (the precise folder follows the Electron app name). The development web-only server stores its separate database in `runtime/`. Credentials are scrypt hashes. Sessions expire after eight hours or when another login replaces them. Display links have a random, revocable token and can read only published schedules. Do not share backups or display links publicly.

**Administrator → Backup & recovery** exports/restores schedule and display settings. Backups never contain passwords or display tokens. Also back up the complete SQLite file while the application is closed if you need administrator account recovery. There is no email password reset in this local-only version. Do not delete the database to reset a password: that also discards the local schedules. Restore your complete database backup or ask your system administrator to assist with recovery.

The display caches its last successfully received schedule if temporarily disconnected; it shows offline status and the last sync time. Offline system-clock changes can affect timing until reconnection. Keep Windows time synchronization enabled. The local service must be running to control settings.

## Development in VS Code

Open this folder as its own VS Code workspace. Requires Node.js 24 LTS and Windows 10/11 x64 for the desktop build.

```powershell
npm.cmd ci
npm.cmd start              # Web-only control panel; no overlay
npm.cmd run desktop       # Desktop app + local web control
npm.cmd test
npm.cmd run test:browser   # Requires installed Chrome
npm.cmd run dist:win       # Installer + portable app
```

For offline operation after installation, no development tools are needed. Dependencies and Windows packaging files require internet access during development/build. The binaries are unsigned local builds; a verified publisher certificate is a separate production-release step.

## Architecture

- `server/`: loopback-only HTTP API, single administrator, SQLite persistence through SQL.js, backups and display settings.
- `shared/`: timezone-aware timetable validation and state calculation.
- `web/`: administration interface, monitor view, Arabic translations, offline schedule cache.
- `desktop/`: sandboxed Electron renderer, click-through window, tray, startup and password-authorized exit.
- `tests/`: schedule boundary tests, security/persistence checks and browser workflow verification.
- `releases/`: generated Windows packages, excluded from source control.

The first release manages one timetable for a selected monitor on one computer. Separate room timetables, remote management, date-specific replacement schedules, importing spreadsheets, custom school logo uploads and managed-device policies are future extensions. Holidays, weekly schedules, editable announcements and bilingual displays are included now.
