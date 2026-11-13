# Mobile updates

## Reliability fixes

- Cancel pending note saves on deletion and flush edits when leaving the editor.
- Merge pending field changes to preserve title and body edits.
- Stamp queued actions with stable request IDs; the desktop persists timer receipts to prevent duplicate toggles after a lost response.
- Preserve rejected actions in local recovery storage, show an error, and continue syncing subsequent edits.
- Keep the local state reference current between rapid actions.

Source changes only; no Android APK was built or installed.
# Flutter workspace preview - 2026-11-13

Shared Flutter 3.50 Windows/Android workspace added in `flutter_app/`: Arabic/English translation, notes, tasks, calculator/history, focus timer, text tools and shortcuts. The Android preview uses a separate application ID (`studio.islanddesk.island_desk_flutter`) and private storage, so it does not overwrite the existing launcher. Translation needs internet and submits only on Translate. Windows imports a copy of legacy workspace data into a separate file; original data is not rewritten.

This is a migration preview. The existing Electron/Capacitor apps remain available. Floating stickies, blur/click-through, system media/hardware monitoring, global shortcuts, Wi-Fi pairing, alarms and Android notification/home-screen integrations still belong to the existing apps. Do not call the preview a complete replacement for those integrations.

Build Android with `npm run flutter:android`, then `npm run mobile:save`; the APK, SHA-256 and build manifest are ignored under `mobile/releases/`. Windows: `npm run flutter:windows`. No physical phone installation is implied.

Verification: Flutter 3.50 analysis passed with no issues; 5 domain/widget tests passed at 360px and 1000px, with Arabic/English direction, preserved drafts, an always-visible Translate action, calculator safety and queued/backup persistence. Both live Dart translation directions succeeded. Windows release and Android debug builds succeeded; mobile:save records the final APK hash. No Android phone was installed.

## 2026-11-13 - Desktop atmosphere
Shared desktop source adds saved light/dark translucent styling, clock style controls, a user-selected local audio playlist with playback and a real Web Audio energy response. Existing Windows media/event announcements remain. Music stays mounted when changing workspace tabs. No new Android package was built; desktop audio files require explicit file selection.

## 2026-11-13 - 0.9.1 light appearance and Settings correction
Appearance/music controls now sit inside the scrollable Settings content instead of above navigation. A labelled Settings tab is always available. Light surfaces, text, fields, navigation and calculator/tool controls use readable light colors. The desktop smoke test checks Settings visibility and real light appearance. New Windows installer; no Android rebuild.

## 2026-11-13 - 0.9.2 smooth island reactions
Removed hard corner ears and exterior audio glow; native hide now fades over 180ms with cancellation on reopen. Music reacts through an interior audio glow and media motion; local file selection/playback announces an event and focus mode breathes gently. Reduced motion disables decorative motion. Float-off no longer unconditionally raises compact/preview windows. Windows installer rebuilt; Windows media sessions react automatically; optional explicit system-audio capture enables audio-energy reactions for other device sound without recording or uploading.

Verification: packaged desktop tests pass for synthetic audio energy/capture stop, local music and focus motion, native fade completion, and float-off/float-on. Actual Windows loopback playback across the user's audio devices was not exercised automatically.
