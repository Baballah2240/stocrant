# Deploy STOCRANT to `www.mohbaba.online`

## Security setup before production

STOCRANT uses server-enforced roles, HTTP-only secure sessions, and
scrypt-hashed passwords. Before creating the Render Blueprint, create two long
random **secret** environment variables in Render:

- `STOCRANT_SESSION_SECRET` — signs session cookies. Rotating it signs out every
  account, so store it safely.
- `STOCRANT_SETUP_KEY` — required only to create the first Main Manager account.
  Keep it private and rotate or remove it after setup if desired.

Do not place either value in Git, frontend files, or screenshots.

## Why Render

STOCRANT is an Express application with a React frontend and a JSON-backed data
store. It must run as a Node.js web service and retain the data file after a
restart or deploy. The included `render.yaml` provisions:

- a single Node.js web service;
- a health check at `/api/health`;
- a 1 GB persistent disk;
- `STOCRANT_DATA_DIR=/var/lib/stocrant`, which stores data at
  `/var/lib/stocrant/data/stocrant.json` on that disk;
- secret `STOCRANT_SESSION_SECRET` and `STOCRANT_SETUP_KEY` environment values;
- `www.mohbaba.online` as the public custom domain.

The persistent disk requires a **paid Render web-service plan**. Do not select
Render's Free plan for a real deployment: its filesystem is ephemeral, so data
would disappear on restarts, deploys, or idle spin-downs.

## 1. Put the project in a private GitHub repository

`data/` is intentionally ignored so local STOCRANT records are not uploaded to
GitHub. A first production deployment starts with empty business records on the
persistent disk.

If this folder is not already a Git repository, use GitHub Desktop:

1. Install GitHub Desktop and sign in to GitHub.
2. Choose **File → Add local repository** and select
   `c:\Users\Lenovo\resturrant\stocrant`.
3. If prompted, choose **Create a repository**.
4. Publish it as a **private** repository.

Alternatively, after installing Git, run these commands from the project root:

```powershell
git init
git add .
git commit -m "Prepare STOCRANT for Render deployment"
git branch -M main
git remote add origin https://github.com/YOUR-GITHUB-USER/stocrant.git
git push -u origin main
```

Do not force-add `data/stocrant.json`. If existing local records need to move to
production, back up the file privately first and arrange an authenticated import
before going live.

## 2. Create the Render service

1. Create a Render account and connect the GitHub account that owns the private
   repository.
2. In Render, choose **New → Blueprint** and select the STOCRANT repository.
3. Render detects `render.yaml`. Confirm the service named `stocrant-web`.
4. Keep the configured paid `0.5c-512mb` plan (or choose a larger paid plan).
   The disk cannot be attached to a Free service.
5. Create the Blueprint and wait for deployment to complete.
6. Open the generated `https://…onrender.com/api/health` address. It must return:

```json
{"ok":true,"service":"stocrant"}
```

The initial production deployment starts with empty business records. After deployment,
open the service and create the first Main Manager with the private setup key.
Company records written after that are retained on the attached disk across
deploys.

## 3. Point the domain DNS to Render

For Namecheap, open **Domain List → Manage → Advanced DNS → Host Records**
for `mohbaba.online`. These records apply when Namecheap manages the domain's
DNS. If custom nameservers are selected, make the changes at that DNS provider.
Replace the parking CNAME for `www` and any conflicting URL Redirect record for
`@` with the records below only after the deployed service passes its health
check. Preserve mail and verification records.

After Render creates the service, copy its assigned host, which resembles:

```text
stocrant-web.onrender.com
```

Use the actual hostname shown by Render if it differs. In the DNS manager for
`mohbaba.online`, remove only *conflicting web/forwarding records* for `@` and
`www` (do not remove email MX or verification TXT records), then add:

| Host | Type | Value |
| --- | --- | --- |
| `@` | `A` | `216.24.57.1` |
| `www` | `CNAME` | `YOUR-RENDER-SERVICE.onrender.com` |

Set a short TTL (for example, 5 minutes) while verifying. If your DNS provider
supports an `ALIAS`, `ANAME`, or CNAME flattening at the root domain, point `@`
to `YOUR-RENDER-SERVICE.onrender.com` instead of using the A record.

Remove any `AAAA` records for the root or `www` name while configuring Render,
because they can prevent Render's IPv4 custom-domain verification from working.

### If DNS is managed by Cloudflare

Create two CNAME records instead:

| Name | Target | Proxy status |
| --- | --- | --- |
| `@` | `YOUR-RENDER-SERVICE.onrender.com` | **DNS only** |
| `www` | `YOUR-RENDER-SERVICE.onrender.com` | **DNS only** |

Set Cloudflare SSL/TLS encryption mode to **Full** during verification. Do not
enable Cloudflare proxying until Render has issued and verified its certificate.

## 4. Verify the HTTPS website

In Render, open the service's **Settings → Custom Domains** page and wait until
the domain status and TLS certificate are verified. Then test:

```text
https://www.mohbaba.online/
https://www.mohbaba.online/api/health
```

Render also associates the root domain and redirects it to the configured `www`
domain. DNS changes can take several minutes and sometimes longer to propagate.

## Ongoing operations

- Every push to the connected Git branch triggers a deployment.
- Back up `/var/lib/stocrant/data/stocrant.json` before major changes.
- A service with a persistent disk runs as one instance and has a brief restart
  during deploys; this prevents two instances from writing the same JSON file.
- For high-concurrency or multi-instance production use, replace JSON persistence
  with a managed database before scaling beyond this single-instance setup.
