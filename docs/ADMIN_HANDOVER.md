# Archive companies and replace administrator access

Run this only in the Render Shell for the existing Stocrant service, after the commit containing `scripts/admin-handover.mjs` has deployed. A GitHub push alone does not verify deployment. The service must remain running: the command uses its authenticated API rather than editing its cached database file.

```sh
STOCRANT_ADMIN_HANDOVER=archive-companies-disable-users node scripts/admin-handover.mjs
```

Enter the **existing Main Administrator's email and password** when prompted. Password input is hidden. Do not paste passwords, generated credentials or backups into chat, GitHub, or build logs.

The command uses the service's `PORT` and `STOCRANT_DATA_DIR`. It creates a private, verified snapshot in the persistent data directory's `backups/` folder before account changes. It creates a Main Administrator for **mohammedbaballah142@gmail.com**, named **Mohammed Baballah**, and generates a random password. If this email already belongs to a Main Administrator, it retains that account and refreshes its password. An email belonging to another role stops the operation for review.

It prints the new credentials privately in Shell and verifies the login before archiving companies and their parent organizations, then disabling all other accounts. Orders, inventory, Finance, payroll, documents, messages, employees and previous audit records remain stored. Account and archive changes use normal validation, audit and session-revocation behavior. The new Main Administrator can review archived history and create new organizations and companies.

Save the printed credentials in a password manager. Sign in at **https://www.mohbaba.online**, open **My profile** to change the generated password and personal details, or use **Access & Settings → Users** for account settings.

If any request fails, the command stops. No records are deleted, but completed archive/access changes remain applied; keep the printed credentials and backup. Re-running with the verified new Main credentials resumes remaining work. Do not restore the backup over a running service: coordinate a stopped-service restore to avoid overwriting cached or newer business data.

Optional environment overrides: `STOCRANT_NEW_ADMIN_EMAIL`, `STOCRANT_NEW_ADMIN_NAME`, `STOCRANT_CURRENT_ADMIN_EMAIL`, `STOCRANT_CURRENT_ADMIN_PASSWORD`, `STOCRANT_ADMIN_API_BASE`. Use HTTPS except for the loopback service address. Never commit these values.
