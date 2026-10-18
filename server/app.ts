import hrMessagesRouter from "./hr-messages.js";
import { existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
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
import attendanceRouter from "./routes/attendance.js";
import documentsRouter from "./routes/documents.js";
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
  if (process.env.STOCRANT_TRUST_PROXY === "1") app.set("trust proxy", 1);

  // In production only allow explicitly configured origins (comma-separated)
  // to send credentialed requests; development reflects any origin for the
  // local Vite dev server. The native mobile app sends no browser Origin
  // header, so it is unaffected either way.
  const allowedOrigins = (process.env.STOCRANT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  // Capacitor WebViews identify themselves with these fixed local origins.
  // Keep them available in production without allowing arbitrary websites.
  const nativeOrigins = new Set(["https://localhost", "capacitor://localhost"]);
  const corsOptions = {
    credentials: true,
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      if (!origin) return callback(null, true); // same-origin, curl, mobile clients
      if (nativeOrigins.has(origin)) return callback(null, true);
      if (allowedOrigins.length) return callback(null, allowedOrigins.includes(origin));
      callback(null, process.env.NODE_ENV !== "production");
    },
  };
  app.use(cors(corsOptions));
  app.use((req, res, next) => {
    if (process.env.NODE_ENV === "production" && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("Origin");
      let sameHost = false;
      try { sameHost = Boolean(origin && new URL(origin).host === req.get("host") && new URL(origin).protocol === "https:"); } catch { /* Reject invalid origins. */ }
      if (origin && !sameHost && !nativeOrigins.has(origin) && !allowedOrigins.includes(origin)) return res.status(403).json({ error: "Request origin is not allowed." });
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; frame-src 'self' blob:; connect-src 'self' https:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    }
    next();
  });
  app.use(attachAuth);
  app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "stocrant" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", requireAuth);
  app.use("/api", (req, res, next) => {
    if (req.auth?.accountStatus && req.auth.accountStatus !== "active" && !req.path.startsWith("/notifications")) return res.status(403).json({ error: "Your registration requires Main Admin approval." });
    if (req.auth && req.auth.roleId !== "role-main-manager" && !(req.auth.roleId === "role-organization-admin" && req.auth.tenantOrganizationIds?.length === 1) && req.auth.organizationIds.length !== 1 && !req.path.startsWith("/notifications")) return res.status(403).json({ error: "The Main Admin must assign your organization or company before you can access business records." });
    next();
  });
  app.use("/api/stores", storesRouter);
  app.use("/api/zones", zonesRouter);
  app.use("/api/people", peopleRouter);
  app.use("/api/occupancy", occupancyRouter);
  app.use("/api/collections/documents", documentsRouter);
  app.use("/api/workspace/documents", documentsRouter);
  app.use("/api/collections", collectionsRouter);
  app.use("/api/workspace/attendance", attendanceRouter);
  app.use("/api/workspace/hr/communication", hrMessagesRouter);
  app.use("/api/workspace", workspaceRouter);
  app.use("/api/notifications", notificationRouter);

  // Unknown /api paths must return JSON, never HTML or the SPA shell.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });
  app.use((error: { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
    if (status === 500) console.error("STOCRANT request failed", error);
    res.status(status).json({ error: status === 413 ? "Request is too large." : status === 400 ? "Invalid request body." : "An unexpected server error occurred." });
  });

  // Serve the built frontend (dist/) when present so `npm run start` works
  // as a single production process.
  const distDir = join(__dirname, "web");
  const indexHtml = join(distDir, "index.html");
  if (existsSync(distDir)) {
    app.use(express.static(distDir, { dotfiles: "deny", index: false, setHeaders(res, path) {
      res.setHeader("Cache-Control", path.includes(`${join("assets", "")}`) ? "public, max-age=31536000, immutable" : "no-cache");
    } }));
  }

  // SPA fallback: hand index.html to client-side routes, never to API calls.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    if (extname(req.path)) return res.status(404).send("Not found.");
    if (existsSync(indexHtml)) { res.setHeader("Cache-Control", "no-cache"); return res.sendFile(indexHtml); }
    next();
  });

  return app;
}
