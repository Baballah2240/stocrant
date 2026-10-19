# Payroll management

Payroll is available at `/hr/payroll`. Employees use `/me/payroll` for their own approved or paid payslips. The shared website/mobile UI supports English, Arabic, dark/light themes, searchable choices, responsive tables, CSV export and printing or saving payslips as PDF through the browser print dialog.

## First use

1. The Main Admin assigns company/location scope and payroll permissions through Access & Settings. Existing roles and individual grants are deliberately preserved.
2. Use the additive **Payroll HR Manager** role for preparation and configuration, **Payroll Approver** for independent review, and **Payroll Finance** for confirmed payments. Existing HR users can instead receive individual `payroll.*` permissions. No demonstration accounts or passwords are created by this feature.
3. In Payroll, choose a company, confirm its payroll rules, then confirm each employee's salary contract. The salary form suggests the existing employee salary and company currency; saving a reason creates an explicit salary version.
4. Enter bonuses, commissions, advances, loan repayments, statutory deductions or other adjustments with a unique reference. A different authorized user approves them. Overtime requests select a matching attendance source and minutes; one active request per employee/day prevents duplicate authorization.
5. Generate a weekly, biweekly, monthly or custom-period preview for selected employees. Check warnings, then save the draft. Input changes invalidate the preview. Each run uses one currency.
6. Correct sources or salary versions as needed, and recalculate the draft with a reason. Submit, independently approve, then record an **already completed** payment with its account, date, reference and method. No money is transferred by this application.

The creator, submitter and last correcting user cannot approve their own run. Source creators cannot approve their own requests. Payment additionally requires `finance.view` and `finance.create`; an existing Finance-create approval rule also requires `finance.approve` to post the confirmed payment.

## Calculation policy

- All stored payroll monetary components and totals use decimal strings with BigInt arithmetic. Half ties round away from zero. Supported currency precision is 0 digits for JPY/KRW, 3 for KWD/BHD/OMR, and 2 for the other supported currencies.
- Supported currencies: QAR, USD, EUR, GBP, AED, SAR, KWD, BHD, OMR, JPY, KRW, INR, PKR, BDT, PHP and EGP. Currency conversion is not performed. Generate separate runs for different currencies.
- Monthly salary is prorated against the actual scheduled working days in each calendar month; weekly salary uses the scheduled working days per week. Hire dates restrict payable days. Salary changes inside a period require separate custom periods at the effective date.
- Hourly salary uses completed regular attendance minutes. Recurring hourly allowances are amounts per regular worked hour. Approved paid leave for hourly staff is separately configurable.
- A salary profile can explicitly assign an existing company shift. Its start/end, break and working days determine the schedule. Shift days accept numeric weekday arrays or readable ranges/lists such as `Mon-Fri` and `Sun,Mon,Tue`.
- Attendance approval is required by default. Actual timestamps determine hours; precomputed attendance `hours` fields do not authorize pay. Overlapping same-day intervals merge; reuse across different payroll days is rejected. Incomplete/invalid intervals produce warnings and are excluded. Legacy clock-only entries use the company time zone; ISO timestamps should be used for accurate historical records.
- A single continuous attendance interval deducts its configured break. Separate clocked sessions are treated as already excluding breaks. Overnight timestamp sessions are supported, including lateness across midnight.
- Overtime is disabled by default. When enabled, eligibility, fixed hourly rates or multipliers, regular/rest/holiday categories, minimum increments and rounding are configurable. Separate approval limits payable minutes when required. Overtime requests must refer to valid attendance; rounding cannot exceed explicitly approved minutes.
- Deductions are disabled by default. Unpaid leave needs approved leave; absence needs an explicit approved absent attendance record, rather than an inferred missing check-in. Approved paid leave is protected. One-day partial leave uses its approved day fraction; split multi-day partial requests into daily approved requests to remove ambiguity.
- Loan/advance/statutory/other fixed deductions require independently approved sources. Configured deduction caps are enforced by rejecting invalid previews, rather than silently truncating obligations. Negative net pay also requires an explicit policy and cannot be recorded as a payment.
- Allowance, overtime, earning and deduction components have explanations and sources. Details retain original employee/company data, salary configuration, rules, shift, attendance, leave, adjustments and calculation time.

No universal overtime, statutory deduction or Qatar legal multiplier is installed. Company rules must be reviewed for the applicable contract, employee category and jurisdiction before real payroll is processed. This module does not certify legal compliance or submit WPS/bank files.

## Corrections and history

- Draft recalculation stores the previous and new calculations, responsible user, time and reason in protected payroll history.
- Salary versions are additive. Correcting the same effective date creates another version and retains the earlier record; identical duplicate versions are rejected. Finalized payslips retain their original version.
- Source revisions retain the original source as superseded and create a pending correction requiring independent approval. A draft using a superseded source must be recalculated before submission. Submitted runs must return to Draft before source correction.
- Approved and paid runs cannot be edited, deleted, regenerated or paid twice. Use a referenced, independently approved adjustment in a later payroll period. Original payslips and ledger entries remain unchanged.
- Legacy payroll is preserved. Finalized legacy periods block overlapping generation. Legacy drafts are retained in storage and marked as superseded when replaced by a previewed controlled run; their amounts are not blindly added to newly calculated amounts.

## Finance and permissions

Confirmed payments create exactly one immutable `financeTransactions` row, `type: payroll`, `direction: out`, linked by `payrollRunId`. Finance reports count that payment once as payroll. Approval alone does not move account balances or create an expense. Internal transfer accounting is unchanged and excluded from income/expense totals.

Manual salary transactions are blocked for companies with configured controlled payroll. Use the Payroll payment workflow; existing historical finance records remain intact. Generic CRUD and historical approval paths cannot bypass payroll or linked-payment protection.

`payroll.view/create/edit/approve/export/configure/pay` are independent permissions. Backend endpoints recheck company, location and own-record restrictions. Partial location access does not reveal another location's run totals. Employee access requires an explicit account/employee link and returns only their approved/paid records without other employees, full run totals, private source snapshots or management history.

## Storage and deployment

The additive migration creates `payrollSettings`, `payrollSalaries`, `payrollRuns`, `payrollEntries`, `payrollSources` and `payrollHistory`, plus the three payroll roles. Existing accounts, grants, hashes and historical payslips are not rewritten. Before migrating an existing store, a private `stocrant.pre-payroll-v6-backup.json` is saved beside the data.

Generation, transitions, revisions, history/audit and payment posting use the existing synchronous JSON-store transaction and atomic file replacement. Run **one API process/writer** for this storage architecture. Multiple application instances or workers sharing the JSON file require a transactional database migration first. Protect the data directory, its backups and private documents with restricted filesystem access, encrypted storage and tested backups; they are never public frontend assets.

No external payment, email or messaging service was added. Browser PDF printing is supported; native mobile printing remains dependent on the WebView/device. The shared mobile source is updated, but this task does not build or install a new APK.

## Verification

- `npm run check`: backend/frontend TypeScript, complete API suite including payroll, storage checks, app-lock/notification/Arabic tests, production frontend build and production security smoke checks.
- `node --test dist/payroll.test.js`: payroll unit and API tests, after `npm run build`.
- `npm run test:payroll`: isolated Chrome workflow against temporary data; requires installed Chrome or `CHROME_EXE`. Covers rules, salary setup, source correction/approval, 12 employees, generation, search/paging, draft correction, separate approval, confirmed Finance payment, printable PDF and Arabic/mobile layouts.
- No lint script is configured in this project. No real business payroll or external payment is used by these tests.
