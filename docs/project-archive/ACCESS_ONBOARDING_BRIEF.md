# Stocrant — Access & Settings, Main Administrator Permissions & Employee Account Automation

Act as a senior full-stack developer, security architect, and UI/UX designer. Improve the existing Stocrant Management System directly in the project.

Use the attached Access & Settings screenshot as the design reference. Upgrade the current interface into a polished, modern, easy-to-use enterprise administration center.

**Important:** The application is Stocrant, a general business management system. Inspect the existing framework, database, authentication, email service, user roles, permissions, and routing before making changes. Preserve existing functionality and data. Implement real working features rather than visual mockups.

## 1. Main Administrator — Special System-Level Access

Create or improve a dedicated **Main Administrator** role. This role must be distinct from ordinary administrators and managers.

Only the Main Administrator can access the following special capabilities:

- Create, edit, activate, suspend, and manage companies and organizations.
- Manage all departments, sections, locations, employees, managers, users, and roles.
- Create and approve their own administrative records and requests where applicable.
- Approve requests across the system, including requests submitted by the Main Administrator.
- Manage approval rules, workflows, and authorized exceptions.
- Configure global application settings, security policies, and access permissions.
- View system-wide audit logs and administrative activity.
- Configure employee account creation, email delivery, and onboarding policies.
- Manage access to modules such as HR, inventory, finance, operations, and other existing application modules.

### Main Administrator self-approval

The Main Administrator must be able to create and approve their own eligible administrative records when the business workflow allows it.

Implement this as a **Main Administrator-only privilege**, not a general permission for other users.

Requirements:
- Allow the Main Administrator to submit and approve eligible requests created under their own account.
- Clearly identify self-approved records in the audit trail.
- Record the approver, requester, timestamp, record type, and reason where applicable.
- Keep the self-approval privilege disabled for ordinary administrators, managers, and employees.
- Do not bypass mandatory business rules, financial controls, or existing legal/compliance restrictions.
- For high-risk operations, provide a configurable policy requiring a separate approver where necessary.
- Prevent users from gaining Main Administrator privileges by modifying their own profile or request payload.

Enforce these rules on the server side, not just in the interface.

## 2. Improve the Access & Settings Layout

Redesign the entire Access & Settings page to be more professional, organized, responsive, and easier to navigate.

### Page header

Create a clear header with:
- Title: Access & Settings.
- Description: Manage users, permissions, approvals, and system configuration.
- Breadcrumb navigation.
- Main Administrator badge when applicable.
- Relevant quick actions.
- Search settings field.

### Settings navigation

Organize the sidebar into logical groups:

**Access Management**
- Users
- Roles & Permissions
- Approval Requests
- Approval Rules
- Audit Log

**Organization**
- Organizations & Companies
- Departments & Sections
- Locations
- Employees & HR

**Application**
- General Settings
- Inventory
- Finance
- Operations
- Notifications
- Security & App Lock
- Mobile App

Only show modules that exist or are supported by the current application. The Main Administrator should see all authorized system settings.

Make the sidebar collapsible, highlight the active page, support clear icons and hover states, and work correctly in Arabic RTL and English LTR.

### Settings dashboard

Replace the current collection of basic cards with a structured settings dashboard.

Include:
- Searchable settings categories.
- Compact summary cards for users, roles, pending approvals, companies, and departments.
- Clear category descriptions.
- Quick links to frequently used settings.
- Recent configuration changes.
- Pending approval summary.
- Helpful empty states.

Make each card clickable and navigate to the correct page.

Avoid large blank spaces, oversized cards, and unnecessary decorative elements.

## 3. Improve Role Management

Create an intuitive role and permission management interface for the Main Administrator.

### Role list

Display roles in a searchable, filterable table with:
- Role name.
- Description.
- Number of assigned users.
- Permission summary.
- System role or custom role indicator.
- Status.
- Last updated date.
- Actions.

Include existing roles such as Main Administrator, Administrator, Manager, and Employee where appropriate.

### Create and edit roles

Provide an easy Create Role / Edit Role workflow with:
- Role name.
- Description.
- Assigned users.
- Module permissions.
- Data access scope.
- Approval privileges.
- Status.

Allow custom roles to be created and modified without manually editing code or database records.

### Permission matrix

Organize permissions by module and action in a clear table or grouped permission editor.

Example structure:

