# STOCRANT public website

This is an independent static React/Vite project. It has its own package, build, appearance preference and configuration. It does not use the management app's login, API or database. The workspace server serves its built files at `/website/`, linked from the top of the login page. `npm run build:full` in the repository root builds both projects. Copy this folder into a separate repository when publishing it independently.

Run `npm install`, then `npm run dev` (port 5174) or `npm run build` (output: `dist/`).

For Render, create a **Static Site**, set Root Directory to `public-website` when using the existing repository (leave empty for a separate repository), Build Command to `npm ci --include=dev && npm run build`, and Publish Directory to `dist`.

Configure the public values shown in `.env.example` before building. The Workspace sign-in link opens `VITE_WORKSPACE_URL` when configured; under `/website/` it otherwise returns to the same server's login. Set `VITE_PUBLIC_WEBSITE_URL` when building the management app to override its login-header website link with a separate public domain. The contact form opens an email draft addressed to `VITE_CONTACT_EMAIL`; the visitor must send it using their email app. No messages are stored in the management app. Use a separate form service if you want web-based delivery later.

Keep the management app on its existing Render web service. A separate static-site service and hostname are optional: the existing workspace service can serve the built website at `/website/`. No service has been deployed or domain assigned automatically.
