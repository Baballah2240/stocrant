# Changelog

## 0.9.0 (2026-11-08)

**Motion**
- One shared set of motion settings (spring, ease, durations) used everywhere.
- Workspace tabs and island pages slide in the direction you move; going back reverses it.
- The workspace unfolds from the top edge; messages and confirmations spring in and leave quickly.
- Press feedback on buttons, a gentle lift on cards when hovered, smooth expand and collapse.
- Timer digits roll as they change, the waveform moves only while the timer runs, progress bars glide.
- A brief mint glow when a task, note or calculation is added, or the timer starts.
- Everything respects Gentler motion in Settings and the Windows reduced-motion setting.

## 0.8.0 (2026-11-08)

**New**
- The island hangs from the top edge of the screen like a notch, with curved corners that blend into the edge.
- Pages in the hover island, switched with the mouse wheel or the dots: Music, Today and Hardware monitor.
- Music player tinted with the album art colour: app badge, title, artist and album, wave bars, progress with time remaining, round accent buttons.
- Hardware monitor: CPU, RAM, GPU, disk and network up/down, measured only while the page is open.
- Compact pill shows time, weather and a status dot (green when your phone is connected). Weather from Open-Meteo; set the city in Settings.

## 0.7.0 (2026-11-08)

**New**
- Automatic Wi-Fi pairing: on the same Wi-Fi the phone finds Island Desk and asks to connect; the computer shows Allow / Don't allow. No QR code or typing.
- Phone notifications on the desktop: a paired phone forwards its notifications; they appear in the island's hover preview.
- Live island: the pill grows briefly to announce a new song, a phone notification, a finished focus session, a task reminder or a phone connecting.
- Phone companion is on by default for new installs.

**Fixed**
- Focus blur only appeared the first time; it now appears every time.
- Mail card disappeared after a launcher update; it now reconnects to notifications.
- Launcher calculator keypad order and missing display in landscape.
- Empty count badges on launcher cards.

## 0.6.0 (2026-11-08)

**New**
- Island Launcher home: a modern clock (blinking colon, seconds line, date and alarm chips) next to a scrolling feed.
- Mail on the home screen: new email notifications (Gmail, Huawei Email, Outlook and others) after allowing Notification access. Tap to open, x to dismiss, or switch to all notifications.
- Football news from BBC Sport, refreshed every 15 minutes; tap a story to read it in the browser.
- The system-apps rail is gone: phone apps and your apps share the swipe-right drawer, in separate sections.
- Automatic Wi-Fi discovery: the desktop announces itself while Phone companion is on, and a paired phone follows it if its address changes.

## 0.5.0 (2026-11-07)

**New (Island Launcher)**
- Always landscape: the launcher and its alarm screen stay in landscape (either way up), with a two-column home: clock, date and next alarm on the left, tasks and pinned notes on the right.
- Alarms: one-time or repeating, labels, vibration, snooze length, and a Test button. They ring at alarm volume with a full-screen Snooze/Stop screen over the lock screen, work with the app closed, and re-arm after a restart or a time change.
- Clock tab with Alarms and Focus; the next alarm shows on Home; optional Keep screen on for a bedside clock.
- Pairing with the computer moved into the island pill menu.

## 0.4.0 — 2026-11-07

**New**
- **Island Launcher for Android:** an app that replaces the phone's home screen. Portrait home with the island pill, a large clock, today's tasks and pinned notes, and the phone's system apps in a rail on the right. A separate **My apps** window lists the apps you installed, with search. Notes, tasks, focus timer and calculator work on the phone alone and sync with the desktop when paired; changes made offline wait on the phone and sync later.
- Pair the launcher by opening the desktop's QR code on the phone and tapping "Open in Island Launcher", or over a USB cable.

**Changed**
- The desktop companion keeps the IDs the phone gives new notes and tasks, so offline edits never duplicate.

## 0.3.0 — 2026-11-07

**New**
- **Phone companion:** turn it on in Settings and scan the QR code. Your phone becomes a full-screen clock (it keeps the screen on), with notes, checklists, tasks with a Today view, the focus timer, a calculator and now-playing controls, all synced live with the desktop over your Wi-Fi. No app store, no account, and nothing leaves your network. Add it to your home screen to open it like an app.

**Fixed**
- Changing any setting failed if another app already held the global shortcut.

## 0.2.0 — 2026-11-07

**New**
- **Now playing:** music from Spotify, browsers, Media Player and other apps appears in the island with album art, title and moving bars. Hover for a player card with progress and previous / play-pause / next controls.
- **Sticky notes on the desktop:** drag a note out of the island and drop it anywhere. Move, resize and edit it there; its position is remembered.
- **Focus blur:** while you use the island or a sticky note, the rest of the screen goes softly out of focus.
- **Richer hover preview:** large clock, pending tasks with due and overdue labels, a screen brightness slider and a Night Light toggle.

**Fixed**
- Clicking the island could hide it behind the background layer.
- Typing didn't reach the island until it was clicked twice; the calculator now takes keys as soon as its tab opens.
- The hover blur no longer flickers or lags.
- The brightness slider shows instantly instead of after a second.
- Installer file names and the app icon.

## 0.1.0

First version: notes, tasks, calculator, focus timer, quick tools, shortcuts, tray icon, global shortcut, backups.
