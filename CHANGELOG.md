# Changelog

## 2026-10-18 — Organization workflow and production hardening

### Organization ownership and access

- Retained the organization-first hierarchy: **Organization → Company → Employee → User**.
- Hardened delegated access so Organization Admins receive company scope only for active companies whose parent organization is active.
- Prevented user assignment, employee assignment, and related-record assignment to inactive companies or companies below inactive organizations.
- Kept deactivated organizations and companies in storage for audit/history while removing them from delegated operational scope.
- Confirmed organization deactivation revokes active delegated sessions.

### UX, language, and documentation

- Preserved the centralized English/Arabic translation system and document-level LTR/RTL switching already used by the application.
- Corrected malformed dash encoding in the README.
- Removed unused frontend localization/permission variables and restored the missing HR activity-date helper import so strict frontend type checking passes.
- No production data, environment files, deployment configuration, migrations, or runtime records were deleted during this change.

### Verification to run before release

- Run `npm run check` in a clean terminal after installing the supported Node.js version.
- Back up `data/stocrant.json` (or Render's persistent-disk data file) before deploying.
- Validate real Main Admin, Organization Admin, Company Manager, English, Arabic/RTL, and mobile workflows in staging before production rollout.