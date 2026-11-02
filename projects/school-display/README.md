# Qatar School Time Table

An independent Windows classroom overlay with a local bilingual web control panel. No cloud account, internet connection, OpenAI API or subscription is required at runtime.

## Archived project checkpoint

The complete school-project source, current 2.3.0 Windows packages, manager presentation and restoration instructions are preserved in `archives/Qatar-School-Time-Table-2.3.0-2026-10-28.zip`. Its adjacent SHA-256 file verifies the archive, and the internal manifest records each archived file's checksum. Archives and generated installers stay outside Git. See [Archive and restore](docs/ARCHIVE-AND-RESTORE.md) to resume development or run the packaged app. Old installers, unpacked build output and temporary QA files can be regenerated and have been cleaned; current installers and installed development dependencies are retained.

## Version 2.4: live timetable and teacher app

**Control panel.** The overview has a live board showing what every class is doing now, with time left and what comes next. **Week board** is now a time grid: drag a lesson to a day and time and it snaps to five minutes, with a line marking the current time. Use **Show** to see one teacher's week across all classes. Teacher double bookings still block publishing. Lessons from different classes in the same room are highlighted and listed as warnings, but do not block publishing.

**Cover an absent teacher** under **Special days**: choose the teacher and date to see their lessons and who is free at each time, with the teachers who have the fewest lessons that day first. Saving creates a dated special day, leaves the weekly timetable unchanged and stays a draft until published.

**Faslii (فصلي), the teacher and parent app.** Android app source is in `mobile/`, and the same pages open in a phone browser at `/teacher`. Teachers sign in with their School users account and see their current lesson with a countdown, today's lessons, a seven-day view, their assigned class timetables, cover changes and announcements. The last timetable stays available offline. The Android app can also remind them 5, 10 or 15 minutes before a lesson.

Phones cannot reach the default `127.0.0.1` service, so the teacher app needs the HTTPS hosting in [HOSTING.md](HOSTING.md) to be active. For each teacher, set **Name on the timetable** under **School users** to match the name on their lessons. App access is read-only and lasts 90 days. It ends when the teacher signs out, changes their account, or an administrator edits or disables the account. This also applies to existing accounts.

**Teacher messages.** Administrators and coordinators can message one teacher or all teachers under **Special days → Message teachers**. Messages appear in the app's **Messages** tab with an unread badge and are kept for 30 days. The app checks when it opens, when it returns to the screen, and every minute while open. It does not use push notifications, so a closed app shows a message only when next opened. Read status stays on the phone, so staff do not see who has read a message.

**Parents.** Under **Students & parents**, add students singly or paste a list, then choose **Invite parent** to create a one-time code. Parents choose **I have an invitation code** in the app to create their account, and can add other children later in **Settings**. They see each child's timetable, attendance, homework and exams, changes, announcements and messages, and can request an absence. Teachers mark daily attendance, post homework and exams, and answer absence requests in the **Class** tab. Parents sign in only through the app, and only see their own children.

The Android app connects to the address set by `schoolServer` in `mobile/package.json` (or `SCHOOL_APP_SERVER` at build time), so users never type one.

```powershell
npm.cmd --prefix mobile ci
npm.cmd run mobile:apk     # Requires JDK 21 and the Android SDK; builds a debug APK
npm.cmd run test:teacher   # Teacher app and cover planner browser checks
```

Debug APKs are for testing. Sharing the app widely needs a release signing key. An iPhone build needs a Mac, so iPhones use `/teacher` in the browser for now.

## Version 2.3: guided tour and release review

Select **Quick tour / جولة سريعة** in the control-panel header after signing in. The tour explains the sections available to your role, supports keyboard navigation and Escape, and offers an explicit **Open this section** button. It never edits or publishes data. Save your work before opening another section; unsaved settings and photo changes are protected when changing sections, switching language or leaving the page.

The dashboard now follows published special days and holidays when showing today's activities. Remote screens avoid rewriting unchanged snapshots every five seconds and release unsuccessful HTTP responses. All school-image controls use the same upload validation and reset logic.

See [the bilingual quick start](docs/QUICK-START-AR-EN.md), [manager presentation](output/pdf/Qatar-School-Time-Table-Presentation-AR-EN.pdf) and [release review](docs/RELEASE-REVIEW-2.3.0.md). The local build is for a supervised school pilot; public distribution still needs publisher signing and classroom acceptance checks. Public hosting remains inactive.

