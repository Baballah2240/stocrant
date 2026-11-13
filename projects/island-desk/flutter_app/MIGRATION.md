# Island Desk Flutter workspace

Windows and Android share `lib/`. Start on **Translate** so Arabic/English translation is visible immediately. Wide windows use a navigation rail; narrow windows use a drawer. Text direction follows the selected language, and drafts survive navigation without being written to disk.

## Build and verify

Use Flutter 3.50 / Dart 3.14. From the repository's Island Desk directory:

```powershell
npm run flutter:check
npm run flutter:windows
npm run flutter:android
npm run mobile:save
```

The scripts use `FLUTTER_ROOT` when supplied, an ignored local `.qa/flutter-sdk` when present, or Flutter on PATH. Windows needs Visual Studio's Desktop development with C++ workload. Android needs the Android SDK and a compatible JDK. This project uses built-in Flutter platform channels rather than third-party native plugins.

Windows output: `flutter_app/build/windows/x64/runner/Release/`. Keep the executable, DLLs and `data/` folder together. Android debug-preview output is saved by `mobile:save` with its SHA-256 and manifest. Signing material, SDKs and generated outputs are never committed.

## Data and scope

The Windows preview writes `%APPDATA%/Island Desk Flutter/workspace.json`. If it has no workspace, it reads a copy of `%APPDATA%/Island Desk/island-desk.json`; subsequent edits affect only the preview's file. Android uses its own private files directory and separate application ID. Notes, tasks, history, website shortcuts and timer state are local; translation is the only online tool in this preview and uses MyMemory on explicit submission. No shared profile or automatic Wi-Fi sync is claimed.

The Electron app remains the operational Windows island, and the existing Capacitor app remains the full Android launcher. Native integrations still to port include click-through/blur, floating sticky windows, tray/global shortcuts, system media and hardware, phone pairing/sync, Android alarms, notifications and launcher/app-drawer behavior. The Flutter preview offers a topmost foldable Windows window and the shared workspace, rather than claiming full feature parity.
