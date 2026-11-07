import { app } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MediaState } from "../shared/bridge.js";

/** Runs the PowerShell now-playing helper and restarts it if it stops. */
const here = dirname(fileURLToPath(import.meta.url));
let child: ChildProcessWithoutNullStreams | undefined, stopped = false, failures = 0;
export let media: MediaState = { active: false };

export function startMedia(onChange: (state: MediaState) => void) {
  if (process.platform !== "win32" || stopped) return;
  const script = app.isPackaged ? join(process.resourcesPath, "media.ps1") : join(here, "../../electron/media.ps1");
  const started = Date.now();
  child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], { windowsHide: true });
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", chunk => {
    buffer += chunk; let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
      if (!line.startsWith("{")) continue;
      try { media = sanitize(JSON.parse(line)); onChange(media); } catch { /* ignore a partial line */ }
    }
  });
  child.on("exit", () => {
    child = undefined; if (stopped) return;
    if (media.active) { media = { active: false }; onChange(media); }
    failures = Date.now() - started > 30000 ? 0 : failures + 1;
    if (failures < 6) setTimeout(() => startMedia(onChange), 1000 * 2 ** failures);
  });
}
export function mediaCommand(command: string) {
  if (!["toggle", "next", "previous"].includes(command)) throw Error("Unknown media command.");
  child?.stdin.write(command + "\n");
}
export function stopMedia() { stopped = true; child?.kill(); }

const text = (value: unknown, max = 300) => typeof value === "string" ? value.slice(0, max) : "";
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
function sanitize(raw: Record<string, unknown>): MediaState {
  if (!raw.active || !text(raw.title)) return { active: false };
  const art = text(raw.art, 4_000_000);
  return {
    active: true, title: text(raw.title), artist: text(raw.artist), album: text(raw.album), app: friendlyApp(text(raw.app)),
    playing: raw.playing === true, canNext: raw.canNext === true, canPrevious: raw.canPrevious === true, canToggle: raw.canToggle !== false,
    positionMs: num(raw.positionMs), durationMs: num(raw.durationMs), updatedAt: num(raw.updatedAt) || Date.now(),
    art: /^data:image\/(png|jpe?g|gif|bmp|webp);base64,[A-Za-z0-9+/=]+$/.test(art) ? art : "",
  };
}
function friendlyApp(id: string) {
  const lower = id.toLowerCase();
  if (lower.includes("spotify")) return "Spotify";
  if (lower.includes("chrome")) return "Chrome";
  if (lower.includes("msedge")) return "Edge";
  if (lower.includes("firefox")) return "Firefox";
  if (lower.includes("zunemusic") || lower.includes("media")) return "Media Player";
  return id.replace(/\.exe$/i, "").split(/[!\\.]/).filter(Boolean).pop() || "Music";
}
