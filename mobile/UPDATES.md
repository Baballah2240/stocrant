# Mobile update history

Keep mobile changes here in the same commit as their corresponding website changes.

## 2026-10-22 - Shared Operations and task collaboration

- Replace the shared phone/website Operations list with a central task workspace, searchable assignment selectors, dashboard counts, scoped filters and detailed task pages.
- Keep one parent task for company/team/group assignments; add individual progress, checklists, review/rework, blockers, extension requests, chronological replies/mentions and private supporting files.
- Connect scoped, deduplicated task/deadline notifications and secure task links; preserve legacy tasks, personal work, notes, approval policies and historical activity through additive migration and explicit in-place upgrade.
- Automated backend/build/translation checks are documented in `docs/OPERATIONS_TASKS.md`. Browser E2E was attempted but Chrome exited before verification; mobile/RTL visual QA remains pending.
- No native app binary was rebuilt or installed and no hosting deployment was performed.

## 2026-10-21 - Connected payroll and financial ledger

- Shared phone/website payroll now records full or partial employee payments with immutable ledger allocations, paid/outstanding amounts, payment histories and retry protection.
- Connect approved source settlements, advance/loan recoveries, authorized reversals, exact currency totals and monthly cash-flow reporting to the existing cash ledger. Preserve salary snapshots, independent approvals and own-payslip privacy.
- Add commit-time financial constraints, additive finance-history migration/backup, chained audit history and rollback documentation. Details and remaining integration/storage limitations: `docs/FINANCIAL_FLOW.md`.
- No native app build, phone installation or hosting deployment performed. Browser visual verification remains pending because the Chrome E2E process exited before verification.

## 2026-10-21 - Newest notifications first

- Combine device activity and account notifications in one chronological list, newest first, across the shared website and mobile panel.
- Show decision/read timing in summaries and effective date, shift, location and acknowledgment status in notification details and history.
- Source update only; no native build, installation or hosting deployment performed.

## 2026-10-21 - Complete notification details

- Show full notification messages with priority, sender, read state, exact timestamps, shift/location and acknowledgment requirements in the shared phone/website panel.
- Add clear labeled details and permission-checked links for related tasks, stock, documents, leave, attendance and approval records; preserve existing HR acknowledgment and administrator decisions.
- Verified Arabic/English, both themes and responsive layouts. Source changes do not deploy hosting, rebuild an APK or install a phone update.

## 2026-10-21 - Accurate personal attendance clock and history

- Added a server-calibrated HH:MM:SS clock, saved-timestamp working timer, clear check-in/out actions, schedule summary and late/early indicators to shared mobile and website screens.
- Unified mobile and HR punches on the existing attendance collection with UTC timestamps, safe repeated requests, duplicate prevention, overnight check-out and existing approval/session rules.
- Added own-record history with Today/week/month/custom filters, pagination and session details; preserved legacy minute precision and existing payroll break calculations.
- Verified English/Arabic RTL, light/dark and phone/tablet/desktop browser layouts. No native APK was built or installed, and no live hosting deployment is included. Details: `docs/MOBILE_ATTENDANCE.md`.

## 2026-10-21 - Release CI SDK setup repair

- Explicitly select the supported `platform-tools` package for Android CI setup. The action's old default requested the retired `tools` package and failed before compiling the app, preventing a fully passing release check.
- Retained website verification, SDK license handling, Android package compilation and artifact publication. No generated APK, credentials or runtime data is committed.

## 2026-10-21 - Reference-inspired dashboard and colorful activity charts

- Updated the shared desktop and phone dashboard with a rounded analytical card grid, clearer colorful KPI icons, teal/violet Work Activity lines, actual status rings and activity-volume bars.
- Preserved real data, timezone filters, scoped task permissions, drill-down, current backlog and existing self-service controls. New chart summaries reuse the existing activity request; task completion is explicitly a current all-dates snapshot.
- Added interactive series toggles, sparse-data markers, accessible status counts and compact recent-activity rows. Arabic/English and both themes remain supported; dashboard styling is scoped so the project-wide light-blue theme remains elsewhere.
- No native binary was built or installed. Source publication does not deploy hosting or update a phone. Details: `docs/DASHBOARD_REFERENCE.md`.

## 2026-10-21 - Light blue project-wide recoloring

