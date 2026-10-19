# Mobile and website updates

- Website and mobile share `src/`; keep both in this repository.
- For changes affecting the mobile app, update `mobile/UPDATES.md` in the same source commit as the website changes.
- Build/synchronize the native app when requested. After an Android build, run `npm run mobile:save` to put the APK and its checksum/build manifest in `mobile/releases/`.
- Generated APKs, signing material, runtime data and credentials must stay out of source control. GitHub Actions publishes build artifacts instead.
- Do not claim that a GitHub push deploys hosting or installs an update on a phone. Verify those actions separately when configured and authorized.
