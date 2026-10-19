# Project task log

## 2026-10-20 - Full application audit and repairs

Repaired temporary-password enforcement, approval visibility and linked-employee ownership checks, atomic internal transfer decisions, CSV formula escaping, work/registry validation, generic company assignment and field errors, draft protection, stale sessions, task routes, safe connection settings, Arabic enum values and accessible controls. Reduced repeated dashboard/ledger work and removed verified unreachable modules. Archived 24 scratch files locally with checksums; business data was preserved.

Verification: full project checks passed (122 API/unit plus 10 UI support tests), all 348 responsive language/theme route combinations, focused audit/payroll/company/HR/document/notification browser workflows, and separate public website build and desktop/tablet/mobile checks. Both dependency audits reported zero known vulnerabilities. Public website CI coverage was added.

Details and limitations: [application audit](../APPLICATION_AUDIT_2026-10-20.md), CHANGELOG.md, PRODUCTION_READINESS.md and mobile/UPDATES.md. Original brief retained in 2026-10-20-APPLICATION-AUDIT-BRIEF.md. Source publication uses an audit review branch; no production deployment or native build/install was performed.

## 2026-10-20 - Shared management UI/UX redesign

Implemented the attached management-system brief in the existing shared React/Capacitor application:

- Consistent light/dark design tokens and shared styling for dashboards, navigation, module cards, tables, filters, forms, tabs, dialogs, responsive spacing and focus states.
- Management dashboard prioritizes existing authorized company metrics, workload and items requiring attention. Main Admin uses the same dashboard on phones; employee mobile self-service remains available.
- Persistent Morning / Night / System preferences, live operating-system changes, and a pre-paint appearance/language script. Selectors are available in the desktop header, mobile account drawer and authentication screen.
- Extended centralized Arabic translations, RTL alignment, metadata labels, known status/enum displays, date and relative-time formatting. Enum submission values, business names, user content, form drafts and language/theme independence are preserved.
- Correct module navigation highlights for nested and legacy routes. Fixed a tablet document overflow caused by a visually hidden HR table heading escaping its scroller.

Primary files: `src/enterprise.css`, `src/theme-context.tsx`, `src/components/AppearanceSelector.tsx`, `public/appearance.js`, `index.html`, `src/components/Layout.tsx`, `src/components/WorkspaceDashboard.tsx`, `src/components/ResponsiveHome.tsx`, `src/redesign-translations.ts`, `src/translations.ts`, `src/util.ts`, existing module components, `scripts/verify-redesign.mjs`, `scripts/test-translations.mjs`, `package.json`, `mobile/UPDATES.md` and `docs/UI_REDESIGN.md`.

Verification: full project checks (111 API/unit tests, app-lock/notification tests, five translation tests, backend/frontend TypeScript, storage, frontend production build and production security smoke checks); 348 route/language/theme/viewport combinations across 29 routes; finance form fit and enum stability; live System appearance changes, independent preferences, persistence and form-draft retention. Existing browser workflows passed for payroll, company profiles/employee identities, HR documents and HR communication. Desktop, tablet and mobile screenshots were reviewed. No lint command is configured.

Archive: original brief retained in `2026-10-20-UI-REDESIGN-BRIEF.md`; implementation and verification documented in `../UI_REDESIGN.md`. The committed source is also archived locally with its SHA-256 checksum. Generated QA screenshots, test data and source ZIP remain outside source control.

No backend/schema migration, dependency installation, real payroll action, native build or phone installation was performed. GitHub source publication is separate from hosting deployment and phone updates. Pre-existing untracked scratch files were left untouched and excluded from the commit.

## 2026-10-19 - HR payroll management

Implemented in the existing Stocrant architecture:

- Company-specific payroll policies, additive salary versions, approved earnings/deductions and overtime sources with revisions.
- Weekly, biweekly, monthly and custom previews/runs, integer monetary arithmetic, actual attendance and shift calculations, paid/unpaid/partial leave, duplicate and overlap protection.
- Draft / Pending Approval / Approved / Paid workflow, independent approval, immutable final snapshots, audited draft corrections and later-period historical adjustments.
- Confirmed payment metadata and one protected Finance ledger entry per run. Manual controlled-company salary posting is blocked to prevent double counting.
- Employee-only published payslips; backend tenant/location/ownership permissions; CSV export, report printing and payslip PDF printing.
- Responsive English/Arabic web and shared mobile UI, navigation and permission controls.

Affected files: `server/payroll-model.ts`, `server/payroll-migration.ts`, `server/payroll.ts`, `server/routes/payroll.ts`, `server/payroll.test.ts`, `server/storage.ts`, `server/app.ts`, `server/attendance.ts`, `server/crud.ts`, `server/workspace.ts`, `server/permissions.ts`, `server/organization-policy.ts`, `server/routes/workspace.ts`, `src/components/PayrollWorkspace.tsx`, `src/payroll.css`, `src/payroll-translations.ts`, `src/translations.ts`, `src/App.tsx`, `src/api.ts`, HR/Finance/employee/navigation/access components, `scripts/verify-payroll.mjs`, `package.json`, `mobile/UPDATES.md` and `docs/PAYROLL.md`.

Database changes: six additive payroll collections and three optional roles, with a private pre-payroll-v6 backup for existing stores. Existing business records, role grants and passwords are preserved. Test fixtures use separate temporary stores and are removed after verification.

Verification completed: `npm run check` passes with 111 API/unit tests (including 30 payroll tests), 8 app-lock/notification/Arabic tests, backend and frontend TypeScript, storage verification, the production frontend build and production security smoke checks. No lint script is configured. The final isolated Chrome check passes for actual rule/salary forms, source correction with independent approval, 12-employee generation, paging/search, draft recalculation, independent payroll approval, confirmed payment, PDF output and Arabic dark/mobile viewports. Screenshots were visually inspected.

Local launch verified at `http://localhost:3000/hr/payroll`: health succeeds, the SPA route returns 200, and unauthenticated payroll API access returns 401. This separate local preview needs first-time administrator setup; it does not restore or replace historical production data.

Deployment limits: one JSON-store API writer; company policies/contracts require authorized configuration; no bank transfers, WPS export or automatic statutory-law rules. Native binaries have not been rebuilt or installed for this task. No passwords, keys or credentials are stored in this archive.