- Changed the primary accent color from blue-600 (`#2563eb`) to light blue (`#3b82f6`) across the shared website/mobile themes (`src/theme.css`, `src/ui-refresh.css`) and the public website (`public-website/src/theme.css`), covering light, dark and iOS premium layers plus `--ios-blue`.
- Updated hardcoded accent instances (buttons, badges, focus rings, avatar/hero gradients, finance trend chart stroke) to the new light blue.
- No native binary was rebuilt or installed. Source publication does not deploy hosting or update a phone.

## 2026-10-20 - Work Activity chart and Today filter

- Added the shared Chart.js Work Activity line/area chart to desktop and manager/employee phone homes, with point/table drill-down, exact totals, recent work events and permission-scoped record links.
- Added Today, 7-day, 30-day and custom dashboard periods, hourly/daily buckets and a per-account saved timezone preference. Date changes update dated insights; outstanding/overdue tasks remain current across all creation dates.
- Added empty/loading/error/retry states, accessible data tables, cyan/blue theme-aware colors, Arabic RTL and responsive layout checks. Actual completion transitions prevent repeated completed-task comments from inflating completion counts.
- No native binary was rebuilt or installed. Source publication does not deploy hosting or update a phone. Details: `docs/WORK_ACTIVITY.md`.

## 2026-10-20 - Access, settings and employee onboarding

- Redesigned the shared administration center with grouped/searchable navigation, compact summaries, roles/permission matrices, policy controls and request review history. Phone navigation uses a compact scrolling bar with RTL support.
- Added Main-only administrative policy configuration and reasoned eligible self-approval, while preserving independent payroll/finance/inventory and attendance controls. Company/organization writes are Main-only under the latest brief.
- New employee creation opens account confirmation with generated identity and delivery status. Automatic accounts and encrypted activation-email delivery are configurable; existing private activation and no-login workflows remain available.
- Role changes revoke affected sessions, scope can be restricted to departments/sections/own records, and system-role protections remain server-enforced. Added English/Arabic copy and theme-aware responsive validation.
- Live mail requires the documented server environment/provider setup. No native build, phone installation or hosting deployment was performed for this source update.

## 2026-10-20 - Dashboard and company management upgrade

- Shared company navigation now includes inline information editing, managers, department/section dashboards, documents and activity. The responsive directory adds reporting filters, sorting, column choices, page sizes and authorized bulk status changes.
- Mobile and web dashboards share scoped interactive analytics, chart/table views, date filters and device-local widget/chart preferences. Existing themes and Arabic RTL apply to charts and controls.
- Notification history adds read/category/date/search filters, pagination, synchronized read counts and offline feedback. Existing HR retention and acknowledgment rules remain enforced.
- Reporting relationships use validated same-company links with cycle and orphan protection. Existing employee/account/payroll data remains in the same source/storage architecture.
- Verified through isolated API and Chrome workflows, including phone-width rendering. No native build, installation or hosting deployment was performed.

## 2026-10-20 - Organization Manager company work

- Added company Tasks, Notes, separate HR & Leave navigation and live task counts; employee profiles can show permitted tasks and notes.
- Shared task forms support employee/team assignment, dates, status, priority, progress, comments and filters. Notes support linked records, follow-up dates, author timestamps and restricted visibility.
- Updated shipped organization-manager permissions additively for payroll and company reports. Account and cross-organization safeguards remain on the API; employees require Operations view to see assigned work.
- Added authorized task/note report previews and Arabic/English Print / Save as PDF layouts. Responsive browser checks passed; physical native dialogs and phone installation were not tested. No APK build or installation was requested/performed.

## 2026-10-20 - Complete employee workspace and reports

- Added dedicated employee sections for personal/employment/contact/address details, account setup, HR records, payroll, documents and history. Save and Cancel return to the employee profile; legacy account-setup links remain supported.
- Expanded permission-aware directory details and company attendance summaries. Salary visibility and updates are protected independently from general HR editing; existing records and relationships remain intact.
- Added authorized company/employee report previews with Print and Export PDF actions. PDF saving uses the platform print dialog; report styles support Arabic/English and exclude application controls.
- Verified responsive browser layouts and generated English/Arabic short and multi-page PDFs. Native print dialogs, APK builds and phone installation remain separate platform checks; none was performed here.