| Module | View | Create | Edit | Delete | Approve | Export |
|---|---|---|---|---|---|---|
| Companies | Configurable | Configurable | Configurable | Configurable | Configurable | Configurable |
| Employees | Configurable | Configurable | Configurable | Configurable | Configurable | Configurable |
| Departments | Configurable | Configurable | Configurable | Configurable | Configurable | Configurable |
| Finance | Configurable | Configurable | Configurable | Configurable | Configurable | Configurable |
| Inventory | Configurable | Configurable | Configurable | Configurable | Configurable | Configurable |
| Approvals | Configurable | Configurable | Configurable | Configurable | Configurable | Configurable |
| Settings | Configurable | Configurable | Configurable | Configurable | Configurable | Configurable |

Use actual permissions and modules from the existing application. The table illustrates the intended interaction, not a requirement to create unsupported modules.

Support:
- Select all permissions for a module.
- Clear module permissions.
- Search permissions.
- Expand and collapse permission groups.
- Copy permissions from an existing role.
- Preview the permissions before saving.
- Confirm potentially disruptive changes.
- Display validation errors and save status.

Add data-scope controls where appropriate:
- All authorized organizations.
- Assigned company.
- Assigned department.
- Assigned section.
- Own records only.

### Protected system roles

The Main Administrator role must be protected.

- Do not allow an ordinary administrator to assign or modify Main Administrator privileges.
- Prevent accidental removal of the last active Main Administrator.
- Do not allow a user to grant themselves higher privileges through an editable role form.
- Restrict critical system-role changes to an explicit, secure administrative process.
- Revalidate existing sessions and permissions after role changes where appropriate.
- Record role and permission changes in the audit log.

When editing a role, provide a clear summary of the changes and the users affected before saving.

## 4. Automatic Employee ID and Username Generation

When an authorized user adds a new employee, automatically create the employee's identity and application account.

### Employee creation workflow

When the administrator or authorized HR user submits the Add Employee form:

1. Validate the employee information.
2. Save the employee record using the existing employee data model.
3. Generate a unique employee ID.
4. Generate a unique application username.
5. Create the linked user account.
6. Assign the appropriate default role and access scope.
7. Generate a secure account activation or password-setup process.
8. Send an onboarding email to the employee's registered email address.
9. Display the employee ID, username, account status, and email-delivery status to the authorized creator.

Make the employee record and user account reliably linked.

### Employee ID rules

- Use the existing employee ID format if one already exists.
- Otherwise, implement a configurable, consistent format, such as EMP-000001.
- Ensure uniqueness using database constraints or an equivalent atomic allocation mechanism.
- Handle concurrent employee creation safely.
- Do not reuse IDs from deleted or deactivated employee records unless the existing business rules explicitly require it.

### Username rules

Generate a username automatically based on the application's existing naming convention.

If no convention exists, use a configurable approach based on the employee's name, with a unique suffix when necessary.

Requirements:
- Normalize spaces and unsupported characters.
- Check uniqueness before saving.
- Handle duplicate names correctly.
- Prevent username collisions under concurrent requests.
- Do not expose unnecessary personal information in public URLs or logs.
- Allow the Main Administrator to change the username later when permitted.

Show the generated username on the employee confirmation screen.

## 5. Secure Password Setup and Email Delivery

When an employee is created, send an onboarding email to the registered email address automatically.

**Security requirement:** Do not email a permanent plaintext password. Instead, generate a cryptographically secure, single-use account activation or password-setup link so the employee can establish their own password securely.

### Email contents

Include:
- Company name and application branding.
- Employee name.
- Employee ID.
- Assigned username.
- Account activation or password-setup link.
- Link expiration time.
- Instructions for first-time access.
- Support contact information, if configured.

### Account activation

Implement the following:
- Cryptographically secure, single-use tokens.
- Secure token storage, preferably storing only a hash.
- Configurable token expiration.
- Password policy validation.
- Rate limiting and protection against repeated attempts.
- Token invalidation after successful password setup.
- Account activation status.
- Resend invitation action for authorized administrators.
- Invitation expiration and recovery handling.

Never send passwords through logs, audit records, or unsecured application notifications.

### Email delivery status

Show clear statuses:
- Pending.
- Sent.
- Failed.
- Expired.
- Accepted, where the mail provider supports confirmation.

If email delivery fails, retain the employee record and account safely, display the failure, and provide a retry action. Avoid creating duplicate employees or user accounts when retrying.

