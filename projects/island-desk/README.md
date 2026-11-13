# Island Desk

A floating, Dynamic-Island-style workspace for Windows. Built with Electron, React and TypeScript. Notes, tasks and focus tools work offline with no account; the optional Translate section uses an online service.

## Flutter Windows and Android preview

`flutter_app/` now contains a shared Flutter 3.50 workspace for Windows and Android. It opens on Arabic ↔ English translation and includes local Notes, Tasks, Calculator/history, Focus, text tools and shortcuts. Windows uses a wide navigation rail and a foldable, topmost window; narrow Android screens use a drawer with a persistent Translate action.

Run `npm run flutter:check`, `npm run flutter:windows`, or `npm run flutter:android`. After an Android build run `npm run mobile:save` to save the APK, checksum and manifest under the ignored `mobile/releases/`. Complete setup, output paths, data import and remaining native integrations are documented in [flutter_app/MIGRATION.md](flutter_app/MIGRATION.md).

This is a separately runnable migration preview, not yet a replacement for the existing system integrations or Android home-screen launcher. It preserves the original apps and workspace data.

## Install and run (Windows 10/11)

1. Install **Node.js 20 or newer** (https://nodejs.org).
2. In this folder:
   ```powershell
   npm install
   npm start          # builds, then launches the island
   ```
3. Other commands:
   - `npm run dev`: live-reloading development mode
   - `npm test`: unit tests (calculator, timer, backup validation, hit-testing)
   - `npm run test:desktop`: launches the real app and checks render, expand/collapse, click-through, and saving
   - `npm run package:win`: builds an installer and portable `.exe` in `release/`

## Using it

- **Hover** the pill for a preview. **Click** it to open the workspace. Press **Esc** or click outside to collapse it.
- Global shortcut: **Ctrl+Shift+Space** (you can change it in Settings). **Ctrl+1–7** switches tabs.
- **Hover preview:** the time and date, up to 3 pending tasks (overdue ones in red), a screen brightness slider and a Night Light toggle.
- **Sticky notes on the desktop:** drag a note card out of the island and drop it anywhere (or click the note icon in the editor). Drag its top bar to move it, drag an edge to resize, and press x to send it back into the island. Position and size are saved across restarts. If its monitor is unplugged, the note moves to a screen you still have.
- **Focus blur:** while the pointer is over the island or a sticky note (or the workspace is open), everything else goes softly out of focus, and it returns to normal when you move away. Clicks still pass through to your apps. Turn it off in Settings > "Blur the background on hover". Windows has no live blur for other apps, so the blurred background is a still snapshot taken when the blur starts (a playing video looks paused until you move away).
- **Now playing:** music or video from any app that shows in the Windows volume pop-up (Spotify, YouTube in a browser, Media Player and so on) appears in the pill with album art, title and moving music bars. Hover for a player card with progress and previous / play-pause / next controls.
- **Phone companion:** Settings > Phone companion > scan the QR code with your phone (same Wi-Fi). The phone gets a clock, notes, tasks, focus timer, calculator and music controls, synced live both ways. "Sign out paired phones" issues a new code.
- Tray icon: open, show/hide, start/pause the focus timer, always-on-top, quit.
- What's included: Notes (pinned, checklists, search, autosave), Tasks (priority, due date, reminders, Today view), Calculator (keyboard input, %, parentheses, history), a Focus timer whose countdown shows in the pill, Quick tools, and Shortcuts.
- Settings: display, position offset, size, always on top, reduced motion, launch at startup, export/import a JSON backup.

Data is stored in `%APPDATA%\Island Desk\island-desk.json`. Saves are atomic, and a copy of the old data is kept before every import.

## Island Launcher (Android home screen)

- Build: `npm run launcher:apk` (needs JDK 21 in `C:\jdks` and the Android SDK). The APK lands in `release/launcher/`, which is not committed.
- Install: `adb install -r release/launcher/Island-Launcher-<version>.apk`, or copy the APK to the phone and open it.
- Make it the home screen: tap the island pill on the phone, then **Set as home screen**. To go back, choose the original launcher in Settings > Apps > Default apps > Launcher.
- Pairing over USB: `adb reverse tcp:47820 tcp:47820`, then open `islanddesk://pair?u=http://127.0.0.1:47820/&t=<code>` on the phone. The code is in `%APPDATA%\Island Desk\companion-token.txt`.
- It is a home screen app, not a new operating system: notifications, the status bar, lock screen and calls stay Android's own.

## Windows limitations

- **Translation:** open the Translate tab (Ctrl+7), choose source/target languages, type or paste up to 3,000 characters, then press Translate or Ctrl+Enter. Translate between Arabic and English; English-to-Arabic is the default. Choosing either language automatically sets the other side. Swap languages or copy the result. Only submitted text is sent to [MyMemory](https://mymemory.translated.net/); requests are split at its 500-byte UTF-8 limit, and free daily quotas apply ([provider limits](https://mymemory.translated.net/doc/usagelimits.php)). Translations need internet, may contain mistakes, and are not stored in backups or on disk. Drafts and results survive changing tabs but clear when the app exits. Cancel stops the remaining requests; it cannot retract text already sent. This section is currently in the Windows workspace.

- **Phone companion and the firewall:** the first time you turn it on, Windows Firewall asks whether to allow Island Desk. Allow it on **Private** networks. On public or guest Wi-Fi (hotels, some offices) devices often cannot reach each other, so the phone can't connect there. The connection is plain HTTP inside your network, protected by the secret pairing code. Anyone who has that code and is on the same Wi-Fi could use it, so use "Sign out paired phones" if a code may have been shared.

- **Click-through:** the transparent window can't hit-test each pixel. The app checks the cursor against the pill's rounded shape about 40 times per second and switches mouse pass-through on or off. Clicks near the pill's edge during an animation may land a frame late.
- **Always on top** uses the "floating" level. Exclusive-fullscreen games and some elevated (admin) windows can still cover it.
- **Launch at startup** only works in the installed (packaged) app, not with `npm start`.
- **Global shortcut:** if another app has already taken the combination, Windows won't let Island Desk register it. Settings shows an error so you can pick another one.
- **Notifications:** Focus Assist / Do Not Disturb can silence reminders. Timer completion is always shown inside the island too.
- The installer is unsigned, so SmartScreen will warn on first run ("More info → Run anyway").
- **Brightness** only works on built-in laptop screens. External monitors use their own buttons (the slider is disabled if the screen doesn't support it).
- **Night Light** is switched through its per-user registry setting, which Microsoft doesn't document. It may stop working after a Windows update; if it does, use Settings > Display > Night light.
- The pill sits at the top of the work area. It doesn't merge with a camera notch the way the iPhone hardware does.
