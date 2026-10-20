# Stocrant Management System — Complete Dashboard & Company Management UI/UX Upgrade

Act as a senior full-stack developer, UI/UX designer, and software architect. Upgrade the existing **Stocrant Management System** into a modern, professional, responsive, interactive business management platform.

**Important:** Stocrant is a general management application, not a restaurant application. Do not introduce restaurant-specific features unless they already exist in the project.

Before making changes, inspect the entire existing project, identify the framework, routing, component structure, authentication, database, APIs, roles, permissions, and existing design system. Preserve working functionality and existing business logic. Do not rebuild the application from scratch or replace real data with mock data.

## 1. Redesign the Company Details Page

Improve the company details page shown in the reference screenshot. Replace the current plain, vertically stacked information layout with a polished, organized company management workspace.

### Company overview
Create a professional company profile header containing:
- Company logo or initials avatar.
- Company name and trading name.
- Company ID and organization ID.
- Organization type and business classification.
- Registration and licensing information, if supported by the existing data model.
- Company status with a clear status badge.
- Creation date and last updated date, when available.
- A prominent Edit Company button.
- Contextual actions such as View Employees, View Managers, Manage Departments, and More Actions, according to permissions.

### Company information layout
Organize information into clean cards, sections, tabs, or a responsive grid rather than one long page.

Create the following tabs where applicable:
1. Overview.
2. Company Information.
3. Employees.
4. Managers.
5. Departments and Sections.
6. Roles and Permissions.
7. Documents.
8. Activity History.

Only implement tabs supported by the existing application or data model. If a feature is missing, integrate it with the existing architecture instead of creating disconnected, nonfunctional UI.

### Direct editing
Allow authorized users to edit company information directly from the page.

- Add inline editing for suitable fields.
- Use appropriate text inputs, dropdowns, date pickers, and searchable selectors.
- Include Save and Cancel actions.
- Validate required fields and prevent invalid submissions.
- Display loading, success, validation, and error states.
- Save changes through the existing backend or API.
- Update the displayed information immediately after a successful save.
- Avoid unnecessary full-page reloads.
- Ask for confirmation before destructive operations.

Do not expose internal database IDs or technical organization identifiers as the primary user-facing information. Place technical identifiers in a clearly labeled expandable section when necessary.

## 2. Company Employees and Managers

Create a professional, interactive employee and manager management interface within each company profile.

### Employee table
Display employees in a searchable, sortable, filterable table with:
- Employee photo or initials.
- Employee name and ID.
- Job title.
- Department and section.
- Manager or supervisor.
- Email and phone, when available and authorized.
- Employment status.
- Joining date.
- Available actions.

Include:
- Search by name or employee ID.
- Filters for department, section, manager, status, and job title.
- Pagination and adjustable page size.
- Column sorting.
- Column visibility controls where practical.
- Row selection and bulk actions when authorized.
- Export functionality only if supported by the application.

Clicking an employee should open a detailed profile or side panel. Allow permitted users to edit the employee's details without navigating through unnecessary pages.

### Managers
Create a dedicated managers view showing:
- Manager profile and contact details.
- Assigned department and sections.
- Number of employees supervised.
- Reporting relationships.
- Current workload or relevant performance metrics, if available.
- Quick actions to view the manager's dashboard or edit their assignments.

Allow authorized administrators to assign or reassign managers using searchable dropdowns. Prevent invalid reporting relationships and circular management hierarchies.

### Departments and sections
Display the company's organizational structure in a clear hierarchy:

Company → Departments → Sections → Managers → Employees.

Allow authorized users to create, edit, assign, move, and deactivate departments or sections where supported. Clearly display each section's manager, employee count, and relevant operational indicators.

When selecting a department or section, open its dedicated dashboard with the information and actions available to the current user.

## 3. Upgrade the Main Administrator Dashboard

Redesign the main administrator dashboard as a comprehensive overview of the entire Stocrant system.

### Dashboard summary cards
Display relevant metrics based on actual available data, such as:
- Total companies.
- Active and inactive companies.
- Total employees.
- Total managers.
- Departments and sections.
- Pending approvals and requests.
- Unread notifications.
- Recent system activities.

Each card should have a clear label, useful value, optional comparison with a previous period, and a meaningful icon.

Clicking a card should navigate to the corresponding filtered list or management page.

### Dashboard sections
Include:
- Key performance indicators.
- Company and workforce statistics.
- Recent activity feed.
- Pending tasks and approvals.
- Employee and manager summaries.
- Important announcements.
- System alerts and exceptions.
- Quick actions for frequently used administrative tasks.