## Lesson presentation in version 2.2

The application is now **Qatar School Time Table**. Its internal app ID and existing `%APPDATA%/School Display` data folder remain unchanged so accounts, schedules and private screen connections are preserved. Close the old application through administrator controls before installing the update; a build does not install it.

During lessons, only the school clock appears and moves gently toward the configured left or right edge over eight seconds. Reduced-motion settings use an immediate move. Under **Display & school > Lesson screens and photos**, choose the countdown lead (0-120 seconds, default 10), the start-photo duration when lead is 0 (0-60 seconds), and the lesson-finished screen duration (0-60 seconds). Zero duration disables that screen. Turning off **Clock only during lessons** restores the detailed panel.

Use **Edit activity** to upload a **Teacher photo** and an **Activity photo**. The teacher image is used for the lesson-start countdown; the activity image is used for that activity's finish or break/event screen. Global fallback photos are available for lesson start, lesson finish and events, alongside the existing break and back-to-class images. No teacher photo is fabricated: without an upload the school icon is used. Images must be PNG/JPEG/WebP up to 2 MB each; referenced photos are limited to 64 unique images totaling 64 MB. Photos are included in business backups and remote snapshots, and each screen can access only photos from its assigned published class plus school-wide images.

Finish screens precede the next lesson's zero-lead start photo. Countdowns use school time, not accumulated interval ticks; missed lessons after a long sleep are not replayed. Full-screen views have an Exit button. The hide-bar option still leaves timed screens and notifications running.

## Central hosting and remote screens

Version 2.1 adds an optional HTTPS school server connection to the Windows overlay, with offline snapshots and images. See [HOSTING.md](HOSTING.md) for the independent Render service, `schools.mohbaba.online` DNS setup and connecting classroom computers. The normal local mode remains available. One hosted instance serves one school; unrelated schools require separate services until multi-school tenancy is implemented. Hosting and DNS still require activation and live verification.

## Use the Windows application

1. Open `releases/Qatar-School-Time-Table-Setup-2.3.0-x64.exe` to install, or run the portable executable.
2. Qatar School Time Table opens the control panel at **http://127.0.0.1:4318/control** and places its read-only overlay above ordinary desktop windows.
3. Create the first administrator account. Choose a password of at least 12 characters and keep it safely. There is no default account or password. Under **Administrator → School users**, add administrators, timetable coordinators or teachers, assign teacher classes, edit access and disable accounts. The original administrator retains full access and cannot be disabled. Coordinators edit schedules; only administrators publish, change settings, manage screens and restore backups. Teachers see only their assigned published classes.
4. Open **Display & school** to enter the school name, timezone and display language. Choose Arabic, English or bilingual. The control panel language is independent.
5. Open **Timetable**. The initial draft contains a Sunday–Thursday sample; edit its teachers, subjects, rooms, lessons and breaks for your school. Save the draft, then publish.
6. Changes reach the overlay within about three seconds. Holidays override the weekly timetable.
7. The tray icon opens the control panel. **Administrator → Protected controls** requires your password to close the Windows application, pause via settings, or renew display access.

The neutral glass overlay is non-focusable and click-through in compact and clock modes, so teachers can work behind it. Lessons use a small clock by default, with configurable full-screen start/finish moments. The optional detailed panel centers for the configured popup duration at an activity change, then returns to its saved position. When no current or upcoming activity remains, it shrinks to a 120-pixel clock pill. A current final lesson/event is not treated as an empty day. Windows startup is opt-in. Pausing hides the native overlay; the web preview remains available.

Closing a normal window does not close the overlay. This application is not an operating-system lockdown: Task Manager, OS administrators, shutdown, secure desktops and some exclusive fullscreen applications can override it. Test actual teaching applications on classroom hardware. If a teacher switches HDMI input to a separate laptop, install/run the app on that laptop to display above its output.

## Adjust the floating panel

**Hide the bar while continuing in the background:** open **Display & school → Overlay appearance**, enable **Hide floating bar**, then save. The floating bar and idle clock disappear; timetable synchronization, lesson notifications, optional sounds and configured break screens continue. Turn the option off in the same settings to show the bar again. The adjustment preview remains visible while you edit. This setting is separate from **Pause the overlay**, which also stops lesson alerts. The Windows tray and **Ctrl+Alt+Shift+S** still open administrator controls.

