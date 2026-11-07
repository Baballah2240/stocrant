# Island Desk

A floating, Dynamic-Island-style workspace for Windows. Built with Electron, React and TypeScript. Works fully offline, with no account.

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
- Global shortcut: **Ctrl+Shift+Space** (you can change it in Settings). **Ctrl+1–6** switches tabs.
- **Hover preview:** the time and date, up to 3 pending tasks (overdue ones in red), a screen brightness slider and a Night Light toggle.
- **Sticky notes on the desktop:** drag a note card out of the island and drop it anywhere (or click the note icon in the editor). Drag its top bar to move it, drag an edge to resize, and press x to send it back into the island. Position and size are saved across restarts. If its monitor is unplugged, the note moves to a screen you still have.
- Tray icon: open, show/hide, start/pause the focus timer, always-on-top, quit.
- What's included: Notes (pinned, checklists, search, autosave), Tasks (priority, due date, reminders, Today view), Calculator (keyboard input, %, parentheses, history), a Focus timer whose countdown shows in the pill, Quick tools, and Shortcuts.
- Settings: display, position offset, size, always on top, reduced motion, launch at startup, export/import a JSON backup.

Data is stored in `%APPDATA%\Island Desk\island-desk.json`. Saves are atomic, and a copy of the old data is kept before every import.

## Windows limitations

- **Click-through:** the transparent window can't hit-test each pixel. The app checks the cursor against the pill's rounded shape about 40 times per second and switches mouse pass-through on or off. Clicks near the pill's edge during an animation may land a frame late.
- **Always on top** uses the "floating" level. Exclusive-fullscreen games and some elevated (admin) windows can still cover it.
- **Launch at startup** only works in the installed (packaged) app, not with `npm start`.
- **Global shortcut:** if another app has already taken the combination, Windows won't let Island Desk register it. Settings shows an error so you can pick another one.
- **Notifications:** Focus Assist / Do Not Disturb can silence reminders. Timer completion is always shown inside the island too.
- The installer is unsigned, so SmartScreen will warn on first run ("More info → Run anyway").
- **Brightness** only works on built-in laptop screens. External monitors use their own buttons (the slider is disabled if the screen doesn't support it).
- **Night Light** is switched through its per-user registry setting, which Microsoft doesn't document. It may stop working after a Windows update; if it does, use Settings > Display > Night light.
- The pill sits at the top of the work area. It doesn't merge with a camera notch the way the iPhone hardware does.
