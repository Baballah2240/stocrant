// Launches the real desktop app in an isolated data folder and checks the SMOKE report it prints.
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
delete process.env.ELECTRON_RUN_AS_NODE;
const electron = (await import("electron")).default;
const r = spawnSync(electron, [".", "--smoke"], { encoding: "utf8", timeout: 40000, env: { ...process.env, ISLAND_DESK_TEST_DIR: mkdtempSync(join(tmpdir(), "island-")), ISLAND_DESK_COMPANION_PORT: "47831", ISLAND_DESK_BEACON_PORT: "47833" } });
const lines = (r.stdout || "").split(/\r?\n/);
for (const info of lines.filter(l => l.startsWith("DISPLAY "))) console.log(info);
const line = lines.find(l => l.startsWith("SMOKE "));
console.log(line || r.stdout + r.stderr);
const ok = line && Object.values(JSON.parse(line.slice(6))).every(Boolean);
process.exit(ok ? 0 : 1);
