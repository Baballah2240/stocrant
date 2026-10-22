# Mobile and website release files

The website and Capacitor app share `src/`. Push their changes together to the existing Stocrant repository; do not maintain a separate copy of the application.

- `UPDATES.md`: tracked mobile update history, changed alongside the website.
- `releases/`: ignored local APKs and `latest.json` with the packaging commit, packaging time and SHA-256 checksum. Clean local and CI packages record the exact source commit; dirty working trees are marked explicitly rather than claiming an exact source version.
- `npm run mobile:save`: save the latest compiled Android APK here. Build first with the existing mobile build command.
- GitHub **Verify STOCRANT** workflow: checks the application, uploads its website build, builds Android from the same commit and uploads the APK with its manifest. Find downloads under the workflow run's **Artifacts** section. Failed checks prevent the Android job from running.

For GitHub mobile builds, optionally set the repository variable `STOCRANT_API_URL` to your deployed HTTPS API origin. Without it, native apps default to `https://www.mohbaba.online`; the app's server settings can override that address. Browser builds retain same-origin API behavior.

Android uses a registered `StocrantDevice` bridge for system file saving (up to 20 MiB), payroll/finance printing or PDF output, opening the public website, and matching system-bar icon contrast to the selected theme. Downloads retain the existing server permissions and native bearer authentication; session credentials are never sent to the file picker or browser. iOS retains browser-based export behavior until an equivalent native implementation is provided.

Pushing source does not deploy a hosting provider or automatically install an app on phones. No hosting deployment is configured by this workflow. CI APKs are debug/testing builds; stable release signing must be configured before distributing seamless in-place production updates. Never uninstall an existing app merely to bypass a signing mismatch.
