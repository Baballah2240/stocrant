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

## Not built yet

These need a later phase. Several also need credentials from the school.

| Feature | Status | What is needed |
|---|---|---|
| **Push notifications (Firebase Cloud Messaging)** | Not built. Alerts only appear when the app refreshes. | A Firebase project with an Android app `online.schooldisplay.teacher`. `google-services.json` goes in `mobile/android/app/` (keep it out of Git). A service-account JSON goes on the server as `FCM_SERVICE_ACCOUNT_FILE`. Adds `@capacitor/push-notifications` and device-token registration. |
| **Email copies (SMTP)** | Not built. | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (for example an app password for a school mailbox). Email verification for each teacher. Copies will say that replies must be sent in Faslii. |
| Attachments on messages and requests | Not built | Protected file storage with size and type limits |
| Teacher requests (leave, absence, timetable correction, maintenance, IT) | Not built | — |
| School resources library | Not built | — |
| iPhone app | Not built | A Mac and an Apple developer account. iPhones use `/teacher` in Safari meanwhile. |

The app only works on phones when the school server is reachable over HTTPS (see `HOSTING.md`). The built app connects to `schoolServer` in `mobile/package.json`.

## Tests

- `node --test tests/inbox.test.mjs`: server rules for delivery, read and acknowledgement tracking, idempotent replies, conflict reports, permissions, preferences, the urgent policy and change notices.
- `npm run test:inbox`: browser checks at phone width covering tabs, month view, filters, before/after, acknowledgements, conflict report, threads, the offline outbox, preferences, dark theme, Arabic RTL and the manager report.
