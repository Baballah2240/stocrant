import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "android/app/build/outputs/apk/debug/app-debug.apk");
if (!existsSync(source)) throw new Error("Build the Android APK first with npm run mobile:apk.");
const bytes = readFileSync(source);
if (bytes.length < 1000 || bytes.readUInt32LE(0) !== 0x04034b50) throw new Error("The Android package is missing or invalid.");
let commit = process.env.GITHUB_SHA || "unknown";
const git = process.platform === "win32" && existsSync("C:/Program Files/Git/cmd/git.exe") ? "C:/Program Files/Git/cmd/git.exe" : "git";
const gitOptions = { cwd: root, encoding: "utf8" };
const safeDirectory = `safe.directory=${root.replace(/\\/g, "/").replace(/\/$/, "")}`;
if (commit === "unknown") {
  commit = execFileSync(git, ["-c", safeDirectory, "rev-parse", "HEAD"], gitOptions).trim();
}
const sourceDirty = Boolean(execFileSync(git, ["-c", safeDirectory, "status", "--porcelain"], gitOptions).trim());
const directory = join(root, "mobile/releases");
mkdirSync(directory, { recursive: true });
const filename = "STOCRANT-Android.apk";
copyFileSync(source, join(directory, filename));
writeFileSync(join(directory, "latest.json"), JSON.stringify({ app: "STOCRANT", platform: "android", channel: "debug", sourceCommit: sourceDirty ? null : commit, sourceDirty, packagingCommit: commit, packagedAt: new Date().toISOString(), filename, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }, null, 2) + "\n");
console.log("Saved mobile/releases/STOCRANT-Android.apk and latest.json.");
