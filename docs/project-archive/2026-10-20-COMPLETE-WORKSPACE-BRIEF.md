# Stockrant – Complete Organization & Company Management Workspace

Improve the Organization section in Stockrant to create a complete, modern, professional company management system with a perfect, intuitive layout.

## 1. Organization and Company Navigation
- When I open an organization, display all companies belonging to that organization in a clean, organized layout.
- When I click on a company, open its dedicated management workspace.
- Clearly display the company name, logo, company ID, status, contact information, and key statistics.
- Make it easy to navigate between the organization, its companies, and their employees.
- Ensure all information belongs to the correct organization and company.

## 2. Complete Employee Directory
Inside each company, display all employees belonging to that company in a professional, searchable table.

Include the following information wherever applicable:
- Employee ID, generated uniquely for each employee.
- Full name and profile photo.
- Username and account status.
- Job title, department, and assigned role.
- Phone number, email, and address.
- Joining date and employment status.
- Salary and payroll information, visible only to authorized users.
- Attendance, shifts, and other existing employee records.

Add search, sorting, filtering, pagination, and clear status indicators. Allow users to select an employee and open their complete profile.

## 3. Complete Employee Profile and Editing
When an employee is selected, open a well-organized profile with clear sections or tabs.

- Personal information.
- Employment information.
- Contact information.
- Account credentials and access permissions.
- Attendance, shifts, and leave records.
- Salary, overtime, deductions, and payroll history.
- Documents and attachments, if supported.
- Activity history and relevant records.

Allow authorized users to edit every applicable field, save changes, and immediately see the updated information throughout the application.

Requirements:
- Provide clear Edit, Save, Cancel, and Delete actions.
- Validate all inputs and display understandable error messages.
- Ask for confirmation before destructive actions.
- Generate a unique employee ID automatically when creating an employee.
- If creating an employee also creates a user account, connect both records correctly.
- Never display passwords in plain text. Use secure password creation and reset workflows.
- Restrict sensitive salary, personal, and account information according to user permissions.
- Record important changes in an audit log where supported.

## 4. Printing and PDF Export
Allow authorized users to print or export all relevant company information and records.

Support printing or exporting:
- Complete employee lists.
- Individual employee profiles.
- Company information.
- Employee contact directories.
- Attendance and shift reports.
- Leave records.
- Payroll reports and payslips.
- Other existing reports and records.

Provide clear **Print** and **Export PDF** actions where appropriate.

Printing requirements:
- Create clean, professional, print-ready layouts.
- Include relevant company branding, report titles, dates, and page numbers.
- Use readable fonts, appropriate spacing, and correctly aligned tables.
- Support Arabic and English, including correct RTL/LTR formatting.
- Prevent buttons, navigation bars, and unnecessary interface elements from appearing on printed pages.
- Handle multi-page tables correctly and repeat table headers where possible.
- Apply permissions before generating or exporting sensitive information.
- Ensure exported files contain real application data, not placeholder content.

## 5. Perfect the Company Management Layout
Redesign the entire experience using a consistent enterprise dashboard layout.

- Create a clear company header with essential information and primary actions.
- Organize sections into intuitive tabs such as Overview, Employees, HR & Attendance, Payroll, Reports, and Settings, based on implemented features.
- Use compact summary cards for employee totals, active staff, attendance, and other relevant statistics.
- Use consistent typography, colors, icons, spacing, borders, and component sizes.
- Make tables readable without excessive horizontal scrolling.
- Keep important actions easy to find and avoid overcrowded screens.
- Use professional forms, dropdowns, date pickers, dialogs, and confirmation messages.
- Provide helpful empty states, loading indicators, success notifications, and error handling.
- Ensure all screens work correctly on desktop, tablet, and mobile.
- Support natural Arabic and English text and complete RTL/LTR layout switching.

## 6. Data Integrity and Permissions
- Ensure employees are associated with the correct company and organization.
- Prevent duplicate employee IDs and accidental duplicate accounts.
- Validate relationships between organizations, companies, employees, and user accounts.
- Enforce permissions on the backend as well as in the interface.
- Prevent unauthorized users from accessing, editing, printing, or exporting restricted information.
- Preserve existing records and business rules.
- Ensure edits are saved to the database and reflected consistently throughout the application.

## 7. Testing and Completion
After implementation:
1. Test opening an organization and selecting each company.
2. Verify that the correct employee list and profiles appear.
3. Test creating, editing, saving, and deleting records according to permissions.
4. Verify employee account creation and unique ID generation.
5. Test printing and PDF export with both short and multi-page reports.
6. Test Arabic and English layouts.
7. Check all buttons, navigation, validation, and database operations.
8. Fix any bugs or layout issues introduced by the changes.
9. Record completed changes and remaining issues in `CHANGELOG.md`.

## Final Objective
Transform the Organization section into a complete, reliable, professional management workspace where selecting a company gives authorized users full visibility and control over its staff and records, with easy editing and high-quality printing and PDF export.

**Implement the changes directly in the existing Stockrant application. Reuse and improve the current architecture, preserve working functionality, and verify the actual results before declaring the task complete.**