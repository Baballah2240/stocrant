import { spawn } from "node:child_process";
delete process.env.ELECTRON_RUN_AS_NODE;
const electron = (await import("electron")).default;
spawn(electron, ["."], { stdio: "inherit", env: process.env }).on("exit", c => process.exit(c ?? 0));
