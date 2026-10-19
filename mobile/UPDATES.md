# Mobile update history

Keep mobile changes here in the same commit as their corresponding website changes.

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
