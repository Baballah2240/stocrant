# Connected payroll and financial flow

## Records and calculation boundaries

`financeTransactions` remains the authoritative cash ledger. Salary calculations remain in immutable `payrollEntries` linked to `payrollRuns`; an approved salary is a liability, not a cash movement. Payslip paid/outstanding amounts are derived from ledger allocations. They are not added to the next period's earnings, which would charge the same salary twice. Pay the earlier run to clear an earlier balance.

Existing monthly, weekly, biweekly and custom payroll, approved attendance/leave, configurable overtime, salary versions, allowances, bonuses, commissions, deductions and printable payslips remain in use. No statutory overtime, tax or Qatar deduction rate was introduced or certified. Company policy, contract terms, employee eligibility, QAR currency and timezone must be configured by authorized users. Payroll preview, submission and approval compare current inputs; changed inputs require recalculation. Finalized snapshots are never recalculated from later attendance or salary changes.

Cash inputs reject fractions below the currency's minor unit. Payroll's rational calculation engine retains half-away-from-zero rounding per component. Frontend reporting adds integer minor units; charts convert their finished values to numbers for presentation. Currency totals stay separate. Legacy scalar summary fields return `null` when currencies differ; clients should use `totals[]`. Account `balance` and new financial amounts are decimal strings.

## Workflows

1. HR configures policy and salary versions, prepares sources, previews and saves a draft.
2. A separate approver reviews sources and approves the submitted, current payroll version. An approver cannot approve their own payroll preparation or correction.
3. A user with `payroll.pay`, `finance.view` and `finance.create` records an actual full/partial payment with account, date, amount, method, reference, reason and retry key. Configured Finance approval policy additionally requires `finance.approve`.
4. A payment can target one payslip. With all payslips selected it fills remaining payslips in stable entry-ID order; this is a sequential allocation, not proportional distribution. The immutable transaction contains its employee allocations. Each employee sees only their allocation and payment history, without bank-batch totals or another employee's latest payment reference.
5. Expenses, sales, purchases and returns can be settled from Finance → Reconciliation. Only eligible source states can be settled (completed sales; approved/reimbursed expenses; ordered/received/partial purchases; approved/refunded returns), within the source company, currency and remaining amount. Sources themselves are never counted as cash. Historical paid flags do not manufacture a ledger entry. Salary-category expenses cannot bypass configured payroll.
6. Employee advances/loans use confirmed outgoing ledger movements. Payroll installments reference that transaction ID; pending installments reserve recovery capacity. Payroll installments plus linked cash repayments cannot exceed the original disbursement. A linked cash repayment uses `recoversTransactionId`; the employee repayment form accepts the originating advance/loan transaction ID. Rejected/superseded installments release their reservation.
7. Finance approvers can reverse posted payments using a new opposite transaction with a unique reference, date and reason. The original remains unchanged. A payroll reversal also restores its allocated liabilities. Transfers are corrected by recording a new opposite paired transfer. Resolve linked recoveries before reversing a disbursement.

Posted transactions and used accounts cannot be edited/deleted through mutation APIs. Corrections use reversals and new records; finalized earnings/deductions use approved later-period adjustments. A settled source remains immutable even after reversal; record a corrected source rather than rewriting its history.

## Integrity and auditing

- `transaction()` commits cash, allocations, run status and history together by flushed temporary-file write and atomic rename. Failure restores cached state and leaves the original disk file intact.
- Payment keys replay identical submissions and reject changed details. References are unique per company, except the two legs of one transfer. The old all-remaining payroll `transition: pay` endpoint remains compatible and rejects repeated stale versions.
- Commit-time constraints in `finance-integrity.ts` enforce modern transaction IDs, keys, references, account/company/currency consistency, paired transfers, approved payroll, allocation totals, no payslip overpayment and valid single reversals.
- `financeHistory` is append-only through application APIs and SHA-256 chained, including payroll and account mutations. `financialHistoryValid()` checks the chain. This is tamper evidence, not an externally anchored/independently signed log; a privileged filesystem operator can rewrite the entire chain.
- Existing scoped approvals, payroll permissions, company/location boundaries, sensitive-data rules and own-payslip restrictions still apply. Source settlement is revalidated at approval, rather than trusting the original request payload.

