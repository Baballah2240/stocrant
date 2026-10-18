import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// An explicitly separate, loopback-only development workspace. Never load the
// production database or seed a replacement for the user's missing database.
if (process.env.NODE_ENV === "production") throw new Error("Local preview cannot run in production mode.");
const root = fileURLToPath(new URL("../.local-preview/", import.meta.url));
mkdirSync(root, { recursive: true });
process.env.STOCRANT_DATA_DIR = resolve(root);
process.env.STOCRANT_SETUP_KEY = "local-setup";
process.env.NODE_ENV = "production";
const { getStore } = await import("../dist/storage.js");
getStore(); // Empty first-run store, without development sample business data.
process.env.NODE_ENV = "development";
const { createApp } = await import("../dist/app.js");
const port = Number(process.env.STOCRANT_PREVIEW_PORT || 3000);
const server = createApp().listen(port, "127.0.0.1", () => {
  console.log(`Stocrant separate local preview: http://localhost:${port}`);
  console.log("First-time setup key: local-setup (local development only).");
  console.log(`Preview data: ${root}`);
});
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close(() => process.exit(0)));
