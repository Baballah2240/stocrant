# Operations and shared task workflow

## Implemented behavior

Operations uses the existing `workItems` parent records and `workActivity` history. There is no second task collection and no task-per-recipient fan-out. New tasks contain a versioned `assignments[]` snapshot with one status, progress value and checklist completion list per employee.

- The central workspace shows total, personal, in-progress, completed, overdue and pending counts, search, company/team/employee/status/priority/deadline filters, deadline sorting and pagination. Company task creation links to this same workspace. Existing supplier/customer/product links remain available.
- Assignment supports a company, department/section, individual or selected group. Only active employees in the selected company and the creator's management scope are eligible. Entire-company/team assignments fail if they would cross that scope. Membership is resolved on creation/reassignment; later hires do not silently gain access to historical tasks.
- Employees with creation permission may create their own assigned tasks. Creation and editing grants remain separate. View-only assignees cannot write. Authorized assignees can change only their own contribution. Status, checklist and progress edits save automatically; notes/help/extension requests use **Post update**. Extension requests record the requested date without changing the deadline; managers accept a change through task management.
- Aggregate progress is the rounded mean of current assignee progress. Every assignee must complete their own checklist before completing their contribution. All completed contributions produce **Awaiting Approval** when review is required, otherwise **Completed**. A blocker produces **Blocked**. Managers can approve, request more work, cancel, reopen, change details/deadlines/priority, or reassign work. Removed contributions remain in historical change snapshots.
- Discussion supports immutable authored comments, replies, colleague mentions and uploaded-file references. Chronological comments show names, timestamps and initials as the profile fallback; this repository does not yet supply profile-photo records. History records actors, before/after changes and times.
- PDF/Office/JPEG/PNG uploads reuse the existing private document-file validator and storage. The API checks current task access before upload and every download, validates filenames/content signatures, enforces the configured size limit and a 100-file task cap, deduplicates identical uploads from the same author, and serves downloads with private/no-store and attachment headers. Files are stored under the ignored private data directory, never public web assets.
- Notifications cover assignment/reassignment, updates, discussions/mentions, help/blockers, requested extensions, approaching/overdue deadlines and completed work/review. A durable task/event/recipient key prevents repeat alerts. Current recipient permissions and task scope are checked before dispatch. Links resolve the live task and stop exposing details after access is revoked. System task notification copy supports English and Arabic while retaining the original task title.
- Deadline checks use each company's attendance timezone. Overdue counts exclude missing dates, completed and cancelled work. The regular notification poll and task-list requests trigger deadline dispatch; there is no new external email/native push or unattended scheduler.

## Permissions, approvals and compatibility

All task writes validate permissions and references on the server. Own-record users cannot reassign other people's tasks or change another participant's progress. Shared tasks remain readable to a location-restricted assignee at their own authorized location. Management of a shared task requires authority over every current recipient. Company/department restrictions remain enforced; task collaboration exposes basic participant identity, not salary, private HR records or management-only company notes.

Existing Operations creation rules queue an unpublished task request through the existing approvals system. Publication revalidates requester activity, permissions and the exact recipient snapshot. Existing Operations edit rules queue manager changes and reject stale versions at approval; new tasks under such a policy also require completion review. Assignee contributions remain direct and completion review is the authorization boundary for finishing their work.

Optimistic task versions prevent lost concurrent changes. Create/contribution/comment request keys replay identical requests and reject changed reuse. Task changes, histories and notification events commit in one synchronous storage transaction. New task history/file metadata cannot be edited or deleted through generic mutation paths.

Historical tasks are not mass-converted. Their old company editor and personal legacy APIs remain available. A manager can **Enable contributions** on a historical task, choose responsible employees and upgrade the same task ID; notes, files, activity and links remain attached. Initial per-person progress is explicitly inherited from the old aggregate as the upgrade baseline; the history preserves the original record. Legacy tasks with no stable recipient identity require that manager selection before individual contributions can be recorded.

## Additive migration and rollback

`migrateOperations()` adds only `workFiles` and `taskNotificationEvents`. Existing stores receive `data/stocrant.pre-operations-v8-backup.json` before migration is saved. Existing task, financial, HR and permission records are preserved. New task schema version 2 is assigned only on explicit creation/upgrade.

Before deployment, stop writers, back up the complete private data directory including `private-documents`, and test on a copy. To roll back, stop the service, preserve a copy of the upgraded data, restore the verified pre-upgrade directory and matching application version, then restart. Reconcile new work/comments/files before restoring an older snapshot; otherwise valid post-upgrade activity would be lost. The existing store is still a single-writer JSON database; do not run multiple writers against it.

## Files and verification

- Engine, APIs and migration: `server/operations.ts`, `server/routes/tasks.ts`, `server/operations-migration.ts`, `server/app.ts`, `server/storage.ts`.
- Existing integration points: `server/workspace.ts`, `server/routes/workspace.ts`, `server/permissions.ts`, `server/notifications.ts`, `server/notification-context.ts`, `server/types.ts`.
- Shared web/mobile: `src/components/OperationsWorkspace.tsx`, `src/operations.css`, `src/components/CompanyWork.tsx`, `src/components/NotificationBell.tsx`, `src/components/EmployeeInbox.tsx`, `src/types.ts`, `src/operations-translations.ts`, `src/translations.ts`.
- Tests and handover: `server/operations.test.ts`, `scripts/verify-operations.mjs`, `package.json`, this document and `mobile/UPDATES.md`.

Automated API tests cover all four assignment modes, one-parent persistence, idempotent creation, foreign-recipient rejection, location/department scope, create-only/view-only permissions, self-assigned tasks, concurrent contribution conflict, separate checklists, review/rework, blockers/extensions, replies/mentions, file validation/download scope, reassignment/revocation, deadline deduplication, configured approvals/stale versions, in-place legacy upgrade, additive migration and transaction rollback.

`npm run check` covers server/frontend types, the complete backend regression suite, storage checks, app lock, notifications, financial arithmetic, translation coverage, frontend build and production smoke checks. Final run passed: 194 backend tests, 2 app-lock tests, 2 notification tests, 1 financial-arithmetic test, 6 translation tests, storage verification, both TypeScript checks, frontend production build and production smoke checks. `git diff --check` passed.

`npm run test:operations` adds an isolated browser E2E scenario for creation, automatic completion, discussion, persistence, responsive layout and Arabic RTL. It was attempted but Chrome exited before browser verification. The connected browser inventory was also empty. Therefore visual appearance, focus behavior and interactive desktop/mobile/RTL verification remain release checks; no visual pass is claimed.

Uploads use format validation rather than antivirus scanning. Mentions are explicit task-colleague selection rather than an inline `@` text parser. Company/team membership is a saved snapshot; deadline alerts are generated on API activity. No hosting deployment, native binary build or phone installation is included.