## 2026-10-20 - Dedicated company workspace

- Added shared company navigation for overview, employees, HR/attendance, payroll, communication, users, reports and settings, shown according to permissions.
- Added company switching, identity/contact header, compact statistics, recent employee records, pending leave updates and searchable/filterable/sortable employee management.
- Company settings supports a validated HTTPS logo URL; unavailable images use the shared fallback icon.
- Company links preselect payroll, attendance, notification recipients and record lists. Responsive wrapping navigation supports Arabic RTL and English LTR with light/dark surfaces.
- Preserved existing editing, employee creation, account activation and business data. Source-only update; no native build or phone installation performed.

## 2026-10-20 - Application audit and workflow repairs

- Enforced flagged temporary-password setup in the shared UI and business APIs, improved session refresh handling, and retained existing password/session policies. Unflagged accounts remain unchanged.
- Fixed Arabic Operations status values, task and notification navigation, private policy links, form labels, decimal input, scoped company selection, inline validation, draft/discard handling and recovery states.
- Improved mobile picker keyboard/focus behavior and default server restoration; server changes clear the old native token and connection checks have timeouts/cancellation.
- Shared API repairs cover approval privacy, own-record identity checks, atomic transfer pairs, export safety and validation. Existing records are preserved.
- Source-only update: no native build or installation was requested. Flagged accounts using older binaries may need to complete password setup through the current web interface until a new APK is installed.

## 2026-10-20 - Shared management interface redesign

- Updated shared workspace surfaces, dashboard metrics, forms, tables, tabs, dialogs and responsive spacing for Morning and Night appearances in English and Arabic.
- Added a persistent Morning / Night / System selector to the header, mobile account drawer and sign-in screen, including live system changes and early preference application.
- Main Admin now sees the management dashboard on mobile. Employee self-service, attendance, account controls and existing permissions remain available.
- Extended the existing Arabic dictionary and preserved raw API values for translated enum choices. Added route/theme/viewport checks and retained existing payroll, company, document and HR communication browser regressions.
- Shared source only: no native APK was requested, built or installed for this redesign.

## 2026-10-19 - Payroll management

- Added shared responsive payroll management and employee-only payslips with English/Arabic layouts, salary versions, attendance/shift calculations, approved source adjustments, independent approvals and confirmed Finance payment records.
- Payroll access follows backend company, location, ownership and action permissions. Existing accounts and historical records remain intact.
- Shared source and browser/mobile viewport workflows are verified. A new native APK has not been built or installed for this payroll task; build/save it with the existing mobile workflow when requested.

## 2026-10-19 ? App logo

- Refined the existing ledger mark into a blue-to-mint app icon on navy. Saved an editable SVG, 1024px PNG and rounded preview in mobile/branding/.
- Generated all Android launcher, round and adaptive foreground sizes and the opaque iOS icon from shared design parameters. Validated 17 native/master PNG dimensions and rebuilt/saved the Android debug package locally.
- Source command: npm run mobile:icons. This icon update has not been installed on the phone or pushed to GitHub during this task.

## 2026-10-19 ? Company profiles and employee identities

- Shared website/mobile company profile now has grouped information cards, readable organization names, a scoped employee table and English/Arabic responsive layouts.
- Employee creation generates an immutable Employee ID and unique username, creates the linked restricted account, and supports private password-setup invitations directly from the employee profile.
- Added email-or-username login, company preselection and duplicate-submission protection. Existing records, account links and passwords are retained.
- Verified 89 automated tests, production checks, company/HR browser workflows, and rebuilt the Android debug APK into mobile/releases/. This build is saved locally; it was not installed on the phone during this task.

## 2026-10-19

- Shared HR employee accounts, secure activation invitations, private documents, notification history, urgent alerts, meeting links and acknowledgments are included in the Android app.
- English/Arabic and responsive layouts share the website implementation.
- Repaired the Android Gradle wrapper and verified the debug APK build/signature.
- Installed the updated APK in place on the connected Android phone, preserving app data. Configured USB access to the separate local preview.
- Added a local release folder/manifest script and GitHub build artifacts for website and Android updates from the same source commit.

The APK installed locally is a USB development build. Production distribution needs a deployed HTTPS API and a stable private release-signing key. GitHub CI debug APKs are test artifacts and may use a different signing key from the installed app.
