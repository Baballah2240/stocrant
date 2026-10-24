# Connected Finance

Finance opens with an overview and shortcuts to Sales, Purchases, Banking, All movements, Salaries & payroll and Profit & loss. Expand Filters to choose company, currency, account, dates, person or search. Banking balances use the complete paid account history; movement totals use the selected filters.

Sales and Purchases show the existing source records and their ledger-derived paid and outstanding amounts. Create records through the linked source forms and record completed payments against them. The existing server enforces company/currency scope, approvals, idempotency, overpayment limits and immutable postings. Reconciliation supports authorized payment reversals.

Salaries & payroll embeds the existing payroll workspace, including salary versions, earnings/deductions, generation, independent approval, payment allocation, payslip details and printing. Payroll keeps its own company, period and employee filters. Posting a payroll payment refreshes Finance; it is not a second manual salary movement. Recording a payment does not initiate a bank transfer.

Profit & loss is explicitly a **cash-basis operating report**. It includes paid income, linked customer returns, purchase payments, operating expenses, reimbursements, taxes and salary payments, with reversals retaining their original category. Loans, advances, repayments, transfers and unclassified movements affect cash but are excluded from operating profit. It is not an accrual statement or inventory valuation report. Currencies are never combined; calculations use integer minor units.

Verification: backend regression suite (242 tests), TypeScript, translation checks, operating-result precision/reversal tests, all website builds and production smoke checks. `node scripts/verify-finance-connected.mjs` uses isolated data to verify the connected views and desktop/mobile/Arabic dark layouts. Screenshots are local QA artifacts under `.local-preview/qa/`.
