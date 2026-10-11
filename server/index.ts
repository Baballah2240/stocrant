import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3000;
const app = createApp();
const server = createServer(app);
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 10_000).unref();
  });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.STOCRANT_DATA_DIR
  ? join(process.env.STOCRANT_DATA_DIR, "data")
  : join(__dirname, "..", "data");

server.listen(port, "0.0.0.0", () => {
  console.log(`STOCRANT API listening on http://0.0.0.0:${port}`);
  console.log(`Data stored in ${join(dataDir, "stocrant.json")}`);
});
