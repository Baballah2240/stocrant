# Personal attendance clock and history

The shared website/mobile source now displays a live clock and working-duration timer on Home, personal Attendance, and the existing HR attendance workspace for eligible accounts. The personal Attendance page adds Today, calendar week (Monday–Sunday), calendar month and custom date filters, ten-record pagination and read-only session details. Custom windows support up to 366 days per query; older records remain accessible by choosing another window.

## Recording and permissions

Mobile check-in/out and HR clock-in/out use the same attendance service and collection. The backend derives the employee/account and company from the authenticated session, stores UTC timestamps, rejects supplied identities or timestamps and prevents overlapping new sessions. UUID request IDs make uncertain retries idempotent. The existing three-session daily maximum remains in place. An overnight check-out closes the original record instead of creating another day’s record.

The new personal endpoints return only the signed-in account’s permitted records, even when the account has HR permissions. Existing administrative attendance, corrections, approvals and payroll remain available through their existing authorized endpoints. Records under review or finalized cannot be changed by self-service punches. Main Administrator has no personal clock. Existing account-only attendance for unlinked managers remains compatible.

## Time and payroll semantics

Company attendance timezone governs day boundaries, history dates and clock presentation. Today’s timer clips intervals to that local calendar day, including an open interval that began yesterday. Completed sessions exclude gaps. The browser advances from a server-time calibration and saved timestamps, refreshes on resume/reconnect and periodically, and rehydrates after reload. No request is sent for each second.

Recorded duration is the actual interval total; policy hours remain subject to existing unpaid-break and payroll rules. Both are labeled separately in details. Remaining scheduled time uses an assigned shift, or explicitly saved company attendance settings, and is omitted when no schedule exists or the day is not scheduled. Late/early indicators use the assigned schedule and grace periods. No new break-state workflow or financial formula was added.

Older HH:MM records are interpreted in their company timezone and marked as minute precision. They are not bulk rewritten, and seconds absent from historical data are not invented. Only an authorized subsequent punch normalizes that record’s sessions. Runtime data is never reset by this change.

## Validation

- `npm run check`: TypeScript, API suites (including personal attendance), storage restoration, UI support/translation checks, frontend build and production security smoke.
- `npm run test:mobile-attendance`: isolated Chrome employee workflow, live seconds, duplicate-click protection, timestamp persistence/reload, stopped duration, all history filters, pagination/details, empty/loading/error/retry and 12 English/Arabic light/dark desktop/tablet/phone layouts.
- Personal API tests cover authentication, own-record isolation, spoofing/edits, concurrent retries, session limits, 125-record history, legacy minute records, overnight sessions, approval/tracking controls and 23/25-hour DST dates.
- Existing payroll and dashboard browser workflows, plus 48 neighboring-route layout cases, are exercised separately.

Browser tests use disposable private local fixtures. Screenshots and logs remain ignored under `.local-preview/`. Native APK compilation, installation on a phone and live hosting deployment are separate actions; this source update alone performs none of them.
