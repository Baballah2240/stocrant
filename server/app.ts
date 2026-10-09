import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import storesRouter from "./routes/stores.js";
import zonesRouter from "./routes/zones.js";
import peopleRouter from "./routes/people.js";
import occupancyRouter from "./routes/occupancy.js";
import collectionsRouter from "./routes/collections.js";
import authRouter from "./routes/auth.js";
import workspaceRouter from "./routes/workspace.js";
import {
  attachAuth,
  productionConfigurationError,
  requireAuth,
} from "./auth.js";
import { notificationRouter } from "./notifications.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const configurationError = productionConfigurationError();
  if (configurationError) throw new Error(`STOCRANT configuration error: ${configurationError}`);
  const app = express();

  app.use(cors({ credentials: true, origin: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(attachAuth);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "stocrant" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", requireAuth);
  app.use("/api/stores", storesRouter);
  app.use("/api/zones", zonesRouter);
  app.use("/api/people", peopleRouter);
  app.use("/api/occupancy", occupancyRouter);
  app.use("/api/collections", collectionsRouter);
  app.use("/api/workspace", workspaceRouter);
  app.use("/api/notifications", notificationRouter);

  // Unknown /api paths must return JSON, never HTML or the SPA shell.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  // Serve the built frontend (dist/) when present so `npm run start` works
  // as a single production process.
  const distDir = join(__dirname, "..", "dist");
  const indexHtml = join(distDir, "index.html");
  if (existsSync(distDir)) {
    app.use(express.static(distDir));
  }

  // SPA fallback: hand index.html to client-side routes, never to API calls.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    if (existsSync(indexHtml)) return res.sendFile(indexHtml);
    next();
  });

  return app;
}
