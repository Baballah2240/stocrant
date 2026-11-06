# Faslii teacher app

Faslii is the teacher and parent app. It shares `web/teacher*` and `shared/` with the `/teacher` page and talks to the school server through bearer-token routes under `/api/mobile/`.

## Phase 1 (built)

**Tabs.** Teachers have Today, Notifications, Messages and Profile. Today has a Day / Week / Month / Class switch. Parents keep their own tabs.

**Today and timetable.** The current lesson has a live countdown and the next lesson. Breaks appear between lessons. Week shows five weeks, one week at a time. Month shows the next 35 days with lesson counts, holidays and changed days marked. Cancelled lessons are struck through, room and time changes are tagged on the lesson, and cover assignments show who the teacher is covering.

**Timetable change notices.** Each publish compares what every teacher sees over the next 14 days, before and after. One notice is created per real change: cancelled, room, time, cover assignment, lesson covered by someone else, or lesson added. Republishing the same timetable never repeats a notice. The app groups a change that repeats on several dates into one item. Teachers see before and after, tap **Acknowledge**, or **Report a conflict**. A conflict report opens a thread for managers.

**Messages.** Managers (administrators and coordinators) can message one teacher, the teachers of a class, all teachers, or parents. Each message has a type (message, announcement, meeting, event, urgent), a priority and an optional "Acknowledged" request. Teachers reply in the thread, and managers answer from **Special days → Message teachers and parents**.

**Tracking.** For each recipient, the server records separately when the message reached the app, when it was read and when it was acknowledged. The control panel shows these per message, lists who has not acknowledged yet, and shows teacher replies and changes still waiting for teachers. Push and email columns say **Not set up** until phase 2.

**Notifications tab.** One feed of messages, timetable changes and announcements. It can be filtered by category, priority and unread. Tapping an item opens its thread or change.

**Profile.** Shows name, email, school, subjects, classes and the name on the timetable. Settings:

- notification categories
- lesson reminders and start/end alerts (phone only)
- quiet hours
- hiding message text on the lock screen (on by default)
- language
- theme: match the phone, light or dark

Administrators decide whether urgent alerts sound during quiet hours, and write the explanation teachers see (**Urgent alerts and quiet hours**).

**Offline.** The last timetable, messages and notices stay on the phone. Replies, acknowledgements, conflict reports and preference changes go into an outbox. Each one shows **Waiting to send**, **Sent** or **Not sent** with **Try again**, and is delivered when the connection returns. Every item carries a client reference, so a retry is stored once.

**Phone notifications.** These are local notifications shown when the app refreshes. The app checks every minute while it is open and whenever it returns to the screen. Each item gets one notification. Category settings and quiet hours apply. Urgent alerts follow the administrator policy. Tapping a notification opens the related screen.

**Permissions.** Every route checks the signed-in user on the server. Teachers can only read, reply to, acknowledge or report on their own messages and notices. Parents cannot use teacher actions. Coordinators can message but cannot change the urgent-alert policy.

## Phase 2 (built)

**Requests.** From **Today → Requests**, teachers send leave, absence, timetable correction, maintenance and technical support requests. Each has a title, dates (required for leave and absence), details and up to 3 attachments. Teachers and managers can comment in the request. Status is **Pending**, **Approved**, **Rejected** or **Completed**, and managers can add feedback. An answered request appears in Notifications and as a phone notification. Requests without attachments go into the offline outbox; requests with attachments need a connection. Managers answer requests in **Special days → Teacher requests**.

**Resources.** From **Today → Resources**, teachers can search, filter by category (policies, teaching documents, forms, shared files), bookmark documents and show bookmarked only. They can open a document or save it for offline use; saved files are kept in the app's storage on the phone. Managers upload documents in **Special days → School resources** and choose a category, who can see each one (all teachers or chosen classes), whether it is important, and whether teachers may download it. Uploading a new file raises the version, replaces the old file and records a "what changed" note. When an important document is revised, teachers see it on Today and in Notifications.

**Attachments.** Allowed types are PDF, PNG, JPEG, WebP, DOCX, XLSX, PPTX and TXT, up to 5 MB each. The server checks the file content, not just its name. Files are stored under random names in `files/` in the data folder and are never served as web pages. Teachers can download only their own request files and resources addressed to them that allow downloads. Managers download through `/api/files/<id>` (sign-in required).

Limitations:
- On Android, **Open** hands the file to the WebView as a download. Opening it inside another app needs the Capacitor Filesystem plugin, which is not added yet. In the browser (`/teacher`), files download normally.
- Backups made under **System & recovery** do not include request attachments or resources yet. Copy the `files` folder with the data folder.

## Push notifications (built, connected to Firebase project `faslii`)

The server sends Firebase Cloud Messaging (HTTP v1) pushes for:
- staff messages and replies
- timetable changes (one push per teacher per publication)
- answered requests
- revised important documents

