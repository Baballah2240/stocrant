import { app } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { statfsSync } from "node:fs";
import { cpus, freemem, totalmem } from "node:os";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import type { Stats } from "../shared/bridge.js";

/**
 * Hardware monitor. CPU, memory and disk come from Node; GPU load and network speed come from
 * Windows performance counters via a small PowerShell helper. Runs only while someone is looking.
 */
const here = dirname(fileURLToPath(import.meta.url));
let timer: ReturnType<typeof setInterval> | undefined, helper: ChildProcessWithoutNullStreams | undefined;
let previous = cpuTimes(), extra: Pick<Stats, "gpu" | "up" | "down"> = { gpu: null, up: null, down: null };

function cpuTimes() { return cpus().reduce((sum, cpu) => { const t = cpu.times; return { idle: sum.idle + t.idle, total: sum.total + t.user + t.nice + t.sys + t.idle + t.irq }; }, { idle: 0, total: 0 }); }
function diskPercent() {
  try { const root = parse(app.getPath("home")).root || "C:\\"; const info = statfsSync(root); return Math.round((1 - info.bavail / info.blocks) * 100); } catch { return null; }
}
function sample(): Stats {
  const now = cpuTimes(), idle = now.idle - previous.idle, total = now.total - previous.total; previous = now;
  const ramTotal = totalmem(), ramUsed = ramTotal - freemem();
  return { cpu: total > 0 ? Math.round((1 - idle / total) * 100) : 0, ramUsed, ramTotal, disk: diskPercent(), ...extra };
}
function startHelper() {
  if (helper || process.platform !== "win32") return;
  const script = app.isPackaged ? join(process.resourcesPath, "stats.ps1") : join(here, "../../electron/stats.ps1");
  helper = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], { windowsHide: true });
  let buffer = ""; helper.stdout.setEncoding("utf8");
  helper.stdout.on("data", chunk => {
    buffer += chunk; let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
      try { const raw = JSON.parse(line); const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null; extra = { gpu: num(raw.gpu), up: num(raw.up), down: num(raw.down) }; } catch { /* partial line */ }
    }
  });
  helper.on("exit", () => { helper = undefined; });
}
export function watchStats(on: boolean, emit: (stats: Stats) => void) {
  if (on && !timer) { previous = cpuTimes(); startHelper(); emit(sample()); timer = setInterval(() => emit(sample()), 1500); }
  if (!on && timer) { clearInterval(timer); timer = undefined; helper?.kill(); helper = undefined; }
}
export function stopStats() { if (timer) clearInterval(timer); timer = undefined; helper?.kill(); helper = undefined; }
