# Stocrant mobile icon

The blue-to-mint ledger mark extends the application's existing ledger identity. A deep navy background and dark ink keep the mark clear at launcher sizes. No small text is embedded in the icon.

- `icon-design.json`: shared palette and normalized geometry.
- `stocrant-app-icon.svg`: editable vector export.
- `stocrant-app-icon.png`: opaque 1024×1024 master.
- `stocrant-app-icon-preview.png`: rounded 512×512 preview.

Regenerate Android launcher/round/adaptive assets and the iOS 1024×1024 icon with `npm run mobile:icons` on Windows. The generator uses System.Drawing and the shared design parameters; it does not need external image services or credentials. Android adaptive foregrounds have transparent backgrounds and reduced centered geometry; the iOS icon has an opaque background for platform masking.

The Android package must be rebuilt to update an installed launcher icon. Native iOS assets are updated, but an iOS binary requires the existing macOS/Xcode build process.
