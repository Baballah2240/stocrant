# Android update ? 2026-10-19

The Android debug package was rebuilt with the current shared UI, including HR documents, linked employee account management, notification history, urgent alerts and acknowledgments. Capacitor Android/iOS resources were synchronized. An iOS binary was not compiled on this Windows workstation.

## Build verification

- Android assembleDebug completed successfully with JDK 21 and Gradle 8.14.3.
- The APK contains the new HRCommunication, EmployeeInbox and DocumentsWorkspace bundles.
- Android APK signing verification passed. This is a debug/testing package, not a store-signed release.
- The corrupted tracked Gradle wrapper JAR was replaced with the wrapper embedded in the installed Gradle 8.14.3 distribution; gradlew --version now succeeds.
- Shared application checks and browser workflows are recorded in HR_EMPLOYEE_COMMUNICATION.md and HR_DOCUMENTS.md.

## Local testing connection

The locally generated STOCRANT-Android.apk is a USB testing build with API fallback http://127.0.0.1:3000. Existing device server settings take precedence and are retained by an in-place update. The backend is the separate local-preview workspace, not a restored production database.

With an authorized USB Android device, use Android SDK platform-tools:

    adb devices
    adb reverse tcp:3000 tcp:3000
    adb install -r STOCRANT-Android.apk

Do not uninstall the existing app to bypass a signature mismatch: that can remove device settings. Match the signing key or handle migration explicitly. For a fresh USB installation, select http://127.0.0.1:3000 as the server address if needed. The cable/reverse mapping and local server must remain available. A deployed HTTPS server may instead be selected in the app's existing server settings.

No Android device was detected during this update, so installation and real-device/biometric runtime checks were not performed. The APK remains available locally and is excluded from Git, as are generated assets, SDK paths, runtime records and secrets. For production, build with the real HTTPS API origin and configured release-signing environment, using the existing release workflow.