Use the email provider and service already configured in the project. If no provider exists, implement a configurable email service using environment variables and document the required configuration. Never hardcode email credentials.

## 6. Employee Account Linking and Duplicate Prevention

Ensure each employee is linked to the correct application user.

- Use a stable employee-to-user relationship.
- Prevent duplicate accounts for the same employee.
- Validate required email addresses.
- Handle duplicate email addresses according to existing business rules.
- Provide a clear error when a username or email conflicts with another account.
- Support safe retries if account creation or email sending fails.
- Use database transactions and an appropriate retry or background-job mechanism where supported.
- Make account creation idempotent to avoid duplicate records after repeated submissions.
- Record employee creation and invitation events in the audit log.

If the system already supports employees without login accounts, preserve that functionality where required and make automatic account creation configurable for the appropriate employee categories.

## 7. Approval Requests and Approval Rules

Improve the Approvals and Approval Rules settings pages.

Provide:
- Request type and reference.
- Requester.
- Assigned approver.
- Creation date.
- Priority.
- Current status.
- Due date, if applicable.
- Approval history.
- Comments and rejection reasons.
- Clear Approve, Reject, and Request Changes actions according to permissions.

Allow the Main Administrator to configure approval workflows where supported.

Ensure self-approval is permitted only under the Main Administrator policy described above. Do not silently approve requests or bypass required workflow validation.

## 8. Audit Log and Administrative History

Create or improve the audit log to record security-sensitive and administrative events.

Include:
- Employee and user creation.
- Employee ID and username assignment.
- Account invitations and activation events.
- Role and permission changes.
- Company and department changes.
- Approval and rejection actions.
- Main Administrator self-approval events.
- Security setting changes.
- Account activation, suspension, and deactivation.

Record the acting user, timestamp, action, affected record, outcome, and relevant before/after values where appropriate.

Restrict audit log access to authorized roles and avoid storing passwords, raw tokens, or unnecessary personal information.

## 9. Responsive Design, Themes, and Localization

Apply the same design quality across all settings pages.

- Use a consistent enterprise design system.
- Improve spacing, typography, cards, tables, forms, buttons, dialogs, and dropdowns.
- Add light and dark theme support across all settings.
- Support Arabic RTL and English LTR layouts.
- Translate all settings labels, permission names, validation messages, and notifications.
- Ensure keyboard navigation and visible focus states.
- Use accessible color contrast.
- Make tables responsive and usable on smaller screens.
- Provide loading skeletons, empty states, and clear error messages.

Use the application's existing theme and translation infrastructure.

## 10. Technical Requirements

Before implementation:
- Inspect authentication and authorization.
- Inspect employee, user, role, permission, and approval models.
- Inspect database relationships and unique constraints.
- Inspect email configuration.
- Inspect existing frontend routes and reusable components.
- Identify which requested features already exist.

During implementation:
- Reuse the current framework and architecture.
- Preserve existing records and working features.
- Implement permissions on both frontend and backend.
- Validate inputs on the server.
- Add migrations only when necessary.
- Use database constraints for unique IDs and usernames.
- Keep secrets in environment variables.
- Avoid unnecessary dependencies.
- Do not introduce fake production data.
- Do not leave nonfunctional buttons or placeholder settings.
- Do not remove existing features simply to simplify implementation.

## 11. Testing and Final Verification

Test all of the following:

1. Main Administrator can access the full authorized settings area.
2. Only the Main Administrator can use the special self-approval capability.
3. Ordinary administrators cannot grant themselves Main Administrator privileges.
4. Protected system roles cannot be accidentally deleted or compromised.
5. Role changes immediately affect the correct users and permissions.
6. Creating an employee generates a unique employee ID and username.
7. The employee account links to the correct employee record.
8. The onboarding email is sent to the registered email address.
9. The password-setup link expires and cannot be reused.
10. Email failures can be retried without duplicate accounts.
11. Concurrent employee creation does not generate duplicate identifiers.
12. Arabic RTL, English LTR, light theme, dark theme, and responsive layouts work correctly.
13. Existing authentication, data, navigation, and business workflows continue to function.
14. Build, lint, and available tests pass.

### Final deliverable

Implement these improvements directly in the existing project. Do not stop at describing the changes.

When finished, summarize:
- Features implemented.
- Files and database migrations changed.
- New environment variables or email configuration required.
- Tests executed and their results.
- Any remaining limitations or manual setup steps.