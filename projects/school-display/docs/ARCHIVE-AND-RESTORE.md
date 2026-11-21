# Qatar School Time Table - archive and restore

Checkpoint: 21 November 2026 (`School-Display-20261121-132740Z`). This replaces all earlier archives, which were deleted.

## What is preserved

The archive `archives/School-Display-20261121-132740Z.zip` (about 7 MB) contains the complete independent school-project source: desktop app, server, web control panel, community dashboard, classroom display, the Faslii teacher and parent app (`web/teacher*`, `mobile/` and the Flutter source in `mobile/flutter/`), shared timetable logic, assets, tests, package lockfiles, build configuration, documentation and the presentation-video scripts.

The ZIP's top level is the `projects/school-display` folder itself. Original Git history stays in the working repository; the archive is a source checkpoint, not a copy of the monorepo history.

The adjacent `.zip.sha256` file verifies the entire ZIP. Keep a copy of the archive and checksum on another drive or backup location.

Excluded: `node_modules`, earlier archives, `releases/` (Windows installers and APKs), Flutter and Android build output, `runtime/` school data, SQLite databases, `.qa` test output, the generated `output/` folder (presentation video and frames), `.env` files, `google-services*.json` and signing keys. Rebuild installers with `npm.cmd run dist:win` and the Android app with `npm.cmd run mobile:apk`.

## Resume development in VS Code

1. Verify the ZIP in PowerShell with `Get-FileHash -Algorithm SHA256 -LiteralPath '<archive path>'` and compare it with the adjacent `.zip.sha256` file.
2. Extract it to a new folder; do not overwrite an existing working project or its data.
3. Open the extracted folder in VS Code.
4. Install Node.js 24 LTS. In that folder run:

   ```powershell
   npm.cmd ci
   npm.cmd test
   npm.cmd run desktop
   ```

   Dependency installation needs internet access. `npm.cmd start` runs the browser control server without the Windows overlay. Close one before starting the other; both normally use port 4318.
5. For browser checks, install Chrome and run the `test:*` scripts from `package.json`, including `npm.cmd run test:community`.
6. Continue with the included `AGENTS.md`, `README.md` and `docs/QUICK-START-AR-EN.md`.

## Accounts and school data

Installed accounts, school settings and schedules are stored separately at `%APPDATA%/School Display`. The archive does not contain accounts, passwords, private display tokens or live school databases, so a fresh computer needs its own administrator setup. To move a school's data, export a business backup in the app. For full account recovery, back up the app-data folder privately while the app is closed, separately from the source archive.

## العربية

يحتوي الأرشيف `School-Display-20261121-132740Z.zip` على كود مشروع **Qatar School Time Table** كاملاً: لوحة التحكم وشاشة الفصل وتطبيق فصلي للمعلمين وأولياء الأمور. حُذفت الأرشيفات السابقة، ولا يحتوي هذا الأرشيف على ملفات التثبيت أو قواعد بيانات المدرسة أو كلمات المرور.

للعودة إلى التطوير: تحقق من الملف بأمر `Get-FileHash`، ثم فك الضغط في مجلد جديد وافتحه في VS Code، وثبت Node.js 24 ثم نفذ `npm.cmd ci` و`npm.cmd test` و`npm.cmd run desktop`. لإنشاء ملف التثبيت نفذ `npm.cmd run dist:win`.

تبقى حساباتك وإعداداتك في مجلد `%APPDATA%/School Display` دون تغيير. احتفظ بنسخة من الأرشيف وملف التحقق على قرص آخر.
