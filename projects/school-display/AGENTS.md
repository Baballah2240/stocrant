# School Display

- This is an independent project. Do not change Stocrant application files.
- Keep the web control panel local to 127.0.0.1 unless remote access is explicitly requested.
- Support Arabic RTL, English LTR and bilingual classroom displays.
- Schedule decisions must use the configured school timezone and timestamps, never counter drift.
- Only an authenticated administrator may publish schedules, change settings or request desktop exit.
- No fixed passwords or committed runtime databases, session tokens, installers or credentials.
- Electron renderers must be sandboxed with Node integration disabled and context isolation enabled.
- Run npm test and the browser verification for affected behavior. Package Windows releases when requested.
- The teacher and parent app shares `web/teacher*` and `shared/` with `/teacher`. Its API is bearer-token only under `/api/mobile/`, with role and class checks on every write. Never add cookies to it, never let parents reach control-panel routes or other families' data, and never allow cleartext HTTP in the Android build.
- Always distinguish building an installer from installing it or verifying fullscreen behavior on classroom hardware.
- After verified school-project changes, save a fresh source checkpoint under archives/ with a SHA-256 checksum. Include current build artifacts when produced and exclude credentials, live data, and previous archives.