How delivery works:
- Each item is queued once per teacher.
- Pushes follow the teacher's notification categories and quiet hours. Held pushes are sent when quiet hours end. Urgent alerts follow the administrator's policy.
- The lock-screen text is hidden unless the teacher turns that off.
- Temporary Firebase errors are retried up to 5 times with backoff. Phones whose tokens Firebase no longer recognises are removed.
- The **Push** column in the delivery report shows `sent`, `held`, `retry`, `failed` or `skipped`.
- Tapping a push opens the related screen.
- When push works on a phone, the app stops showing its own local notifications for those items. Lesson reminders stay local.

Setup:
- **App:** `mobile/android/app/google-services.json`. It is ignored by Git and built into the APK.
- **Server:** set `SCHOOL_FCM_SERVICE_ACCOUNT` to the path of the service-account JSON. Without it, push stays off and the report says "Not set up".
  - **This computer:** the key is at `C:\Users\Lenovo\secrets\faslii-firebase-admin.json`, readable only by the Windows user. Set it before starting the server: PowerShell `$env:SCHOOL_FCM_SERVICE_ACCOUNT='C:\Users\Lenovo\secrets\faslii-firebase-admin.json'`.
  - **Render:** in the service, open **Environment → Secret Files** and add `faslii-firebase-admin.json` with the file's contents. `render.yaml` already points `SCHOOL_FCM_SERVICE_ACCOUNT` at `/etc/secrets/faslii-firebase-admin.json`.

Phones only register for push after signing in to a reachable HTTPS school server, so end-to-end delivery to a real phone starts once `schools.mohbaba.online` is online.

## API

| Route | Who | Purpose |
|---|---|---|
| `GET /api/mobile/timetable` | teacher, parent | Timetable plus `messages`, `notices`, `preferences`, `policy`, `subjects`. Marks new items delivered. |
| `POST /api/mobile/read` | teacher | `{ids, noticeIds}` |
| `POST /api/mobile/ack` | teacher | `{id}` or `{noticeId}` |
| `POST /api/mobile/reply` | teacher | `{threadId, text, clientId}` |
| `POST /api/mobile/conflict` | teacher | `{noticeId, text, clientId}` |
| `POST /api/mobile/preferences` | teacher | categories, reminder, quiet hours, lock-screen preview |
| `GET /api/teacher-messages` | admin, coordinator | Delivery report, conversations, changes, policy |
| `POST /api/teacher-messages` | admin, coordinator | `{userId or userIds, subject, text, category, priority, requireAck}` |
| `POST /api/teacher-messages/reply` | admin, coordinator | `{threadId, text}` |
| `PUT /api/message-policy` | admin | `{urgentBypassQuiet, noteEn, noteAr}` |
| `POST /api/mobile/requests` | teacher | `{type, title, details, from, to, attachments:[{name, data}], clientId}` |
| `POST /api/mobile/requests/comment` | teacher | `{id, text, clientId}` |
| `GET /api/mobile/files/<id>` | teacher | Download a permitted file (bearer token) |
| `GET /api/teacher-requests` | admin, coordinator | All requests |
| `POST /api/teacher-requests/decide` | admin, coordinator | `{id, status, comment}` |
| `POST /api/teacher-requests/comment` | admin, coordinator | `{id, text}` |
| `GET` / `POST /api/resources`, `POST /api/resources/remove` | admin, coordinator | Manage the resources library |

## Not built yet

These need a later phase. Several also need credentials from the school.

| Feature | Status | What is needed |
|---|---|---|
| **Email copies (SMTP)** | Not built. | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (for example an app password for a school mailbox). Email verification for each teacher. Copies will say that replies must be sent in Faslii. |
| Attachments on messages | Not built (requests and resources have them) | — |
| Opening files in other Android apps | Not built | `@capacitor/filesystem` plus a share/open step |
| iPhone app | Not built | A Mac and an Apple developer account. iPhones use `/teacher` in Safari meanwhile. |

The app only works on phones when the school server is reachable over HTTPS (see `HOSTING.md`). The built app connects to `schoolServer` in `mobile/package.json`.

## Tests

- `node --test tests/inbox.test.mjs`: server rules for delivery, read and acknowledgement tracking, idempotent replies, conflict reports, permissions, preferences, the urgent policy and change notices.
- `node --test tests/requests.test.mjs`: requests, attachments checked by content, file permissions, resource audiences, versions and view-only files.
- `npm run test:requests`: browser checks for both the teacher app and the control panel, covering requests with attachments, the offline queue, decisions with feedback, resource upload, search, bookmarks, offline copies, revision notices and Arabic layout.
- `npm run test:inbox`: browser checks at phone width covering tabs, month view, filters, before/after, acknowledgements, conflict report, threads, the offline outbox, preferences, dark theme, Arabic RTL and the manager report.
