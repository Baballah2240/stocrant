# Mobile and website release files

The website and Capacitor app share `src/`. Push their changes together to the existing Stocrant repository; do not maintain a separate copy of the application.

- `UPDATES.md`: tracked mobile update history, changed alongside the website.
- `releases/`: ignored local APKs and `latest.json` with the packaging commit, packaging time and SHA-256 checksum. The exact source commit is also recorded for CI builds; it is unknown for older local APKs without embedded build metadata.
- `npm run mobile:save`: save the latest compiled Android APK here. Build first with the existing mobile build command.
- GitHub **Verify STOCRANT** workflow: checks the application, uploads its website build, builds Android from the same commit and uploads the APK with its manifest. Find downloads under the workflow run's **Artifacts** section. Failed checks prevent the Android job from running.

For GitHub mobile builds, optionally set the repository variable `STOCRANT_API_URL` to your deployed HTTPS API origin. Without it, configure the server using the app's existing server settings. The website build retains same-origin API behavior.

Pushing source does not deploy a hosting provider or automatically install an app on phones. No hosting deployment is configured by this workflow. CI APKs are debug/testing builds; stable release signing must be configured before distributing seamless in-place production updates. Never uninstall an existing app merely to bypass a signing mismatch.
