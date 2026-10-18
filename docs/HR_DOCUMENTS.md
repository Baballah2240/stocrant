# HR documents

The existing `documents` collection now supports employee records and general company files. Open **HR → Documents** or an employee profile's Documents section. No duplicate employee or document tables are created.

## Implementation map

| Area | Files |
| --- | --- |
| Document UI and uploads | `src/components/DocumentsWorkspace.tsx`, `src/document-api.ts`, `src/documents-workspace.css` |
| Employee/HR/mobile integration | `src/App.tsx`, `src/components/EntityDetail.tsx`, `src/components/HRWorkspace.tsx`, `src/components/MobilePeople.tsx`, `src/components/ChoiceSelect.tsx` |
| Backend, storage and migration | `server/routes/documents.ts`, `server/documents.ts`, `server/document-files.ts`, `server/document-model.ts`, `server/storage.ts` |
| Scope and existing API integration | `server/app.ts`, `server/routes/workspace.ts`, `server/workspace.ts`, `server/organization-policy.ts`, `server/registry.ts` |
| Expiry/UI integration and configuration | `server/index.ts`, notification types, `src/components/NotificationBell.tsx`, `src/document-translations.ts`, `src/translations.ts`, `.env.example` |
| Verification | `server/documents.test.ts`, `server/routes.test.ts`, `scripts/verify-hr-documents.mjs`, `scripts/browser-qa.mjs`, `package.json` |

## Workflow and permissions

- Choose category and company; employee documents require an existing employee from that company. Company files have no employee association. The organization is derived from the company's parent and can be used as a library filter.
- Upload one attachment, provide an authorized HTTPS external link, or both. Files can be selected or dropped, replaced before submission, and retried after recoverable metadata errors without uploading again.
- Existing metadata can be edited without replacing its attachment. Optimistic versions reject stale saves. A document with attachment history cannot be reassigned to another employee or company: archive it and create a new record instead. Employees with retained documents cannot be deleted or moved between companies through generic CRUD.
- Main Admin has full access. Scoped HR users need `hr.view` plus the relevant `hr.create`, `hr.edit`, or `hr.delete` permission. Own-record users cannot manage the document library. Read-only confidential HR access can be assigned through the existing role permission `hr.personal.view` together with `hr.view`.
- Default visibility is HR only. Employee sharing allows the linked employee, with HR view permission, to access their own record; it never shares another employee's documents. Company-wide visibility is available only for company files and still requires company scope and HR view permission.
- Downloads and previews recheck current authentication, document visibility and scope. Historical files require HR management access. Upload permission is checked again after streaming, so a suspended session cannot complete an upload.
- Archive retains metadata, attachments and audit history. Restore is supported. Physical deletion is available only for the uploader's unclaimed drafts; linked or historical attachments cannot be removed this way. Unattached uploads can be reviewed and removed in the library.
- Existing HR create/edit/delete approval rules are honored. A required change stays pending without modifying the document. Its attachment is reserved privately until a different authorized approver reviews it. The Documents library and Access → Approvals provide a review page with metadata, attachment download, review notes and approve/reject actions. A finance-only approver cannot view or decide these HR requests. Requests revalidate the original user's active account, current scope and document version before applying. Rejected unclaimed uploads can be removed by their owner.

## Private storage and migration

Metadata stays in `<STOCRANT_DATA_DIR>/data/stocrant.json` (or the existing application `data` directory when the variable is unset). Binary attachments are separate files in the same data directory's `private-documents` subdirectory; bytes are never embedded in JSON. Stored filenames are generated UUIDs, independent of uploaded filenames. A failed database write during draft removal restores the staged file.

The additive document migration resolves only unambiguous employee relationships, defaults confidential legacy records to HR-only access, and retains original links, titles and fields. Unassigned or ambiguous legacy records remain available to Main Admin for review. Existing on-disk data is backed up before the migration to `stocrant.pre-documents-v4-backup.json`; invalid document collections fail without being replaced.

**Back up and restore the entire data directory, including `private-documents` and JSON together.** Existing daily JSON snapshots do not copy attachment bytes. Previous attachments are retained, so restoring an older JSON snapshot works only while the corresponding private files are also available. Keep the directory off every web/static server and use a persistent volume. The existing deployment remains single-instance JSON storage.

## Configuration

Set environment variables through the existing deployment environment. No storage credentials are required for this local private-disk implementation.

| Variable | Default | Behavior |
| --- | --- | --- |
| `STOCRANT_DOCUMENT_MAX_BYTES` | `10485760` | Upload size in bytes, capped at 25 MiB per file. Match proxy limits accordingly. |
| `STOCRANT_DOCUMENT_TYPES` | `pdf,doc,docx,xls,xlsx,jpg,jpeg,png` | Comma-separated allowlist, restricted to the supported formats. |
| `STOCRANT_DOCUMENT_WARNING_DAYS` | `30` | Default warning window. Per-document values from 1–365 days are stored; the form offers 30/60/90 days and the configured/current value. |
| `STOCRANT_TIME_ZONE` | `Asia/Qatar` | Business date used for expiry boundaries. |

Uploads check size, extension and content signatures. Office ZIP packages are checked for expected entries, dangerous filenames, macro/script entries and excessive declared expansion. No archive is extracted. Downloads use authenticated endpoints, private/no-store cache policy, attachment headers and MIME sniffing protection.

**This is not an antivirus or content-disarm engine.** Deployers handling untrusted incoming documents should add a malware scanning gateway/approved scanning service and apply their retention and at-rest encryption policies. No scanner credentials or external integrations are invented. Office formats download for viewing in a suitable application; images preview in-app and PDF preview depends on browser support, with download available. Stocrant cannot enforce permissions on external HTTPS sites; users must only supply links they are authorized to share.

## Expiry and history

- Valid expiry dates show Active, Expiring Soon, Expired or No Expiry; invalid legacy dates show Date unavailable. A document remains valid through its expiry day in the business timezone.
- Main HR and library screens show scoped totals and expiry summaries. Saved edits and library refreshes scan expiry; the normal server entry point also scans at startup and every six hours.
- Notification events are deduplicated by document, expiry date, event state and recipient. Only active authorized accounts receive in-app reminders. Messages omit document titles, numbers and employee names. No emails, WhatsApp messages or other external messages are sent.
- Uploads, creation, edits, access changes, replacement, preview, download, archive and restore are audited. Previous file references remain in version history.

## Verification

- `npm run check`: both TypeScript checks, API integration tests including private-document tests, storage verification, lock/activity/translation tests, production frontend build and production smoke checks.
- `npm run test:hr-documents`: builds and runs isolated headless Chrome tests. Set `CHROME_EXE` if Chrome is installed elsewhere. The browser must be permitted to launch its renderer.
- Browser verification covers real upload, employee preselection/search, recoverable metadata errors preserving an uploaded draft, language changes retaining inputs, download, image preview, employee-profile documents, searching, pagination, mobile layout and Arabic dark mode.
- Browser verification also covers metadata-only editing, file replacement and version history, confirmed archive/restore, and reviewing/approving a pending HR document change.
- Automated exercises use temporary data and generated credentials, never the user's real business records. Real production data, Office desktop applications, backup infrastructure and malware scanning require deployment-specific checks.