Allow administrators to rearrange, hide, or show dashboard widgets when practical. Persist personal dashboard preferences using the existing backend or a suitable existing preferences mechanism.

Keep the dashboard clean and useful. Avoid excessive cards, unnecessary decoration, and overwhelming amounts of information.

## 4. Upgrade All Manager Dashboards

Apply a consistent dashboard system to every manager role in the application.

Each manager must see only the companies, departments, sections, employees, and data they are authorized to access.

Provide relevant widgets for:
- Team size and employee distribution.
- Attendance and leave, if those modules exist.
- Pending requests and approvals.
- Department or section performance.
- Tasks and deadlines.
- Recent team activity.
- Important announcements.
- Relevant operational metrics and trends.

Make all cards, tables, filters, and charts interactive. Clicking a metric should open its corresponding detail view.

Different manager roles may have different widgets and permissions. Do not give all managers unrestricted access to company-wide or administrator-only information.

## 5. Upgrade All User Dashboards

Provide a personalized dashboard for ordinary users based on their role and permissions.

Include relevant information such as:
- Personal profile and employment details.
- Assigned department and section.
- Direct manager information.
- Personal tasks and deadlines.
- Requests and their current statuses.
- Notifications and announcements.
- Relevant personal statistics.
- Quick links to permitted features.

Only show modules that the signed-in user can access. Hide unauthorized actions and enforce permissions on the backend as well as the frontend.

## 6. Professional Notification Panel

Redesign the notification system into a modern, detailed notification center accessible from the application header and relevant dashboards.

### Notification interface
Include:
- Notification bell with an accurate unread count.
- Recent notifications in a dropdown or side panel.
- A full notification center for browsing notification history.
- Tabs or filters for All, Unread, Read, and relevant categories.
- Search and date filtering when appropriate.
- Mark as read and mark all as read.
- Clear or archive actions where supported.
- Pagination or lazy loading for older notifications.

### Notification details
Each notification should display:
- Notification title.
- Clear and informative message.
- Category and priority.
- Sender or originating department, when available.
- Related company, employee, department, or request.
- Creation date and time.
- Read or unread status.
- Related action or destination.
- Relevant due date or deadline, if applicable.

Use clear visual distinctions for informational notices, reminders, approvals, warnings, and critical alerts. Avoid excessive animations and overly bright colors.

### Interactive behavior
- Clicking a notification opens the relevant record or task.
- Update unread counts after notifications are read.
- Support real-time updates using the existing infrastructure where available.
- Provide loading, empty, error, and offline states.
- Prevent duplicate notifications when possible.
- Respect user permissions and avoid exposing confidential information.

Use actual notification records and backend APIs. Do not simulate real-time notifications with fake data.

## 7. Interactive Charts and Analytics

Build a reusable chart and analytics system for the administrator, managers, and users.

### Available chart types
Support appropriate chart types based on the selected data:
- Line charts for trends over time.
- Bar charts for comparing departments, companies, or categories.
- Stacked bar charts for comparing status distributions.
- Doughnut or pie charts for proportions.
- Area charts for cumulative or time-series data.
- KPI cards with trend indicators.
- Tables for precise values and detailed breakdowns.

Use the charting library already installed in the project. If none exists, select a suitable lightweight library compatible with the current framework.

### User-selectable charts
Allow users to customize analytics widgets through a simple interface.

Provide controls to:
- Choose a metric.
- Select a chart type.
- Choose a time range: 7 days, 30 days, 90 days, this year, or a custom range when supported.
- Filter by company, department, section, manager, or status when authorized.
- Group data by day, week, month, or category when appropriate.
- Show or hide chart legends and data labels where practical.
- Switch between chart and table views.
- Reset chart settings.

The available metrics and filters must depend on the user's role and the data actually available to them.

### Useful chart examples
Administrator:
- Employee count by company.
- Employee distribution by department.
- Active versus inactive companies.
- Workforce growth over time.
- Requests and approvals by status.
- Notifications and activity trends.

Managers:
- Employees by section.
- Team attendance trends, if attendance data exists.
- Leave requests by status, if leave management exists.
- Task completion trends, if task data exists.
- Department performance indicators, if supported.

Users:
- Personal task completion.
- Personal attendance history, if available.
- Personal requests by status.
- Other relevant personal statistics supported by existing modules.

Do not display metrics that cannot be calculated reliably from existing data.

