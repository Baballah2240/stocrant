# Application audit — October 20, 2026

## Scope and architecture

Reviewed the existing Express/JSON-store API, authentication and permissions, registry-driven CRUD, attendance, HR documents and communication, payroll, finance, inventory, customer service, shared React/Capacitor interface, native build configuration, CI/deployment configuration, and the separate public website. The existing application was repaired in place. No production deployment, native installation, destructive migration, or real financial operation was performed.

The management interface remains in `src/`, its API in `server/`, and its native shells in `android/` and `ios/`. `public-website/` remains an independent static application. No major dependencies were upgraded or added. CI now also builds and audits the separate public website.

## Findings and repairs

| Finding | Implemented repair |
| --- | --- |
| Admin-created temporary passwords were marked in storage, but the password-change component was unreachable and business APIs did not enforce it. | Exposed the existing flag in authenticated user state, mounted the password-change screen, blocked business APIs until rotation, rejected reuse of the temporary password, cleared the flag on success and retained session revocation. Accounts without the flag are unaffected. |
| Dashboard and HR approval summaries counted or returned requests outside the viewer's company/location scope. | Shared approval visibility resolution now drives counts and lists. Legacy request location information is resolved through the proposed/current record. Confidential HR document requests retain their separate permission checks. |
| Own-record authorization could match an editable account display name. | Explicit owner IDs take precedence. Legacy name assignments are accepted only through a unique linked employee identity; changing a profile name cannot grant access to another employee's assignments. |
| Internal transfers posted two rows in separate transactions, and each pending side could be decided independently. | Both sides are created in one transaction with a UUID group. Approval and rejection jointly process a consistent pending pair; a failure rolls back both decisions and ledger entries. Self-approval and scope checks remain enforced. |
| Generic and attendance CSV exports quoted text but did not prevent formula execution in spreadsheet applications. | A pure CSV encoder is shared by generic, payroll and attendance exports. It neutralizes formula-like text, escapes quotes and preserves numeric negative amounts. |
| Work updates accepted unvalidated request bodies; calendar-shaped but impossible dates were accepted on work creation. | Shared create/update schemas validate allowed fields, statuses, progress, titles and actual dates. Invalid updates do not alter existing records. |
| Registry selects accepted arbitrary values; required text accepted whitespace; optional numeric fields lost min/max rules. | Enforced enum, date, time, finite-number and whitespace validation. Required numeric blanks/booleans are rejected. Unchanged historical enum/date/time values remain editable without rewriting them. |
| Generic forms could omit company assignment or lose a legacy `companyId` when editing. | Added a required scoped company selector where registry metadata lacks one, defaulted single-company users, and retained legacy company values. Business names and stored IDs remain unchanged. |
| Field errors were flattened into a general message, and some form controls lacked associated labels or usable decimal steps. | Added structured API field errors, `ApiError`, adjacent localized feedback and ARIA associations. Fixed helper labels, decimal finance/inventory inputs and textarea associations. Failed validation retains entered values. |
| Generic edit forms could render empty defaults before loading, and metadata outages or invalid registry routes could display an endless loading message. | Added explicit loading, failed-record and missing-section states, metadata retry controls and stale-load guards. |
| Navigating away from a dirty generic form could silently discard data. | Added internal navigation confirmation and browser unload protection, while allowing successful saves to navigate normally. |
| Arabic Operations status labels were also used as controlled submission values. | Kept raw enum values and translated only display labels. Added a regression check against translated select values and options without stable values. |
| Dashboard task links had no matching detail route, notification links opened Operations, and legacy policy links could be misleading or unsafe. | Added an Operations task-detail route using the existing scoped API, corrected notification/self-service destinations, and routed policies through the authorized document detail page. Removed duplicate attendance controls. |
| Connection settings instructed users to clear the address, but rejected blank input; checks could hang and an old native token survived a server change. | Restored default-connection behavior, added a timeout and unmount cancellation, validated addresses, used unauthenticated health probes, and cleared the old native token when the selected server changes. |
| Lock/error screens contained corrupted inline Arabic, and several status, confirmation and action messages remained mixed-language. | Moved lock/error copy into centralized translations, localized known action feedback and workflow messages, corrected UI separators and American English terminology, and selected U.S. English date formatting. User-authored records remain untranslated. |
| The whole dashboard rendered every second solely to update one duration. Finance and inventory aggregation repeatedly scanned all movements for each account/item. | Isolated the duration timer and changed the aggregation stage to one pass per movement collection. Existing totals and scope checks are retained. No throughput claims are inferred from these changes. |
| Chrome verification could leave pending command timers/processes after startup failures. | Added process/pipe failure handling and startup cleanup to the existing test helper. |
| The separate marketing website described obsolete attendance/HR rules and implied that its email-draft form sent a server message. | Corrected the FAQ, described the email-draft action, and disabled contact submission with an honest message when contact email is not configured. |

