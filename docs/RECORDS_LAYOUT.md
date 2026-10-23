# Workspace record lists and navigation

Employee and generic record lists now use compact desktop rows with clearer names, status badges and an **Open** link. The adjacent three-dot menu contains the permitted Open/Edit/Delete actions. Deletion still requires confirmation, and a record awaiting approval remains visible. Menu placement stays within the viewport; arrow/Home/End keys navigate, Escape restores trigger focus, and outside clicks, scrolling or resizing close the menu.

The toolbar groups search, status and sort controls. Lists show up to 20 records per page and reset pagination when filters change. Search and status filtering remain inside the server-supplied account/company scope. Sorting and pagination affect display; exports retain their existing server permission and scope rules.

At phone widths, table rows become labeled cards. Arabic uses logical spacing and right-to-left controls, while employee codes keep a readable left-to-right direction. Desktop navigation groups the existing links into Workspace, People & operations, Finance and Settings without changing their routes or permission checks. Tablet navigation keeps horizontal scrolling; mobile drawer and bottom-navigation behavior remain.

Run `npm run test:records-layout` for isolated browser checks: 23 employees, paging, search/status/name sorting, compact row heights, keyboard/menu focus, outside dismissal, edit navigation, a simulated pending-deletion approval, bounded menus, five English/Arabic light/dark desktop/tablet/phone layouts, and an employee account without management actions. Screenshots stay in ignored `.local-preview/qa/records-layout/`.

These shared source changes do not rebuild or install a native app, and pushing them to GitHub does not confirm Render deployment.
