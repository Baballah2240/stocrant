# Connect schools.mohbaba.online

This release adds remote Windows display synchronization. It has not created a Render service or changed DNS. The first service is one school's workspace: do not add unrelated customer schools to its users/classes. Separate-school tenancy and platform-wide administration are not implemented. Independent Render services with separate data disks and domains can isolate different schools in the meantime.

## 1. Publish the source

Push the current branch to GitHub using your own GitHub sign-in. Never paste credentials into chat. The school service is independent of Stocrant. Its Blueprint is `projects/school-display/render.yaml`; do not replace the root Stocrant Blueprint.

## 2. Create the Render service

In Render, choose **New → Blueprint**, select this repository/current branch, and set the Blueprint path to `projects/school-display/render.yaml`. Review the service and disk charges before creating it. It uses a paid Starter instance with a 1 GB persistent disk because schedules, uploaded images, accounts and backups must survive redeployment. Only one instance may write this SQLite database.

If creating a Web Service manually, use:

| Field | Value |
| --- | --- |
| Root Directory | `projects/school-display` |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Disk mount | `/var/lib/school-display` |
| Disk size | 1 GB |
| Instances | 1 |

Set `SCHOOL_DATA_DIR=/var/lib/school-display`, `SCHOOL_NETWORK_ORIGIN=https://schools.mohbaba.online`, `SCHOOL_TRUST_PROXY=1`, `NODE_VERSION=24` and `NODE_ENV=production`. Generate a private random `SCHOOL_SETUP_KEY` of at least 32 characters in Render. The Blueprint generates this automatically. The app uses Render's `PORT`. Keep the setup key private; it permits creation of the first administrator only.

Proxy mode is for a hosting platform that terminates HTTPS and forwards requests through its controlled edge. Do not enable it on a directly exposed untrusted HTTP server. The app requires the exact public Host, HTTPS forwarded protocol, matching Origin for writes, and Secure session cookies. `/health` exposes only `{ok:true}` and accepts platform health probes before domain verification.

## 3. Connect the domain

Add `schools.mohbaba.online` in the new service's **Settings → Custom Domains** if the Blueprint has not added it. In the DNS dashboard, add a **CNAME** named `schools`, pointing to the exact `*.onrender.com` hostname shown for this new service. Do not guess that hostname from the service name. Preserve the root/`www` Stocrant records. Follow any additional verification records Render shows, then click **Verify** and wait for HTTPS certificate issuance.

These steps follow Render's [Blueprint reference](https://render.com/docs/blueprint-spec) and [custom domain instructions](https://render.com/docs/custom-domains).

## 4. Create the cloud administrator and transfer schedules

Open `https://schools.mohbaba.online/control`. Enter the hosting setup key from Render alongside your new administrator details. The first administrator is created once; subsequent visits use normal sign-in. Cloud accounts are separate from existing local accounts. Business backup/restore transfers timetables, themes and images, not users/passwords; create the cloud users explicitly. Keep the Windows computer's local administrator credentials for protected exit and connection changes.

Publish your classes and timetable. In **Classrooms & screens**, add a screen using **Browser / projector link** for each remote Windows computer, select its class and copy its display link. The link is a private read-only device credential, not a login or password.

## 5. Connect the Windows app

Install version 2.1.0 or later. Close the previous version through its administrator controls before updating. The installer is unsigned until a signing certificate is configured: school IT must approve deployment; do not bypass Windows Application Control.

In the Windows app's local control panel, open **System & recovery → Connect this Windows display**, paste the copied HTTPS screen link and enter the **local** administrator password. Press **Connect & synchronize**. Published lessons, special days, announcements, themes and uploaded images synchronize every five seconds. The display checks the local service every few seconds, so allow roughly ten seconds after publishing. Windows monitor placement/autostart and protected exit remain local. Remote mode shows one assigned class on the primary configured overlay; it suspends additional local timetable windows. Use separate Windows installations for different remote classrooms. To return to the old local timetable, use **Disconnect & use local timetable** with the local administrator password.

The app validates and saves the remote snapshot and downloaded images on the classroom computer. It continues from this copy offline, including after restarting. Keep computer clocks synchronized with Windows time. A disabled/renewed screen loses access and clears its saved timetable when it next reaches the server; an offline computer cannot receive immediate revocation. Screen credentials live in `remote-screen.json` in private app data and are excluded from source control and business backups. Protect full data-folder copies, which contain credentials.

## 6. Verify before classroom use

1. Visit `/health` and `/control` through the custom HTTPS domain.
2. Confirm unknown Hosts, non-HTTPS forwarded requests and missing setup keys are rejected.
3. Publish a changed lesson and image; confirm the actual Windows overlay updates and the cloud screen becomes online at the current revision.
4. Disconnect internet, restart the app and confirm its cached timetable remains visible. Reconnect and check synchronization.
5. Disable the screen in the cloud dashboard and confirm the Windows display clears after reconnecting. Renew its link and reconnect it with the new link.
6. Check Arabic/English, projector geometry, sound and protected exit on the actual classroom hardware.

Web publishing updates timetable content only. New Windows application code still requires its own installer update. A GitHub push does not deploy this manual-deploy service, install Windows updates or verify DNS. Local two-server/browser tests do not establish that the real domain is live.