**Version 2.0** adds an iOS-inspired glass workspace, rounded navigation and cards, light/dark/system appearance, custom accent colors, optional tinted panels and school logo uploads. Open **Display & school → Theme & identity** to customize it. The panel stays neutral by default. Popup and notification duration are configurable from 3–15 seconds; sound supports a single or double system bell. Browser sound permissions can limit audio; native Windows displays use the system bell.

In **Display & school → Overlay appearance**, set **Panel width** (420–1200 px), **Text size** (80–140%), **Horizontal alignment** (left/center/right), **Position** (top/bottom), and **Screen edge distance** (12–120 px). Height fits the content automatically. The live panel preview shows width, text size and alignment changes before saving; **Save settings** applies them to the actual display within about three seconds. The preview does not change the running classroom display. Narrow screens automatically constrain the width and stack content. The idle clock stays small, and activity alerts still appear in the center for five seconds before returning to the saved position. Teachers do not need to drag or unlock the overlay.

## Class groups and additional lessons

1. Open **Timetable → Add class group** and enter its English and/or Arabic name, such as Grade 6A. Existing timetables remain in **Main class** when updating from an older version; use **Edit class group** to rename it.
2. Choose the group in **Class group**, choose a weekday, then select **Add lesson** for another period. Its time initially follows that day's last activity. Enter the subject, teacher, start/end times and optional room; use **Add activity** for breaks or events.
3. **Save draft**, then **Publish timetable**. Each group has its own weekly schedule; different groups may have lessons at the same time. Activities within the same group cannot overlap. Switching groups is blocked until unsaved timetable changes are saved.
4. In **Display & school → Display class**, select a published group and save. Its class name, current lesson, teacher and next activity appear on the monitor. Changing the selected group does not erase other timetables. Draft class names and schedules become visible only after publishing.

Up to 50 groups and 3,000 weekly activities are supported, sharing the school's timezone and holidays. **Load sample** replaces only the currently selected group's draft. **Week board** supports moving lessons to another day/time by dragging. **Edit → Weekday/Start time** provides the keyboard/touch alternative. **Copy day / class** copies lessons into another day or class without removing existing target lessons. Teacher double bookings across classes are reported and prevent publication; saved drafts can retain conflicts while coordinators resolve them. **Preview draft** shows unpublished schedules in an authenticated read-only view.

## Classroom displays and special days

**Classrooms & screens → Add screen** assigns a name, published class and either a connected Windows monitor or a read-only browser/projector link. Different connected monitors can display different classes simultaneously. The default overlay hides on a monitor assigned to a classroom screen to avoid duplicate panels. Links are revocable; disabled displays lose access. Status is online, offline (no heartbeat for 15 seconds), outdated or disabled. Applied revision reflects the display's reported revision, not a hardware health guarantee. Administrator previews do not count as live screens. Class announcements can target one or all classes and expire automatically.

**Special days** supports date-specific replacement schedules and closed days. Load that weekday's normal lessons, edit a teacher to assign a substitute, or remove an activity to cancel it. **Ramadan / exam timing range** generates shortened lesson/break periods for selected classes over up to 62 days while preserving subjects and teachers. It replaces matching date/class drafts only after confirmation. Save, preview the exact school date/time, resolve teacher conflicts, then publish. Weekly schedules remain intact. Up to 2,000 class/date overrides and 20,000 replacement activities are supported; school holidays take priority.

## Recovery and updates

**System & recovery** shows publishing issues, screen status, version, recovery copies and update readiness. Business-data exports run every six hours and before publishing, restoring or installing an update. The latest 14 copies remain in the local app data `backups/` folder; download one and use **Administrator → Backup & recovery** to restore it. Backups include class schedules, special days, themes, images and screen assignments. They exclude passwords, sessions and display tokens; restoring screen assignments on a new installation generates new screen links. Temporary announcements are cleared on restore. Imported backups must be under 128 MB.

Every database save also preserves a complete `school.previous.sqlite` locally, including account credentials. If the current database is unreadable on startup, the app loads that last valid save and quarantines the damaged file. The administrator sees a recovery notice and audit entry; review recent changes because the most recent save can be lost. If both files are damaged, restore a complete database backup. These private database files are never downloadable through the web API or included in source control.

The local release is unsigned. Signed production builds and trusted update installation are implemented but require your publisher certificate and HTTPS update hosting. They remain unconfigured until those are supplied. See [DEPLOYMENT.md](DEPLOYMENT.md). Building or pushing source does not install an update or expose the control panel on the school network.

