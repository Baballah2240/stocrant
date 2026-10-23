# Organization administration

The platform **Main Admin** retains global administration. Each organization can designate its own **organization main admin**, using the existing Organization Admin role scoped to one organization. Company administrators use the existing Company Manager role scoped to one company. These roles do not provide global platform access.

## Assign an organization main admin later

Open **Organizations**, select the organization, and use **Assign main admin**. The platform Main Admin can choose an active account already belonging to that organization or create a new admin account directly in the card. New accounts require a unique email and a temporary password of at least 12 characters, which must be changed at first sign-in.

Organizations without a designated account show an admin-setup reminder. Organization creation is still permitted before assignment, as requested. Existing organizations with active Organization Admin accounts receive a primary designation during the additive migration; account company/organization scope is unchanged. A designation does not give a platform account tenant-scoped access.

Assignment uses an organization version check and one storage transaction. Concurrent/stale changes return 409. Only the platform Main Admin can designate or replace this primary account. Replacing the primary leaves the previous account and its organization privileges intact; review and change that account separately if its access should end. The previous account may be deactivated after replacement. The designated account cannot be deleted, demoted, reassigned or deactivated while its organization is active. Guards also cover linked employee termination and bulk role reassignment.

## Company HR and staff

Organization admins can create or assign Company Manager accounts for their child companies through existing scoped user management or the company staff panel. In a company profile, open **Users & Permissions** or **Attendance & Shifts**, then use **HR & staff access**:

- **Company Admin**: available to platform and organization admins.
- **HR Manager**: maintains HR records and performs the HR approval stage.
- **HR Staff**: maintains HR records without approval or account-administration rights.
- **Staff**: the Employee role, limited to the person's own records.

The panel assigns existing company accounts. Add an employee first to create their account, then complete invitation activation where required. Assignment replaces custom permissions with role defaults and sets Staff to own-record access. Existing location limits and activation requirements remain. A changed role revokes old sessions. Company summaries refresh after saving.

Company admins can delegate HR roles because the unchanged shipped Company Manager role receives `hr.approve` and `approvals.view` in addition to its prior permissions. The migration upgrades only the exact shipped permission list; customized role/account restrictions remain. All assignments are checked against the acting administrator's actual permissions and company scope. Company admins cannot promote themselves, appoint peer company admins, grant finance/platform access they do not have, or edit accounts in another company. Available role lists reflect these constraints.

Organization/company structure creation and global role editing retain their existing platform administration policy. This change adds administrative designation and people-role assignment; it does not automatically create companies or staff identities in production.

## Verification

Run `npm run check` and `npm run test:organization-admins`. The isolated browser scenario creates an organization admin from the organization page, completes real password rotation, delegates company administration, assigns all three HR/Staff roles, replaces the primary admin, verifies session revocation, and checks Arabic phone layouts. Backend tests verify persistence, versions, ownership and scope, primary-account protections, invitation requirements, role-list restrictions, employee termination and bulk-role guards. Existing organization-management and administration browser regressions also pass. Test data, screenshots and credentials remain outside source control.

GitHub source publication does not confirm a Render rollout or native app installation; verify those separately.
