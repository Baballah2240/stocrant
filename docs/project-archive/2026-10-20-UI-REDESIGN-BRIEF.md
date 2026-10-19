# Stocrant Management System — Complete UI/UX Redesign

Act as a senior UI/UX designer and frontend engineer. Improve the entire existing **Stocrant Management System** to make it modern, professional, responsive, and enterprise-ready.

This is an existing management application. First inspect the current codebase, architecture, modules, dashboards, and existing functionality. Do not rebuild the project from scratch.

## 1. Improve the Main Manager Dashboard

Redesign the Main Manager Dashboard with a clean, professional management interface.

- Organize important information into a clear visual hierarchy.
- Improve KPI cards, charts, statistics, reports, notifications, and recent activities based on existing features.
- Display relevant management information, such as employees, attendance, operational performance, inventory, financial information, and pending tasks only where those modules already exist.
- Use professional typography, consistent spacing, clean icons, subtle shadows, and balanced layouts.
- Make important information easy to understand at a glance.
- Eliminate clutter, oversized cards, inconsistent spacing, and unnecessary empty areas.
- Ensure all statistics use real application data.

## 2. Redesign All Dashboards Across Stocrant

Improve every existing dashboard and page throughout the entire Stocrant project, not just the Main Manager Dashboard.

Inspect and improve all available modules, including HR, employee management, attendance, leave management, payroll, inventory, finance, reports, user management, and other sections actually present in the project.

For each module:
- Create a dashboard layout suited to its purpose.
- Display relevant statistics and summaries.
- Improve tables, charts, filters, forms, and action buttons.
- Add useful quick actions and recent activity panels where appropriate.
- Keep the visual style consistent across the application.
- Preserve all existing features and permissions.

## 3. Complete Arabic and English Language Support

Implement a complete multilingual experience throughout Stocrant.

**English**
- Use left-to-right (LTR) layout.
- Ensure correct alignment of navigation, text, icons, tables, and forms.

**Arabic**
- Use right-to-left (RTL) layout across the entire application.
- Correctly reposition the sidebar, navigation, page headers, forms, tables, dropdowns, and modal dialogs.
- Use suitable Arabic typography.
- Correctly handle directional icons, pagination, charts, and navigation controls.

Add a clear language selector in the header or settings.

Translate all user-facing text, including:
- Dashboard headings and KPI labels
- Sidebar menus and navigation
- Buttons, dropdowns, and form labels
- Tables, filters, and status indicators
- Notifications, alerts, and validation messages
- Settings, reports, and error messages

Use a consistent translation system and remove hardcoded interface text where practical. Switching languages must update the entire application without unnecessarily reloading the page.

Preserve any additional languages already supported.

## 4. Morning Theme — Light Mode

Create a premium daytime interface with:
- Clean, light backgrounds.
- White or subtly tinted cards.
- Readable text and clear visual hierarchy.
- Professional accent colors.
- Soft borders and subtle shadows.
- Consistent styling for tables, charts, forms, dropdowns, and dialogs.

Keep the interface comfortable for long working hours and avoid excessive brightness or visual clutter.

## 5. Night Theme — Dark Mode

Create a complete, polished nighttime interface with:
- Deep charcoal or slate backgrounds.
- Clearly differentiated card and panel surfaces.
- Readable text with accessible contrast.
- Theme-appropriate charts, tables, forms, menus, and dialogs.
- Clearly visible buttons, selected items, notifications, and status indicators.
- Consistent hover, focus, disabled, and error states.

Ensure every page and component supports dark mode. No component should retain an unintended white background or become difficult to read.

## 6. Theme Selector

Add three theme options:
- Morning — Light Mode
- Night — Dark Mode
- System — Follow operating system preferences

Requirements:
- Switch themes immediately.
- Use suitable sun and moon icons.
- Remember the user's preference across navigation and subsequent visits.
- Apply the selected theme early to prevent flashing on page load.
- Follow system theme changes when System mode is selected.
- Keep theme selection independent of language selection.

## 7. Language and Theme Compatibility

Verify these four combinations:

1. English + Morning Theme
2. English + Night Theme
3. Arabic + Morning Theme
4. Arabic + Night Theme

Test each combination across every dashboard and module. Ensure RTL/LTR direction, spacing, charts, buttons, menus, tables, and modal dialogs remain correct.

Changing the language must not reset the theme. Changing the theme must not reset the language.

## 8. Shared Layout and Navigation

Improve the common layout used throughout Stocrant.

- Refine the header, sidebar, content area, page titles, breadcrumbs, and toolbars.
- Clearly highlight the active sidebar section.
- Preserve existing navigation behavior and hover interactions.
- Keep menus and submenus aligned correctly.
- Support sidebar expansion, collapse, and overlay behavior where already implemented.
- Ensure the active menu item corresponds to the displayed page.
- Maintain a consistent layout across all modules.
- Make navigation responsive and fully compatible with Arabic RTL and English LTR.

## 9. Tables, Forms, and Interactive Elements

Standardize all existing interface components.

- Tables: improve column spacing, row heights, headers, search, sorting, filtering, and pagination.
- Forms: improve field alignment, labels, validation, and grouping.
- Dropdowns: improve readability, positioning, and interaction.
- Buttons: standardize primary, secondary, success, warning, and destructive styles.
- Notifications: improve visibility and placement.
- Charts: improve readability and compatibility with both themes.
- Modals: ensure proper alignment, spacing, and responsive sizing.

Keep all existing buttons, links, dropdowns, and actions functional.

## 10. Preserve Existing Functionality

This is a management system, not a new application.

- Preserve existing business logic, authentication, authorization, user roles, permissions, routing, APIs, and database integrations.
- Do not invent modules that do not exist.
- Do not replace real data with hardcoded demo statistics.
- Do not remove existing functionality to simplify the interface.
- Do not expose restricted information to unauthorized users.
- Reuse existing components and libraries wherever possible.
- Avoid unnecessary dependencies and unrelated code changes.

## 11. Implementation and Testing

1. Inspect the existing project and identify all dashboards, layouts, and shared components.
2. Establish a consistent design system.
3. Improve the shared layout and navigation.
4. Redesign the Main Manager Dashboard.
5. Apply the improvements to every remaining dashboard and module.
6. Implement or fix Arabic/English translations and RTL/LTR support.
7. Implement or fix Morning, Night, and System themes.
8. Test all four language/theme combinations.
9. Verify all existing interactions, permissions, and data displays.
10. Run the available build and lint commands and fix errors caused by the changes.
11. Review desktop, tablet, and mobile layouts.
12. Provide a summary of completed work, changed files, and remaining issues.

Work in manageable stages if necessary, but do not stop after redesigning the main dashboard.

## Final Goal

Transform Stocrant into a polished, professional management system with a beautiful Main Manager Dashboard, consistently designed dashboards throughout the project, complete Arabic and English support, correct RTL/LTR behavior, and reliable Morning, Night, and System themes.

**Inspect first, improve the existing application, preserve its functionality, implement the changes across the entire project, and verify the results.**