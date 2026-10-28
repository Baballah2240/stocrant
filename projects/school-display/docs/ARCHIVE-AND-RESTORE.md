# Qatar School Time Table - archive and restore

Checkpoint: version 2.3.0, 28 October 2026.

## What is preserved

The archive `archives/Qatar-School-Time-Table-2.3.0-2026-10-28.zip` contains the complete independent school-project source: desktop app, server, web controls, shared timetable logic, assets, tests, package lockfile, deployment/build configuration, documentation and the Arabic/English manager presentation. It also includes the current Windows installer and portable executable, their build manifest/checksums, the school CI workflow and a small selection of current verification evidence.

The outer folder is `Qatar-School-Time-Table-2.3.0`. Inside it, the project retains its original path, `projects/school-display`, so the included GitHub workflow still has the correct working directory. The restaurant and mobile applications are separate and are not part of this school-project archive. Original Git history remains in the working repository; the archive is a source checkpoint, not a copy of the entire monorepo history.

`ARCHIVE-MANIFEST.json` records the checkpoint commit, the original release-build commit and the SHA-256/size of each payload file. The adjacent `.zip.sha256` file verifies the entire ZIP. Archive creation verifies every payload before any cleanup. Keep a copy of the archive and checksum on another drive or backup location.

Excluded: downloaded `node_modules`, old releases, unpacked build output, temporary browser profiles/logs/test databases, `.git`, local runtime databases, `.env` secrets and signing credentials. Reinstall development dependencies from the included lockfile. The current Windows executables run without Node.js or development dependencies.

## Resume development in VS Code

1. Verify the ZIP in PowerShell with `Get-FileHash -Algorithm SHA256 -LiteralPath '<archive path>'` and compare it with the adjacent `.zip.sha256` file.
2. Extract it to a new folder; do not overwrite an existing working project or its data.
3. Open `Qatar-School-Time-Table-2.3.0/projects/school-display` in VS Code.
4. Install Node.js 24 LTS. In that folder run:

   ```powershell
   npm.cmd ci
   npm.cmd test
   npm.cmd run desktop
   ```

   Dependency installation needs internet access. `npm.cmd start` runs the browser control server without the Windows overlay. Close one before starting the other; both normally use port 4318.
5. To rebuild Windows packages, run `npm.cmd run dist:win`. For browser checks, install Chrome and run the relevant `test:*` scripts from `package.json`.
6. Continue with the included `AGENTS.md`, `README.md`, `docs/QUICK-START-AR-EN.md` and `docs/RELEASE-REVIEW-2.3.0.md`. The snapshot's exact commit is recorded in the archive manifest. To make a new independent history, initialize Git in the extracted outer folder; do not replace the original repository's `.git` directory.

## Run the saved Windows application

Use `projects/school-display/releases/Qatar-School-Time-Table-Setup-2.3.0-x64.exe`, or the corresponding portable executable. These are the same verified, unsigned local-pilot packages from the release review. Public hosting and publisher signing have not been activated. Close an existing app through administrator Protected controls before installing an update.

## Accounts and school data

Installed accounts, school settings and schedules are stored separately at `%APPDATA%/School Display`. The cleanup does not touch that folder, installed applications, the project's `runtime/` directory if present, or unrelated Stocrant files. The empty development fixture under `.qa/desktop-data` is test data and is removed with the other QA output.

This source archive does not contain accounts, passwords, private display tokens or live school databases. A fresh computer therefore needs its own administrator setup. For the same school's data migration, export a business backup in the app. For complete account recovery, make a separate private backup of the full app-data folder while the app is closed; business exports deliberately exclude credentials and tokens. Store that private backup securely, separately from the source archive.

## Cleanup scope

Kept: all source/assets/tests/docs, the manager PDF, installed development dependencies and the 2.3.0 release files. Removed after ZIP verification: older installers/portable packages/blockmaps/manifests, `releases/win-unpacked`, and disposable `.qa` files. Selected current native results and screenshots remain in the archive under `archive-info/evidence`. No global npm cache, other project, installed application or school data folder is cleaned.

## العربية

يحتوي الأرشيف على مشروع **Qatar School Time Table** كاملاً من ناحية الكود والملفات اللازمة للتطوير، مع إصدار ويندوز 2.3.0 والعرض التعريفي باللغتين وتعليمات الاستعادة. لا يحتوي على مشروع المطعم أو قواعد بيانات المدرسة أو كلمات المرور.

للعودة إلى التطوير: فك الضغط في مجلد جديد، وافتح `projects/school-display` في VS Code، وثبت Node.js 24 ثم نفذ `npm.cmd ci` و`npm.cmd test` و`npm.cmd run desktop`. يتطلب تنزيل مكتبات التطوير اتصالاً بالإنترنت، أما ملفات تطبيق ويندوز المرفقة فلا تحتاج إلى أدوات تطوير للتشغيل.

تبقى حساباتك وإعداداتك المحلية في مجلد `%APPDATA%/School Display` دون تغيير. الأرشيف ليس نسخة احتياطية للحسابات. احتفظ بنسخة خاصة من بيانات المدرسة منفصلة عن أرشيف الكود، وبنسخة من الأرشيف وملف التحقق على قرص آخر. أزيلت الإصدارات القديمة وملفات الاختبار المؤقتة فقط بعد التحقق من سلامة الأرشيف.
