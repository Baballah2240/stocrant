# School Display deployment

The default Windows application and web server bind only to `127.0.0.1`. No school-network listener, signing certificate, update host or scheduled task is created automatically.

## Local upgrade

1. Export a business-data backup and close School Display through **Administrator → Protected controls**. For complete account recovery, also copy the app data folder while the app is closed.
2. Run `School-Display-Setup-2.1.1-x64.exe` using the same Windows account and installation location. Existing school data migrates automatically. An installer build is not an installation.
3. Verify your classes, special days, teacher assignments and connected monitors before publishing. Existing additional users keep administrator access until you change their role.

Use **Classrooms & screens** for multiple monitors on this Windows computer. Browser links work on the same computer by default. Native always-on-top behavior is provided by the Windows app, not a browser running on another computer.

## Signed production builds

You need a trusted Windows code-signing certificate/provider. Do not commit `.pfx`, `.p12`, private keys, passwords or TLS files. The signed build configuration follows [electron-builder's Windows signing documentation](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/).

Set `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` through your signing provider or CI secrets, then run:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run dist:win:signed
$env:SCHOOL_SIGNED_BUILD='true'
node build/manifest.mjs
```

The signed command fails if signing credentials are missing and requires signing to succeed. `dist:win` deliberately builds local unsigned artifacts. No certificate was provided for this release, so its local installers are unsigned.

The independent **School Display Windows** GitHub workflow tests and uploads installer/portable/checksum artifacts. For a manual signed run, configure secrets `SCHOOL_WIN_CSC_LINK` and `SCHOOL_WIN_CSC_KEY_PASSWORD`, then select the signed input. This workflow does not publish hosting or install software. Its GitHub execution must be verified separately after source push and repository authentication are available.

## Trusted administrator-controlled updates

Publish the signed NSIS installer and `latest.json` on one trusted HTTPS origin. The JSON is:

```json
{
  "version": "2.0.1",
  "url": "https://updates.example.edu/School-Display-Setup-2.0.1-x64.exe",
  "sha256": "<64 hexadecimal characters from the installer checksum>",
  "bytes": 123456789
}
```

`node build/manifest.mjs` generates checksums; set `SCHOOL_RELEASE_BASE_URL` to the HTTPS directory to also generate `latest.json`. The SHA-256 and byte count must match the published executable. These examples contain placeholders, not a live update feed.

Set these environment variables for the Windows app process through your deployment system, then restart it:

- `SCHOOL_UPDATE_URL`: the exact HTTPS manifest URL.
- `SCHOOL_UPDATE_SIGNER`: the trusted publisher's 40-character Windows Authenticode certificate thumbprint, without spaces. Obtain it from the verified certificate; it is not the installer SHA-256 checksum.

The app rejects redirects, a different installer origin, non-HTTPS downloads, older/equal versions, oversized files, mismatching checksums, invalid Windows signatures and a different signer. It checks the staged checksum and signature again before installation. **System & recovery → Check updates → Download & verify → Install verified update** requires an administrator password for installation and saves a recovery copy. The installer opens normally and the app closes; no silent update is installed over an active lesson. Account recovery database files remain local and are not uploaded to the update host.

## Optional HTTPS school-network service

Do this only after obtaining a school DNS name and a trusted TLS certificate. Keep private key material outside this repository. The `.env.example` lists variables; it is a reference file, not automatically loaded.

```powershell
$env:SCHOOL_NETWORK_ORIGIN='https://school.example.edu:8443'
$env:SCHOOL_BIND_HOST='0.0.0.0'
$env:SCHOOL_TLS_CERT='C:/SchoolDisplay/private/fullchain.pem'
$env:SCHOOL_TLS_KEY='C:/SchoolDisplay/private/server.key'
$env:SCHOOL_DATA_DIR='C:/SchoolDisplay/data'
npm.cmd start
```

The HTTPS origin determines the port. Keep the process running using your school's service management. Create the first administrator on the server computer before allowing remote clients. Restrict the firewall to the school network; no firewall rule is created by the app. Do not expose port 4318's local HTTP endpoint directly or disable certificate verification. If using an internal certificate authority, configure device and Node trust correctly rather than bypassing TLS checks.

Open the HTTPS control URL from other authorized computers and register browser screens. Screen links are bearer credentials and should be shared only with the intended display. Disabling/renewing a screen or renewing all display access revokes its links. Teacher view links are bound to current role, assigned class, active account and password hash. An offline display retains its last published cache until it reconnects, so revocation cannot erase an already offline device's local copy.

This service supports remote browser displays after deployment. For distributed always-on-top Windows screens, use the remote connection controls described in [HOSTING.md](HOSTING.md). Operating-system kiosk lockdown is not part of this release. Monitor hotplug, projector modes, touch input and school-specific teaching applications must still be verified on classroom hardware.

## Recovery and retention

Business JSON backups live under `backups/`, retain the latest 14 copies and omit credentials/tokens. They include screen assignments; links are regenerated when restoring to another installation. The complete current and previous SQLite files contain private account data and must be protected as part of the Windows user's app data. If startup recovers from the previous file, the damaged file is preserved as `school-corrupt-<timestamp>.sqlite`; review recent changes and retain it for your administrator. If neither database is readable, recover from your complete app data backup. There is no cloud account/password reset in local mode.