### Chart behavior and accessibility
- Charts must update when the user changes filters or date ranges.
- Use real API/database data.
- Provide tooltips with meaningful labels and values.
- Include legends where necessary.
- Display appropriate empty states when no data is available.
- Provide accessible labels and a table alternative for chart data.
- Use readable typography and responsive sizing.
- Avoid misleading scales or visualizations.
- Ensure charts work in both light and dark themes.

Persist chart selections and dashboard layout preferences when practical.

## 8. Global Design System

Apply the improvements consistently across the entire application, not only the company details page.

### Visual direction
Use a premium, modern enterprise interface inspired by high-quality business management platforms.

- Clean layouts with consistent spacing.
- Professional typography and clear visual hierarchy.
- Carefully designed cards and data tables.
- Subtle borders and shadows.
- Consistent corner radii.
- Restrained, accessible accent colors.
- Clear primary, secondary, and destructive actions.
- Consistent icons and button sizes.
- Helpful empty states and loading skeletons.
- Responsive layouts for desktop, tablet, and mobile.

Improve the sidebar, top navigation, page headers, breadcrumbs, forms, tables, dropdowns, dialogs, and notifications across all modules.

Do not rely on giant blank areas, oversized headings, or excessively tall information cards.

### Light and dark themes
Implement a complete light and dark theme throughout the application.

- Add a theme toggle in a convenient location.
- Apply themes consistently to pages, sidebars, dialogs, tables, forms, notifications, charts, and dropdowns.
- Use appropriate text contrast and accessible colors.
- Persist the user's selected theme.
- Avoid hardcoded colors that break in dark mode.
- Prevent flashing between themes during page loading when possible.

### Language and localization
Improve the language system across the entire application.

- Support all languages already present in the project.
- Ensure every visible label, button, tooltip, notification, table heading, form validation message, and chart label uses the translation system.
- Remove hardcoded strings from components where localization is supported.
- Support Arabic RTL and English LTR layouts correctly.
- Ensure sidebar positioning, icons, tables, forms, and charts adapt correctly to RTL.
- Format dates, numbers, and currencies according to the selected locale.
- Persist the selected language according to the existing application architecture.

Do not merely translate headings while leaving actions, notifications, and chart labels in the wrong language.

## 9. Permissions, Security, and Data Integrity

Treat authorization as a core requirement.

- Inspect the existing authentication and authorization architecture.
- Reuse the current role and permission system.
- Enforce access control in backend endpoints and database operations.
- Prevent users from editing records outside their authorized scope.
- Validate all changes on the server.
- Avoid exposing sensitive employee information.
- Use safe error messages and proper loading states.
- Record significant administrative changes in the existing audit log system, if available.
- Use soft deletion or the existing safe deletion strategy where appropriate.

Never rely solely on hiding a button to protect a restricted operation.

## 10. Technical Implementation Requirements

- Inspect the entire project before modifying code.
- Reuse existing components, layouts, services, routes, APIs, and design tokens where possible.
- Build reusable components for dashboards, KPI cards, chart widgets, notification panels, editable fields, and data tables.
- Keep components maintainable and avoid unnecessary duplication.
- Use the project's existing framework and coding conventions.
- Avoid changing the database schema unless required; document and implement necessary migrations safely.
- Preserve existing data and working features.
- Do not introduce fake data into production dashboards.
- Do not add unnecessary dependencies.
- Fix broken navigation, missing routes, layout overflow, console errors, and existing UI regressions encountered during implementation.
- Ensure forms and buttons perform their actual intended actions.
- Add appropriate error handling and validation.
- Do not leave placeholder buttons or decorative controls that do nothing.

## 11. Testing and Completion

After implementation:

1. Run the available build, lint, and test commands.
2. Fix errors introduced by the changes.
3. Test administrator, manager, and ordinary-user permissions.
4. Test company editing and employee/manager management.
5. Test notification interactions and unread counts.
6. Test chart filters, date ranges, and chart-type switching.
7. Test Arabic RTL and English LTR.
8. Test light and dark themes.
9. Check responsive behavior and table overflow.
10. Confirm that real data remains intact.

### Final objective

Deliver a coherent, professional, fully interactive management application in which:

- Company information is organized and editable.
- Employees, managers, departments, and sections are easy to manage.
- Every role has a useful, permission-aware dashboard.
- Notifications provide meaningful details and direct actions.
- Charts are interactive, customizable, and based on real data.
- Light/dark themes and multilingual layouts work consistently.
- The entire application feels like one unified, polished enterprise product.

Implement the changes directly in the existing project files. Do not stop after providing a plan or redesigning only the screenshot. Finish the implementation, validate it, and summarize the files changed, features completed, and any remaining limitations.