## Full-screen breaks and photos

In **Display & school → Full-screen school moments**, choose whether breaks fill the selected monitor. This is enabled by default. Use **Exit full screen** to return to the small panel for the remainder of that break. It does not close the application, change the timetable, or require a control-panel login. The exit remains effective through background synchronization; the next activity resets it. An active lesson uses the small clock by default, with optional start/finish screens; disabling **Clock only during lessons** restores the detailed panel. When a break finishes, the compact display returns automatically and a short back-to-class notification appears with its image. End of day shows only the clock.

Upload your own **PNG, JPEG or WebP photos up to 2 MB** for the break and the back-to-class notification, or restore the defaults. Select **Save settings** to apply them. Uploaded images stay in the local app data folder and are included in exported backups. Administrators and coordinators can access planning photos; teachers and display links are limited to their assigned published classes and school-wide images. Default photos are generated fictional students; provenance and prompts are in [assets/IMAGES.md](assets/IMAGES.md).

**Press Ctrl+Alt+Shift+S** to open the local administrator panel above the full-screen photo. This only opens the login/control window; changing settings or closing the overlay still requires administrator authentication.

Full-screen photo mode accepts mouse/touch input so its exit button works, and does not take keyboard focus. After exit, normal click-through behavior resumes. Pausing the overlay still hides it. Browser previews fill their page; the Windows overlay fills the selected monitor.

## Connected screens

Connect a screen, TV, projector or interactive board to the Windows host through HDMI, DisplayPort, USB-C, or a Windows-supported wireless display. Once Windows detects it, choose **Display & school → Refresh connected screens → Monitor**, then save. For independent room schedules, assign each monitor through **Classrooms & screens**. Windows duplicate mode mirrors the same output.

The app uses Windows display coordinates to handle resolution, DPI scaling, portrait orientation and displays placed to the left/above the main monitor. It repositions after monitor connection, disconnection, orientation or scale changes. A disconnected target falls back to the primary screen; reconnecting the same Windows display ID restores the target. Browser views also adapt to smaller screens. Native always-on-top behavior requires the Windows application on the computer providing the screen output; this is not an Android TV, macOS or standalone smart-screen application. Classroom hardware and wireless-display support still need testing on those devices.

## Local scope and data

The default service listens only on `127.0.0.1`, on port 4318. The control panel is available on the same computer, not other devices on the school network. Run one instance; close a development web server before opening the desktop application.

Installed/portable app data stays in `%APPDATA%/School Display/school.sqlite` for compatibility after the rename. The development web-only server stores its separate database in `runtime/`. Existing accounts and schedules migrate automatically. Credentials are scrypt hashes. Sessions expire after eight hours, when the same user signs in again, changes their password, or is disabled. Different administrators can stay signed in independently. Display links have a random, revocable token and can read only published schedules. Do not share backups or display links publicly.

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
npm.cmd run test:adjustments # Panel controls and separate class timetables
npm.cmd run test:workspace # Themes, roles, screens and special-day workflows
npm.cmd run test:tour      # Bilingual guided tour, role access and unsaved work
npm.cmd run dist:win       # Installer + portable app
```

For offline operation after installation, no development tools are needed. Dependencies and Windows packaging files require internet access during development/build. The binaries are unsigned local builds; a verified publisher certificate is a separate production-release step.

## Architecture

- `server/`: loopback-by-default HTTP API with optional explicit HTTPS hosting, scoped user accounts, SQLite persistence through SQL.js, backups and display settings.
- `shared/`: timezone-aware timetable validation and state calculation.
- `web/`: administration interface, monitor view, Arabic translations, offline schedule cache.
- `desktop/`: sandboxed Electron renderer, click-through window, tray, startup and password-authorized exit.
- `tests/`: schedule boundary tests, security/persistence checks and browser workflow verification.
- `releases/`: generated Windows packages, excluded from source control.

Independent displays on connected Windows monitors, browser display links, teacher substitutions, date-specific schedules, targeted announcements, logos, roles, theme colors and recovery are included. Remote Windows synchronization and HTTPS school-server hosting are prepared; live hosting stays inactive until configured and verified. Spreadsheet imports and operating-system lockdown remain separate extensions. The glass design takes inspiration from [Apple's Liquid Glass principles](https://developer.apple.com/documentation/technologyoverviews/liquid-glass); this is a Windows/web application, not a native iOS app.
