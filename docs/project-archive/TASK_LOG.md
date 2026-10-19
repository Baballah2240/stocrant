# Project task log

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
