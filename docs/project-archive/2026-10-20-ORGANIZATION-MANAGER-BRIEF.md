# Stockrant – Organization Manager Full Company Access

Upgrade the Organization Manager module so that when the Organization Manager clicks on a company, they enter a complete company management workspace with full access to manage the company's employees, users, records, attendance, tasks, and notes.

## 1. Full Company Access
- When the Organization Manager clicks on a company, open its dedicated management dashboard.
- Grant full management access to all data and features belonging to that company, within the manager's assigned organization.
- Display company information, employees, user accounts, attendance, shifts, tasks, notes, and all related records.
- Ensure the manager can only access companies within their authorized organization.
- Apply permissions consistently across the interface, backend, APIs, and database operations.

## 2. Employee and User Management
Allow the Organization Manager to:
- Add new employees and create their user accounts when required.
- Automatically generate a unique employee ID.
- View all employees and users belonging to the selected company.
- Open complete employee profiles and view their information.
- Edit employee details, contact information, job titles, departments, employment status, and other applicable fields.
- Manage user roles, permissions, and account status within their authorized scope.
- Reset user passwords through a secure reset process.
- View each employee's related records and activity history.
- Deactivate or delete records when authorized, with confirmation and appropriate data-integrity checks.

## 3. Complete Attendance and HR Records
Give the Organization Manager access to the company's employee records, including:
- Daily attendance, check-in and check-out times, and working hours.
- Late arrivals, absences, overtime, and attendance corrections.
- Employee shifts, schedules, and shift assignments.
- Leave requests, approvals, and leave history.
- Employment details and relevant HR documents.
- Salary, overtime calculations, deductions, payroll periods, and payslips, where these features exist.

Allow authorized managers to edit relevant records, correct errors, review historical information, and view records by employee, date, department, or status.

All changes must be saved to the database and reflected consistently throughout the application.

## 4. Task Management
Add a task management feature within each company workspace.

The Organization Manager must be able to:
- Create tasks for individual employees or teams.
- Enter a task title, description, priority, assignee, start date, and due date.
- Set task statuses: Pending, In Progress, Completed, or Cancelled.
- Edit, reassign, track, and close tasks.
- View overdue tasks and upcoming deadlines.
- Add comments and follow-up updates.
- Filter tasks by employee, status, priority, and due date.

Employees should see tasks assigned to them according to their permissions. Task status changes should be reflected in the manager's dashboard.

## 5. Notes and Follow-Up Records
Add a dedicated notes section for each company and employee.

Allow the Organization Manager to:
- Create notes for a company, employee, or specific task.
- Edit and organize notes.
- Record follow-up actions, observations, reminders, and important updates.
- Include the author and creation date on every note.
- Search and filter notes by employee, date, or category.
- Restrict sensitive notes to authorized users.

Notes must remain linked to the correct company, employee, or task. Do not mix notes between different companies.

## 6. Professional Company Workspace
When a company is selected, display a modern dashboard with clear navigation sections:

- **Overview:** Company details, employee totals, attendance summary, open tasks, and recent activity.
- **Employees:** Employee directory, profiles, and employee management.
- **Users & Access:** User accounts, roles, permissions, and account status.
- **Attendance & Shifts:** Attendance records, working hours, schedules, and corrections.
- **HR & Leave:** Employee records, leave requests, and employment information.
- **Payroll:** Salary records, overtime, deductions, and payroll reports, where supported.
- **Tasks:** Create, assign, and track tasks.
- **Notes:** Company notes, employee notes, and follow-up records.
- **Reports:** Employee, attendance, task, and other available reports.
- **Company Settings:** Company information and configuration.

Use clean tables, readable forms, search and filtering, summary cards, consistent icons, and clear action buttons. Ensure Arabic RTL and English LTR layouts work correctly on all screen sizes.

## 7. Printing and Reporting
Allow the Organization Manager to print or export authorized company records, including:
- Employee directories and employee profiles.
- Attendance and working-hour reports.
- Shift and leave records.
- Task lists and task progress.
- Company and employee notes, subject to access restrictions.
- Payroll reports, subject to permissions.

Provide professional print layouts and PDF exports with appropriate company information, report dates, page numbers, readable tables, and correct Arabic and English formatting.

## 8. Security and Data Integrity
- Enforce company-level and organization-level access controls on the backend.
- Do not rely only on hiding buttons in the frontend.
- Prevent access to unrelated organizations or unauthorized company records.
- Protect passwords and sensitive employee information.
- Record important edits, attendance corrections, task changes, and account-management actions in an audit log.
- Preserve existing data and maintain valid relationships between companies, users, employees, attendance, tasks, and notes.

## 9. Implementation and Testing
Implement the feature directly in the existing Stockrant codebase.

- Inspect the current Organization Manager permissions and company workflow first.
- Reuse existing employee, attendance, task, notes, and payroll modules where possible.
- Connect all new actions to real backend and database functionality.
- Test access permissions, employee creation, profile editing, attendance access, task assignment, note management, and report exports.
- Fix bugs, broken buttons, missing validations, and layout issues.
- Update `CHANGELOG.md` with the completed changes and any remaining limitations.

**Expected result:** When the Organization Manager clicks on a company, they can manage that company's entire workforce and operational records from one professional workspace, including employees, users, attendance, tasks, and notes, without accessing data outside their authorized organization.