# Manager private notebook

Managers can use **Dashboard → My private notes and reminders** on the website and shared mobile interface. Supported roles are Main Admin, Manager, Organization Admin, Company Manager, HR Manager, General Manager and Finance Manager.

Each note has a required title, optional text, optional phone number and optional reminder time. Managers can search, pin, edit, complete, reopen and delete their own notes. Phone links open the device's calling handler. Deletion requires confirmation.

The notebook starts as a compact dashboard card with up to two previews. **Open notebook** expands the complete controls; editing or following a private reminder also expands it. **Collapse notebook** returns to the preview.

Managers can select **Customize dashboard** to reorder components with arrows or desktop drag handles, set half/full width, and hide or show components. **Save layout** persists the account's layout across devices; **Cancel** discards layout edits, and **Reset layout** prepares the default arrangement for review before saving. Phone layouts stack cards into one column. These are component groups: the summary metrics and the management overview each move as one group.

Layout settings are owner-scoped and versioned. A stale save is rejected with an option to reload the saved layout. Existing forms and chart state remain mounted while cards move. A private reminder opens the notebook even when its card is hidden, without changing the saved visibility preference. Customization changes presentation; it does not grant module permissions.

## Privacy and persistence

The authenticated account ID supplies ownership on the server. Another manager in the same organization, employees and the Main Admin cannot list, retrieve, change or delete another account's personal notes through the application. Unowned IDs return 404. The private collection is excluded from generic collection CRUD, metadata and exports. This is separate from company notes, whose management/employee sharing rules still apply.

Notes persist in the existing application store and its backups. This is application access isolation, not end-to-end encryption: infrastructure operators with filesystem or backup access can still read stored data. Keep the production data directory on persistent storage using the existing deployment configuration.

Create requests use an account-scoped UUID and payload hash for safe retry. Changes and deletion require the saved version; stale requests return 409. The editor offers **Reload saved note** after a conflict, rather than silently overwriting a newer change. Writes and reminder creation use the existing atomic storage transaction.

## Reminder behavior

The editor uses the device's local timezone, shown next to the time field. The API stores UTC timestamps. Due, incomplete reminders create one notification per scheduled time when the owner next polls the authenticated in-app inbox. This catches up after time offline; it does not guarantee delivery while the application is closed. Notification previews contain generic text; the owner's authenticated detail opens the private notebook. No SMS, email or operating-system alarm is sent.

Completing or deleting a note removes its reminder notifications. Changing the scheduled time resets delivery. Reopening a completed note preserves the prior delivery marker; set a new reminder time to request another notification. Pinning does not change delivery.

## Workflow gaps corrected

- All supported manager roles now retain their dashboard at mobile widths, instead of falling through to the employee people view.
- Managers without a linked employee record receive the correct attendance guidance.
- Delegated organization managers no longer see structure create/edit/delete controls that the server reserves for Main Admin. Employee, company-profile and other scoped management access retain their existing policies.
- The organization browser regression now seeds a legacy task for legacy record coverage and checks the current Operations creation link. The current task contribution flow is verified separately.

## Verification

`npm run check` passed, including 211 backend tests, frontend/backend type checks, translation coverage, storage recovery, financial precision checks, production builds and the production smoke test.

`npm run test:personal-notes` builds and runs an isolated browser scenario that creates an organization and company through Main Admin forms, provisions a manager with real temporary-password rotation, creates an employee through the scoped company profile, and exercises private note/phone/reminder creation, editing, pinning, completion, reopening, search, deletion, duplicate-submit protection and Main Admin isolation. It checks desktop/mobile English light and Arabic dark layouts. Screenshots stay under ignored `.local-preview/qa/personal-notes/`.

Additional browser regressions passed for organization management, administration, complete workspace/reporting, work activity, Operations and mobile attendance. Backend tests cover ownership injection, unauthorized roles, cross-organization access, persistence after cache reload, concurrent retries, stale updates/deletion, reminder privacy/deduplication/rescheduling and pagination.

The customization update adds browser coverage for compact sizing, reordering/arrows/drag, resizing, visibility, save/reload, reset/cancel, preserving an unsaved note, hidden-notebook reminder links and mobile Arabic customization controls. Backend coverage checks layout ownership, persistence, validation, unavailable generic exports and stale-write conflicts. The dashboard activity regression was rerun after this update; the other broader browser regressions above were run for the initial notebook release.

Tests use temporary application data and accounts, cleaned up afterward. They do not create records in the live organization. Passing these checks does not certify every possible production scenario. A GitHub push does not verify Render rollout, persistent-disk configuration or installation of a native app update; verify those separately.
