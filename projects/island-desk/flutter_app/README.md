# Island Desk Flutter

Shared Windows and Android workspace preview, built with Flutter 3.50 and Dart 3.14.

Opens on **Translate** (Arabic ↔ English). Also includes local Notes, Tasks, Calculator/history, Focus, text tools and shortcuts. Translation only sends text after explicit submission; notes and tasks stay on the device. Windows imports a copy of existing workspace data into a separate directory.

From the Island Desk repository directory:

```powershell
npm run flutter:check
npm run flutter:windows
npm run flutter:android
npm run mobile:save
```

See [MIGRATION.md](MIGRATION.md) for platform requirements, build outputs, data paths and the native integrations still to port. This preview runs alongside the current Electron app and Android launcher; it does not claim complete feature parity.
