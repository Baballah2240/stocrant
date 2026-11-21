# Faslii Flutter apps

Run from this folder with `flutter run -d web-server --web-hostname 127.0.0.1 --web-port 4320 --no-web-resources-cdn`. Arabic and the parent dashboard are the defaults. The menu opens from the leading edge or the three-line icon. Language selection is saved on the device.

The preview uses sample data. Parent cards open full-screen details. Appearance, app lock, and update checking are under Settings. The sample entry point runs separately from the two school-connected Flutter editions below.

On Android or iOS, enroll biometrics in phone settings before enabling App lock. Faslii uses the operating system prompt when changing the lock or unlocking after launch or backgrounding. The browser preview does not support biometric locking.

The web preview compares its build to `web/release.json`. For a native release, provide the HTTPS manifest URL using `--dart-define=FASLII_UPDATE_FEED=...` and the native build number using `--dart-define=FASLII_BUILD=...`. The manifest must return a JSON object containing a positive integer `build`. The check reports availability and does not install updates.

## Separate school-connected apps

From mobile/flutter, build Android with:
    flutter build apk --debug --flavor parent -t lib/main_parent.dart
    flutter build apk --debug --flavor teacher -t lib/main_teacher.dart

The packages have distinct Android IDs and local settings. The default HTTPS server is schools.mohbaba.online. Override it at build time with --dart-define=FASLII_SCHOOL_ORIGIN=https://your-school.example. Deploy the matching school server before distributing these apps.

Both use bearer authentication, keep the session in memory, and read the published schedule and class data through /api/mobile/. The browser design preview starts from lib/main.dart. Card details in the two school-connected builds require an account and use live school data. Existing administration and advanced teacher workflows remain available through the school web app.

## Android release signing

Use the school's publisher keystore by setting FASLII_ANDROID_KEYSTORE, FASLII_ANDROID_STORE_PASSWORD, FASLII_ANDROID_KEY_ALIAS and FASLII_ANDROID_KEY_PASSWORD in the build environment. For store submissions, build each edition with `flutter build appbundle --release --flavor parent -t lib/main_parent.dart` or the corresponding teacher command. Without the signing configuration, release outputs are unsigned. Keep the keystore and passwords outside the source tree.

## Archive a completed task

From the school project, run PowerShell -ExecutionPolicy Bypass -File mobile/flutter/archive-school.ps1 after tests pass. Add -IncludeAndroid when both debug packages were built for the checkpoint. The script verifies each file inside the ZIP and writes an adjacent SHA-256 checksum. Extract school-display/ from the archive to resume development, then install dependencies with npm ci and flutter pub get. Native debug APKs install separately. Public Android distribution requires signed releases; separate iOS distribution requires bundle provisioning and an Xcode build on macOS.

## School community on one local origin

Start the school server from its project folder with `$env:PORT='4319'; npm.cmd start`. The dashboard is /control, and **School community & notifications** opens inside its sidebar layout. The standalone /community-admin route remains available. Generate and distribute the school code to intended members. Parent registration asks for a display alias, email, password and school code. It requires no student account or child name. This is one school community per server.

Build each connected web app from mobile/flutter, preserving its base path:

    flutter build web --target lib/main_teacher.dart --base-href /faslii-teacher/ --output build/web-teacher --no-web-resources-cdn
    flutter build web --target lib/main_parent.dart --base-href /faslii-parent/ --output build/web-parent --no-web-resources-cdn

Flutter 3.47.9 does not write `index.html` into these output folders. If `build/web-teacher/index.html` is missing after a build, create it from `web/index.html` with `$FLUTTER_BASE_HREF` replaced by `/faslii-teacher/` (and `/faslii-parent/` for the parent build). Without it the server answers "App build not found".

The apps have three tabs. **Home** shows school and teacher posts; posts can hold up to six photos that swipe sideways and open full screen with pinch and double-tap zoom. Teachers publish posts with the **New post** button. **Lessons** shows the current or next lesson and the week. **Classwork** lets teachers post homework or exams (with photos) and open the files parents send; parents upload a file for their child, or add a child with the school's invitation code. The bell opens the notifications list.

The dashboard and both apps then share http://127.0.0.1:4319 on the same computer. To connect physical devices, use the existing SCHOOL_NETWORK_ORIGIN and SCHOOL_TLS_CERT/SCHOOL_TLS_KEY configuration with a trusted certificate matching the LAN address or school hostname. Use that exact HTTPS origin as FASLII_SCHOOL_ORIGIN when building Android. Localhost addresses the phone itself when opened on a phone.

The administrator selects recipients and notification categories in the community dashboard. The Flutter apps show the notification inbox and check for updates every 30 seconds while open. Native background delivery requires FCM registration for each Flutter app. Teacher classwork is shared with the school community only through the explicit publish form for an assigned, published class. Keep student names and grades out of that form and out of community posts.

Community state is stored in the school database, and community photos are stored under the runtime directory. Keep a private copy of that full runtime directory for school-data recovery. The source archive excludes live community data.

Archive the current browser builds with `powershell.exe -ExecutionPolicy Bypass -File mobile/flutter/archive-school.ps1 -IncludeWeb` after verification. The extracted builds sit in their server paths, so the same-origin app links work after installing the Node dependencies and starting the school server.

## USB Android development

The USB debug builds can use `FASLII_SCHOOL_ORIGIN=https://127.0.0.1:4321` and `FASLII_USB_CERT` containing a base64-encoded PEM certificate for the local bridge. The debug route trusts that certificate for the USB connection. Public builds use platform certificate trust.

Run `node usb-school-bridge.cjs PATH_TO_USB_CERTIFICATE_DIRECTORY` with the Windows dashboard running on localhost port 4318. For the separate preview server, add 4319 as the optional second argument. The directory must hold cert.pem and key.pem. The certificate must include IP:127.0.0.1 as a subject alternative name. Run `adb reverse tcp:4321 tcp:4321` after reconnecting the phone. The certificate private key belongs outside the project and archive. These USB APKs require the matching bridge certificate and a connected phone.

## Public release gates

- Verify `/health` on the school's HTTPS origin and deploy the same server revision used to test the apps. Deploy both compiled web directories if serving the browser editions. Use durable private storage with backups. The current server represents one school.
- Send a test notification from the dashboard to each audience and confirm it in both apps. Background push on the Flutter editions requires native registration and a physical-device delivery test.
- Complete publisher signing and iOS provisioning, then verify the separate app identifiers and sign-in on supported devices. Add a real support contact, privacy policy, and terms reviewed by the school.
- Before store submission, provide a parent account deletion flow and public deletion request page, and add in-app reporting and blocking for community content. Keep admin review and comment removal available.
- Keep the Windows dashboard on loopback for local operation. A hosted service and the local Windows installation use separate data directories unless a school explicitly configures a shared deployment workflow.
