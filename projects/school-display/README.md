# School Display · جدول المدرسة

An independent Windows classroom overlay with a local bilingual web control panel. No cloud account, internet connection, OpenAI API or subscription is required at runtime.

## Use the Windows application

1. Open `releases/School-Display-Setup-1.2.0-x64.exe` to install, or run the portable executable.
2. School Display opens the control panel at **http://127.0.0.1:4318/control** and places its read-only overlay above ordinary desktop windows.
3. Create the first administrator account. Choose a password of at least 12 characters and keep it safely. There is no default account or password. Under **Administrator → School administrators**, add separate administrator logins or disable additional accounts. These users have full school control. You cannot disable yourself or the original administrator.
4. Open **Display & school** to enter the school name, timezone and display language. Choose Arabic, English or bilingual. The control panel language is independent.
5. Open **Timetable**. The initial draft contains a Sunday–Thursday sample; edit its teachers, subjects, rooms, lessons and breaks for your school. Save the draft, then publish.
6. Changes reach the overlay within about three seconds. Holidays override the weekly timetable.
7. The tray icon opens the control panel. **Administrator → Protected controls** requires your password to close the Windows application, pause via settings, or renew display access.

The smaller neutral glass overlay is non-focusable and click-through during lessons, events and clock-only mode, so teachers can work in the application behind it. At the start of each lesson, break or event, it moves to the center for five seconds, then returns to its selected position or break photo mode. When no current or upcoming activity remains, it shrinks to a 120-pixel clock pill. A current final lesson/event stays visible. Settings allow top/bottom placement, compact/standard size, target monitor, pre-lesson notice and optional sound. Windows startup is opt-in. Pausing hides the native overlay; the web preview remains available.

Closing a normal window does not close the overlay. This application is not an operating-system lockdown: Task Manager, OS administrators, shutdown, secure desktops and some exclusive fullscreen applications can override it. Test actual teaching applications on classroom hardware. If a teacher switches HDMI input to a separate laptop, install/run the app on that laptop to display above its output.

## Full-screen breaks and photos

In **Display & school → Full-screen school moments**, choose whether breaks fill the selected monitor. This is enabled by default. Use **Exit full screen** to return to the small panel for the remainder of that break. It does not close the application, change the timetable, or require a control-panel login. The exit remains effective through background synchronization; the next activity resets it. An active lesson always uses the compact panel, including the last lesson of the day. When a break finishes, the panel returns automatically and a short back-to-class notification appears with its image. End of day now shows only the clock, including for existing installations that previously used end-of-day photos.

Upload your own **PNG, JPEG or WebP photos up to 2 MB** for the break and the back-to-class notification, or restore the defaults. Select **Save settings** to apply them. Uploaded images stay in the local app data folder and are included in exported backups; only a signed-in administrator or the current display link can access them. Keep backups under 6 MB. Default photos are generated fictional students; provenance and prompts are in [assets/IMAGES.md](assets/IMAGES.md).

**Press Ctrl+Alt+Shift+S** to open the local administrator panel above the full-screen photo. This only opens the login/control window; changing settings or closing the overlay still requires administrator authentication.

Full-screen photo mode accepts mouse/touch input so its exit button works, and does not take keyboard focus. After exit, normal click-through behavior resumes. Pausing the overlay still hides it. Browser previews fill their page; the Windows overlay fills the selected monitor.

## Connected screens

Connect a screen, TV, projector or interactive board to the Windows host through HDMI, DisplayPort, USB-C, or a Windows-supported wireless display. Once Windows detects it, choose **Display & school → Refresh connected screens → Monitor**, then save. One selected screen shows the overlay; Windows duplicate mode can mirror it to other screens. Different simultaneous room schedules are not included.

The app uses Windows display coordinates to handle resolution, DPI scaling, portrait orientation and displays placed to the left/above the main monitor. It repositions after monitor connection, disconnection, orientation or scale changes. A disconnected target falls back to the primary screen; reconnecting the same Windows display ID restores the target. Browser views also adapt to smaller screens. Native always-on-top behavior requires the Windows application on the computer providing the screen output; this is not an Android TV, macOS or standalone smart-screen application. Classroom hardware and wireless-display support still need testing on those devices.

## Local scope and data

The service listens only on `127.0.0.1`, on port 4318. The control panel is available on the same computer, not other devices on the school network. Run one instance; close a development web server before opening the desktop application.

Installed/portable app data is in `%APPDATA%/School Display/school.sqlite` (the precise folder follows the Electron app name). The development web-only server stores its separate database in `runtime/`. Existing accounts and schedules migrate automatically. Credentials are scrypt hashes. Sessions expire after eight hours, when the same user signs in again, changes their password, or is disabled. Different administrators can stay signed in independently. Display links have a random, revocable token and can read only published schedules. Do not share backups or display links publicly.

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
npm.cmd run test:glass     # Compact glass layout and hover checks
npm.cmd run test:moments   # Break/photo/full-screen transition checks
npm.cmd run dist:win       # Installer + portable app
```

For offline operation after installation, no development tools are needed. Dependencies and Windows packaging files require internet access during development/build. The binaries are unsigned local builds; a verified publisher certificate is a separate production-release step.

## Architecture

- `server/`: loopback-only HTTP API, administrator accounts, SQLite persistence through SQL.js, backups and display settings.
- `shared/`: timezone-aware timetable validation and state calculation.
- `web/`: administration interface, monitor view, Arabic translations, offline schedule cache.
- `desktop/`: sandboxed Electron renderer, click-through window, tray, startup and password-authorized exit.
- `tests/`: schedule boundary tests, security/persistence checks and browser workflow verification.
- `releases/`: generated Windows packages, excluded from source control.

The first release manages one timetable for a selected monitor on one computer. Separate room timetables, remote management, date-specific replacement schedules, importing spreadsheets, custom school logo uploads and managed-device policies are future extensions. Holidays, weekly schedules, editable announcements and bilingual displays are included now.
