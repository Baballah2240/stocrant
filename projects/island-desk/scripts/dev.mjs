// Starts Vite and Electron together with live renderer reload.
import { spawn, execSync } from "node:child_process";
import { createServer } from "vite";
execSync("npx tsc -p tsconfig.electron.json", { stdio: "inherit" });
const server = await createServer(); await server.listen();
delete process.env.ELECTRON_RUN_AS_NODE;
const electron = (await import("electron")).default;
const child = spawn(electron, ["."], { stdio: "inherit", env: { ...process.env, ISLAND_DESK_DEV_URL: "http://127.0.0.1:5178" } });
child.on("exit", code => { void server.close(); process.exit(code ?? 0); });