Session refreshes are deduplicated and stale refresh responses cannot overwrite newer sign-in/sign-out operations. Business API responses requesting password setup or a new sign-in refresh the current account state.

## Cleanup

Removed only after checking the import graph and repository references:

- `src/components/Dashboard.tsx` — unused legacy dashboard.
- `src/components/FinanceOverview.tsx` — unused legacy Finance hub.
- `src/components/ModuleOverview.tsx` — unused generic module overview.
- `src/theme.ts` — legacy tokens used only by the removed dashboard.
- `src/components/CursorMotion.tsx` — pointer tracking for decorative effects already hidden by the current management theme.

`ForcedPasswordChange.tsx` was also unreachable, but was repaired and connected rather than removed.

Moved 24 pre-existing root scratch files into ignored `.local-preview/archived-scratch-2026-10-20/`, preserving names, sizes and SHA-256 hashes in `manifest.json`. These files are recoverable and are not committed. The files were `.ah.txt`, `.ai.txt`, `.aj.txt`, `.ak.txt`, `.al.txt`, `.api.txt`, `.classes.txt`, `.fd.txt`, `.fe.txt`, `.ff.txt`, `.fg.txt`, `.lay.txt`, `.lay2.txt`, `.scratch-classes.cjs`, `.sess.txt`, `.srv.txt`, `.t1.txt` through `.t6.txt`, `.tail.txt`, and empty file `x`.

Removed unused server imports, enabled unused-local/parameter checking in both server TypeScript configurations, corrected the package entry point to `dist/index.js`, and repaired six corrupted text runs plus the obsolete router version in the README. Native source assets and shared website/mobile code remain in place.

## Verification

All API and browser fixtures use isolated temporary data. Existing workflow fixtures model established accounts; the new audit suite exercises real temporary-password setup without that fixture shortcut. Payroll/document browser reviewers now complete the actual password-rotation API before performing their workflows.

| Executed command | Coverage / result |
| --- | --- |
| `npm run check` | 122 API/unit tests, 2 app-lock tests, 2 notification tests and 6 translation tests; frontend/backend TypeScript, storage/backup verification, production frontend build and production security smoke checks. Passed. |
| `node scripts/verify-redesign.mjs` | 29 routes × 4 language/appearance combinations × 3 viewport widths = 348 combinations. Passed; includes live System appearance, preference persistence and form-draft retention. |
| `node scripts/verify-audit.mjs` | Real password setup, task routing, policy links, Arabic status updates, scoped generic creation, field validation/draft protection, decimal amounts, keyboard picker/focus, metadata outage/retry, missing-route recovery and safe default server restoration. Passed. |
| Existing payroll/company/document/HR communication/notification browser scripts | Passed on the final source. |
| `node scripts/verify-public-website.mjs` | Passed: light/dark desktop, tablet and mobile fit, product-tour tabs, contact availability/action copy, attendance copy and mobile menu. No external message was sent. |
| `npm --prefix public-website run build` | Separate public website type check and production build. Passed. |
| `npm audit --json` and `npm --prefix public-website audit --json` | Zero reported vulnerabilities in both locked dependency trees at audit time. No dependency upgrades were needed. |
| Tracked-source secret-pattern scan | No matching private-key blocks or tested AWS/GitHub token patterns. This is a limited pattern scan, not a guarantee about every possible credential format. |

Screenshots were generated locally and visually reviewed. No lint or formatter script is configured; TypeScript, unused-code checks, build checks, translation checks and whitespace checks are used instead. The UI route matrix exercises fixture states, not every possible customer record or physical device.

## Rollout requirements and remaining limits

- These are local source changes. Live hosting configuration, CI results for this audit commit, real TLS, customer accounts, backups and monitoring have not been verified by this audit. No deployment or native build was requested or performed.
- The existing JSON store still requires one API process/writer. A transactional database and shared rate limiting are required before horizontal scaling. No database replacement or destructive migration was performed.
- Existing accounts explicitly marked `mustChangePassword` now have to rotate their temporary passwords. Existing unflagged passwords and accounts are not changed automatically.
- Ambiguous or unlinked name-only legacy assignments remain stored but do not grant own-record access. An authorized administrator must establish the correct identity/assignment where needed.
- Historical transfer pairs that were already partially decided are not silently rewritten. Reconcile any such historical records before relying on their balances; new pairs are jointly reviewed and posted atomically.
- Back up the JSON store and private attachments together, retain an independent private backup and test restoration before a production update.
- Release signing, distribution, real-phone biometrics/background behavior, OS printing and iOS builds remain separate device/platform checks. Shared mobile updates are documented in `mobile/UPDATES.md`.
- The public contact form opens an email draft, and requires configured public contact email. It does not provide server-side delivery or an inbox.

No claim of unconditional production readiness is made from local test results alone. See `PRODUCTION_READINESS.md` and `CHANGELOG.md` for the release checklist and dated change record. The original request is archived in `docs/project-archive/2026-10-20-APPLICATION-AUDIT-BRIEF.md`.
