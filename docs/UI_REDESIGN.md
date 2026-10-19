# Shared workspace UI redesign — 2026-10-20

The management application remains in the existing React/Capacitor project. The public marketing site is a separate project and was outside this management-system brief.

## Implementation

- `src/enterprise.css` supplies shared light/dark surfaces, typography, spacing, tables, fields, buttons, tabs, focus states, responsive grids and dialog styling. Existing specialized module layouts and interactions remain available. Logical spacing and the existing RTL layout place Arabic navigation on the right.
- `WorkspaceDashboard.tsx` brings authorized company metrics ahead of personal workday content, with an API-backed workload graphic, attention links and refresh action. The Main Admin sees this dashboard on phones too; employee mobile attendance and self-service routes remain available.
- `Layout.tsx` preserves sidebar collapse, navigation, account drawer, notifications and mobile navigation. Module highlights cover nested HR, payroll, company, inventory and legacy operations paths.
- `theme-context.tsx` keeps effective appearance separate from the saved `light`, `dark` or `system` preference. `AppearanceSelector.tsx` exposes Morning, Night and System in the header, mobile account drawer and authentication screen. System changes are observed while the application is open.
- `public/appearance.js` sets appearance, color scheme, language and direction in the document head before the application paints. Storage failure uses document defaults. Existing light/dark preferences remain compatible.
- Shared and older module screens now use the existing translation context for interface labels, filters, fields, actions, statuses and messages. `redesign-translations.ts` extends the existing dictionaries; metadata labels and enum choices are localized while their saved/API values remain unchanged. Company names, employee names, departments and entered business content remain user data.
- `util.ts` formats dates and relative activity times for the selected language, including future dates.

No backend business calculations, APIs, permissions, authentication, storage schema, records or dependencies were replaced. Dashboard totals continue to come from authorized API responses. No database migration is required.

## Verification

Run `npm run check` for backend/frontend TypeScript, the API/unit suite, storage verification, app-lock and notification tests, translation checks, frontend production build and production security smoke checks. No lint script is configured.

Run `npm run test:redesign` for isolated Chrome verification of 29 routes in English/light, English/dark, Arabic/light and Arabic/dark at 1440, 1024 and 390 pixels (348 route combinations). It also checks finance account-form fit, stable enum values, live System appearance changes, preference independence, persistence and an unsubmitted form surviving a language change. The fixture has its own temporary store; it does not use real business data.

Existing browser regressions additionally cover company profiles and employee creation/activation, payroll generation/independent approval/payment/PDF output, private document upload/replacement/review and HR messaging/acknowledgment. Screenshots can be generated with `STOCRANT_QA_SCREENSHOTS=1`; local QA output stays under ignored `.local-preview/qa/`.

## Archive and delivery

The original request is retained in `docs/project-archive/2026-10-20-UI-REDESIGN-BRIEF.md`. The task log records the outcome and verification. A local source ZIP and SHA-256 checksum can be produced from the committed Git tree without runtime data, signing material, credentials, temporary test profiles or APKs.

The shared mobile source is updated in `mobile/UPDATES.md`. This task does not build or install a native APK. A GitHub push records the source changes; hosting deployment and phone installation require separate verification.

## Practical limits

The route matrix checks fixture states rather than every possible customer dataset or browser/device. User-authored business content is not automatically translated. Native biometric prompts and OS printing require device testing; browser payroll PDF output is covered by the existing workflow.
