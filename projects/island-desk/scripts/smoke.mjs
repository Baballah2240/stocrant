import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
delete process.env.ELECTRON_RUN_AS_NODE;
const electron = (await import("electron")).default;
const r = spawnSync(electron, [".", "--smoke"], { encoding: "utf8", timeout: 30000, env: { ...process.env, ISLAND_DESK_TEST_DIR: mkdtempSync(join(tmpdir(), "island-")) } });
const line = (r.stdout || "").split("\n").find(l => l.startsWith("SMOKE ")); console.log(line || r.stdout + r.stderr);
const ok = line && Object.values(JSON.parse(line.slice(6))).every(Boolean); process.exit(ok ? 0 : 1);
