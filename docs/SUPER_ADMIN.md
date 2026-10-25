# Super Admin

Super Admin is the protected platform-owner role. It manages all users, organizations, companies, access roles, approval rules and audit history. Company administrators and managers remain restricted to their explicitly assigned companies. Super Admin changes apply immediately without approval; validations, audit records and last-administrator protection remain active.

The existing internal role ID `role-main-manager` is retained so existing Main Manager/Main Administrator logins continue working. Existing platform-owner accounts display **Super Admin**; accounts are never promoted because of their name or email. Each login needs a unique email. The protected role cannot be copied by creating a custom role named Super Admin.

## Create an additional login

An existing platform administrator can use **Access & Settings → Users → Add user → Super Admin**. Use an unused email and a unique temporary password. This creates a separate login and preserves existing users and business records.

Alternatively, after this source version is deployed, open the existing service's **Render Shell** and run:

```sh
npm run admin:create-super
```

Enter the existing platform administrator email, an unused email for the additional Super Admin, and the existing administrator's password at the hidden prompt. The command generates a temporary password, prints it privately in Shell, and verifies the new login and its full permissions. Save the credentials in a password manager; do not send them to chat or GitHub. First sign-in requires changing the temporary password. The existing administrator, other accounts, companies and business history remain intact.

This command creates an additional account only. The separate `admin:handover` command archives companies and disables old accounts and is not needed for additional Super Admin creation. Publishing source does not create a live login or verify hosting deployment.
