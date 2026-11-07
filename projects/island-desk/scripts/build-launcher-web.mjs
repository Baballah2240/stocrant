// Builds the phone page for the Android app and makes it the app's index.html.
import { execSync } from "node:child_process";
import { renameSync, copyFileSync, existsSync } from "node:fs";
execSync("npx vite build -c vite.launcher.config.ts", { stdio: "inherit" });
if (existsSync("dist-launcher/companion.html")) renameSync("dist-launcher/companion.html", "dist-launcher/index.html");
copyFileSync("public/companion-icon.png", "dist-launcher/companion-icon.png");
