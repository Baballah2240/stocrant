# Approved mobile releases

The shared web/Android/iOS interface now has an authenticated `/app-update` page. It displays only releases currently approved by the platform Super Admin. Before approval there is no user-facing version or download link.

## Publish a release

1. Build, test and sign the actual mobile artifact. For Android, save the build and manifest with `npm run mobile:save` after building.
2. Upload the Android APK to a trusted HTTPS download host, or use an iOS App Store/TestFlight distribution link. This feature does not upload, sign or automatically install binaries.
3. Open **Settings → Mobile app** as Super Admin. Register the platform, version, monotonically increasing build number, release notes, HTTPS link and the actual build artifact’s SHA-256 checksum.
4. Saving creates a draft. It produces no notification and exposes no download details to ordinary users.
5. **Approve and notify users** explicitly approves it and creates one notification per active account. The notification’s detail action opens the approved update page.
6. Users see the version, build, release notes, checksum and **Download app** button. Android opens the download through the native external-browser handler. The browser version navigates to the approved HTTPS link. Native installed-version metadata is displayed where the Capacitor App plugin is available.

## Withdrawal and security

- Only the Super Admin manages releases; general approval permissions do not grant this authority.
- Publishing a newer build supersedes the older approved build on that platform.
- Withdrawn/superseded versions are excluded from the available endpoint and lose their notification detail action. Historical notification text remains in the inbox as an audit of the previously approved announcement.
- Each click rechecks the current approved release list before opening a link. Files already downloaded, saved external links and a download already underway cannot be revoked by the application.
- Version checks reject duplicate decisions and stale requests; build numbers prevent downgrade approval.
- Release metadata is immutable: corrections require a new draft with a new build number. All decisions use the existing audit log.
- Approval means the Super Admin reviewed the provided metadata. The server does not fetch, scan, sign or verify the remote file. The checksum must come from the actual tested build; test links are not published to real users.
- This update itself does not publish or approve a live release. Existing bundled mobile applications need a new native build/install before their frontend can display the new update page.
- iOS native builds and distribution require macOS/Xcode and the organization’s Apple signing/distribution setup. They have not been verified on an iPhone here.

## Branding dependency

The requested cyan interlocking S logo reference was not attached in the received message. The existing checked-in brand icon is a ledger mark and cannot serve as that reference. To avoid substituting a guessed shape, the requested three SVGs, path-based wordmark, launcher/adaptive icons, favicon, splash and sign-in/sidebar branding changes are pending the image being attached again. No placeholder S or unrelated logo has replaced production assets.

## Validation

Server tests cover draft privacy, unauthenticated access, Super Admin approval, checksum/link validation, duplicate builds, stale/duplicate approvals, one notification per user, withdrawal, notification link revocation and downgrade rejection. `npm run check` passed, including 277 server tests and production smoke checks. `node scripts/verify-app-releases.mjs` passed 24 user/admin layouts across English/Arabic, light/dark themes and 1366/390/320px widths. Browser checks also exercised actual UI approval, hidden draft metadata and an old open download page after withdrawal. All release records and notifications used isolated test fixtures; none were published to live users.
