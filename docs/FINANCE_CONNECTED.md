# Connected Finance

## Integration review — 2026-10-25

The overview shows all-date customer receivables, bills/refunds due and approved unpaid payroll for the selected company and currency. Draft/cancelled documents are excluded. Payroll requires payroll view access. Currencies with obligations remain selectable before an account exists. Unverified sources appear as reconciliation exceptions rather than invented totals.

The browser and API share a pure transaction classifier. Both keep loans, advances, repayments, transfers and unclassified movements separate from operating profit. Net cash movement retains their cash effects. This corrects the older API totals that treated non-payroll money-in as income.

Source detail pages link to their exact Finance document. Dispatched shop orders open their linked sale in Finance; Finance can return to that order. Only eligible documents offer payment actions. Missing accounts produce a setup link. Changing tabs clears individual-source filters, company/currency links restore their context, and Finance refreshes when the app regains focus.

Stock receipts can optionally link an eligible purchase from the same company. Both the receipt and incoming inventory movement retain its ID. Finance shows a receipt count and receiving link. Duplicate retries do not add stock twice. Linked purchases cannot be deleted, moved to another company/currency or changed to draft/cancelled. Receiving does not create a bank payment, mark the purchase paid or calculate inventory valuation.

Commit-time integrity checks protect source company/currency/type links and total settlements, in addition to existing payroll allocation, transfer-pair, reference and reversal protections. Tests cover rollback of orphaned links/overpayments, fractional currencies, finance-only payroll redaction and unpaid bills without accounts. Browser checks cover exact source settlement/reversal balances, navigation back from documents, procurement receipts, shop sales, payroll and customer support. No live production data was rewritten or audited by these isolated checks.

Finance opens with an overview and shortcuts to Sales, Purchases, Banking, All movements, Salaries & payroll and Profit & loss. Expand Filters to choose company, currency, account, dates, person or search. Banking balances use the complete paid account history; movement totals use the selected filters.

Sales and Purchases show the existing source records and their ledger-derived paid and outstanding amounts. Create records through the linked source forms and record completed payments against them. The existing server enforces company/currency scope, approvals, idempotency, overpayment limits and immutable postings. Reconciliation supports authorized payment reversals.

Salaries & payroll embeds the existing payroll workspace, including salary versions, earnings/deductions, generation, independent approval, payment allocation, payslip details and printing. Payroll keeps its own company, period and employee filters. Posting a payroll payment refreshes Finance; it is not a second manual salary movement. Recording a payment does not initiate a bank transfer.

Profit & loss is explicitly a **cash-basis operating report**. It includes paid income, linked customer returns, purchase payments, operating expenses, reimbursements, taxes and salary payments, with reversals retaining their original category. Loans, advances, repayments, transfers and unclassified movements affect cash but are excluded from operating profit. It is not an accrual statement or inventory valuation report. Currencies are never combined; calculations use integer minor units.

Verification: backend regression suite (242 tests), TypeScript, translation checks, operating-result precision/reversal tests, all website builds and production smoke checks. `node scripts/verify-finance-connected.mjs` uses isolated data to verify the connected views and desktop/mobile/Arabic dark layouts. Screenshots are local QA artifacts under `.local-preview/qa/`.
