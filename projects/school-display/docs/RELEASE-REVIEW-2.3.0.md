# Qatar School Time Table 2.3.0 - release review

Reviewed on 28 October 2026. Scope: the independent `projects/school-display` application. Stocrant and its mobile app were not changed.

## Release decision

Prepared and verified for a supervised **local Windows school pilot**. The installer and portable package were built, and the packaged application passed native checks in a fresh isolated profile. The installed application and its existing school data were not replaced.

Broad customer distribution still requires publisher signing, acceptance on the school's actual hardware and an installation/upgrade pilot. Public HTTPS hosting and update hosting are not activated. Building packages or pushing source does not deploy a server or install an update.

## Changes and cleanup

- Added **Quick tour / جولة سريعة** in the header for every signed-in role. Administrators get seven steps, coordinators four and teachers three. The accessible modal supports Back/Next/Finish, Escape, focus restoration, Arabic RTL and small screens. Opening a section is explicit; the tour never writes or publishes data.
- Protected unsaved forms and photo changes when navigating, changing language or leaving the page. The tour can be read without discarding work; save changes before opening another section.
- Fixed **Upcoming today** showing normal weekly lessons on holidays and replacement days. It now uses the same effective published timetable and school timezone as the classroom display.
- Consolidated duplicated school/activity photo-upload handlers, including file validation, upload tracking, reset behavior and unsaved-change notifications.
- Reduced remote snapshot disk writes: unchanged polls refresh live synchronization status, while the persisted sync timestamp is checkpointed at most once per minute. Changed content is saved immediately. Native screen settings are reapplied only when needed. HTTP error bodies are cancelled and repeated revocations do not repeatedly reconfigure screens.
- Replaced the old presentation with a four-page Arabic/English manager presentation and added a bilingual quick start. Corrected outdated documentation about lesson clock mode, photo access and the stable Windows data folder.
- Added the tour regression suite and included all nine browser suites in the school Windows CI workflow.

## Verification completed

| Check | Result |
| --- | --- |
| JavaScript syntax | 53 source, build and test files passed `node --check` |
| Unit/integration tests | 30 passed with `npm test` |
| Browser suites | All nine passed: browser, glass, moments, adjustments, workspace, remote, background, lessons, tour |
| Responsive and language checks | 1920x1080, 1366x768 and smaller viewports; Arabic RTL/English LTR; tour focus, Escape and reopening |
| Glass interaction | Hover activation measured at 521 ms; early-exit cancellation, touch and reduced motion passed |
| Security regressions | Role permissions, teacher class isolation, display revocation, authenticated publishing/exit, protected uploads and backup restore passed |
| Dependency audit | `npm audit --json`: zero known advisories reported on the review date; dependencies unchanged |
| Windows packaging | NSIS installer and portable x64 build completed for 2.3.0 |
| Packaged source | All 42 desktop/server/shared/web/asset files match source; product, version, entry point and dependencies verified |
| Native packaged smoke | Passed with a fresh temporary profile; existing installation untouched |
| Presentation PDF | Four pages rendered and visually reviewed; Arabic and English text, page numbers and spacing checked |
| Patch hygiene | `git diff --check` passed; no runtime data, credentials or Windows executables added to source control |

Native checks covered click-through/focus behavior, always-on-top, the 500 ms hover delay, adjusted bounds, background mode, full-screen exit and compact return, idle clock, administrator controls above a full-screen view, classroom screen assignment, remote synchronization, lesson countdown/clock/finish flow and password-authorized exit. Evidence and screenshots remain in the ignored `.qa/` directory, including `release-2.3.0-native.json`.

## Remaining release requirements

1. **Publisher identity:** the current artifacts are unsigned (`Get-AuthenticodeSignature`: `NotSigned`). Configure the publisher certificate using the existing signed-build configuration and verify the resulting signatures before broad distribution. Do not disable school security controls to install the app.
2. **School acceptance:** pilot one real classroom. Verify visibility with teaching apps, projector/DPI settings, sound, sleep/resume, monitor reconnect, Windows startup and the school's actual timetable/timezone.
3. **Installation and upgrade:** back up the school data, close the old app using authenticated Protected controls, then install 2.3.0. Verify existing accounts, timetable and startup behavior after restarting Windows. This real installation and upgrade were not performed during the isolated packaged smoke test.
4. **Optional online operation:** configure a separate school HTTPS service, DNS, certificates, durable storage and backups; verify remote enrollment, class scope, offline operation and revocation against the live service. Hosting remains deferred. Use a separate service/data directory for each independent school; multi-school tenancy is not implemented.
5. **Optional automatic updates:** configure the trusted HTTPS update feed and signed packages. Until then, distribute approved updates manually. Fresh installations have their own accounts; timetable exports deliberately exclude passwords and display tokens.

## Files changed

- `web/app.js`, `web/index.html`, `web/i18n.js`: tour entry point, navigation safety, published-day dashboard fix and translations.
- `web/tour.js`, `web/tour.css`: isolated tour logic, bilingual guidance and responsive styling.
- `web/lesson-options.js`: shared photo controls and reset behavior.
- `server/server.mjs`, `server/remote.mjs`: tour asset routes and synchronization cleanup.
- `tests/tour.mjs`, `tests/remote.test.mjs`: tour, safety, calendar accuracy and remote polling regression coverage.
- `package.json`, `package-lock.json`, `.github/workflows/school-display.yml`: version 2.3.0 and release checks.
- `README.md`, `docs/QUICK-START-AR-EN.md`, this review, the presentation HTML/builder and the PDF: delivery and user documentation. The superseded presentation files were removed.

## Build outputs

Generated under `releases/`, outside Git: `Qatar-School-Time-Table-Setup-2.3.0-x64.exe`, `Qatar-School-Time-Table-Portable-2.3.0-x64.exe`, `build-manifest.json` and `SHA256SUMS.txt`. The manifest records the source commit and artifact checksums. The source commit and GitHub push outcome are reported separately at handover.

The manager presentation is `output/pdf/Qatar-School-Time-Table-Presentation-AR-EN.pdf`. Rebuild it with `node docs/build-presentation.mjs` and visually inspect all pages after edits.