## Additive migration and rollback

`migrateFinance()` adds only `financeHistory`. Before changing an existing store, storage creates `data/stocrant.pre-finance-v7-backup.json` if absent. It does not rewrite historical transactions, salaries, grants, passwords or paid flags. New postings have `ledgerVersion: 1`; commit constraints apply to these records. Invalid historical amounts, missing accounts, directions and currency mismatches are reported for reconciliation rather than silently discarded as legitimate cash. No real business data was migrated as part of development testing.

Before deployment: stop the service, copy the complete private data directory, test an upgrade on that copy, and verify currency/account/source reconciliation. Keep one server process writing the JSON store. To roll back, stop all writers, retain a forensic copy of the upgraded store, restore the verified pre-upgrade directory and matching source version, then restart. Do not restore the old backup over new valid payments without reconciling and preserving those payments; replaying them can duplicate real disbursements.

## Changed files

- Ledger, constraints and migration: `server/finance-ledger.ts`, `server/finance-integrity.ts`, `server/finance-migration.ts`, `server/storage.ts`, `server/workspace.ts`, `server/permissions.ts`.
- Payroll/payment engine and APIs: `server/payroll.ts`, `server/payroll-model.ts`, `server/payroll-payments.ts`, `server/routes/payroll.ts`, `server/routes/workspace.ts`.
- Shared website/mobile UI: `src/components/FinanceWorkspace.tsx`, `FinanceReconciliation.tsx`, `MonthlyCashFlow.tsx`, `PayrollWorkspace.tsx`, `PayrollPaymentDialog.tsx`, `WorkspaceDashboard.tsx`; `src/money.ts`, `src/api.ts`, `src/finance-translations.ts`, `src/translations.ts`, `src/theme.css`.
- Verification: `server/finance-flow.test.ts`, `server/payroll.test.ts`, `server/routes.test.ts`, `server/audit.test.ts`, `scripts/test-financial-money.mjs`, `package.json`, `mobile/UPDATES.md`.

The earlier notification changes in the working tree are independent and retained.

## Verification and remaining limits

Automated coverage includes decimal precision, payroll periods/calculations, company and employee permissions, snapshot stability, stale attendance, full/partial payments, concurrent retries, changed retry payloads, overpayment, reversals, source reconciliation, loan/advance over-recovery, pending approval replay/revalidation, transfer consistency, simulated disk failure/rollback, migration compatibility, tamper detection, translation coverage and production-mode checks. Final `npm run check` passed: server/frontend type checks, 180 backend tests, storage verification, 2 app-lock tests, 2 notification tests, 1 frontend monetary-arithmetic test, 6 translation tests, frontend production build and production smoke checks. `git diff --check` also passed.

The existing payroll browser E2E runner was attempted; Chrome exited before browser verification. The connected-browser fallback also reported no registered browsers and no available in-app browser. Consequently responsive appearance, the new dialogs, print layout and interactive end-to-end behavior have not been visually verified in this environment. They require browser QA before release.

This remains the application's single-writer JSON cash ledger, not a general ledger or a multi-process transactional database. There is no double-entry chart of accounts, accrual profit statement, bank feed, payment gateway, automatic bank/WPS submission, tax filing or statutory compliance certification. Recording a confirmed payment does not send money. Cash repayment and payroll installment forms currently accept the originating transaction ID rather than providing a dedicated loan-agreement/schedule editor. Reconcile ambiguous legacy company/currency/account links manually; the migration deliberately does not infer them. Payroll liability totals are current all-period obligations, not date-filtered cash figures. Existing frontend historical attendance estimates retain their legacy policy; configured payroll uses its own approved-source calculation and does not double-post those estimates.

No hosting deployment, Git push, native build, APK installation or external payment occurred.
