# Mobile updates

## Reliability fixes

- Cancel pending note saves on deletion and flush edits when leaving the editor.
- Merge pending field changes to preserve title and body edits.
- Stamp queued actions with stable request IDs; the desktop persists timer receipts to prevent duplicate toggles after a lost response.
- Preserve rejected actions in local recovery storage, show an error, and continue syncing subsequent edits.
- Keep the local state reference current between rapid actions.

Source changes only; no Android APK was built or installed.
