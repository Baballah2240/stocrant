import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCollection, getStore, saveStore, transaction } from "./storage.js";
import { isMainManager } from "./permissions.js";
import { createNotification } from "./notifications.js";
import { audit } from "./workspace.js";

type Row = Record<string, any>;
const rows = (collection: string) => getCollection(collection) as Row[];
const input = z.object({
  platform: z.enum(["android", "ios"]), versionName: z.string().trim().regex(/^\d+\.\d+(?:\.\d+)?$/).max(32),
  buildNumber: z.number().int().positive().max(2100000000), notes: z.string().trim().min(5).max(4000),
  downloadUrl: z.string().url().max(2000).refine(value => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname); } catch { return false; } }),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
}).strict();
const versionInput = z.object({ version: z.number().int().positive() }).strict();
const safe = (row: Row) => ({ id: row.id, platform: row.platform, versionName: row.versionName, buildNumber: row.buildNumber, notes: row.notes, downloadUrl: row.downloadUrl, sha256: row.sha256, approvedAt: row.approvedAt });
export const appReleasesRouter = Router();

// Authenticated users receive approved metadata only. No draft URLs or internal actors.
appReleasesRouter.get("/available", (_req, res) => res.json({ items: rows("appReleases").filter(row => row.status === "approved").map(safe) }));
appReleasesRouter.use((req, res, next) => isMainManager(req.auth!) ? next() : res.status(403).json({ error: "Only the Super Admin can manage app releases." }));
appReleasesRouter.get("/", (_req, res) => res.json({ items: [...rows("appReleases")].reverse() }));
appReleasesRouter.post("/", (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a platform, version, build number, release notes, HTTPS download link and SHA-256 checksum." });
  return transaction(() => {
    if (rows("appReleases").some(row => row.platform === parsed.data.platform && row.buildNumber === parsed.data.buildNumber)) return res.status(409).json({ error: "This platform build number is already registered." });
    const item = { ...parsed.data, sha256: parsed.data.sha256.toLowerCase(), id: randomUUID(), status: "draft", version: 1, createdBy: req.auth!.id, createdAt: new Date().toISOString() };
    rows("appReleases").push(item);
    audit(req.auth!, "app.release-created", { targetId: item.id, platform: item.platform, versionName: item.versionName }); saveStore(getStore());
    return res.status(201).json({ item });
  });
});
appReleasesRouter.post("/:id/:action", (req, res) => {
  const parsed = versionInput.safeParse(req.body), action = String(req.params.action);
  if (!parsed.success || !["approve", "withdraw"].includes(action)) return res.status(400).json({ error: "Choose a valid release action and version." });
  return transaction(() => {
    const item = rows("appReleases").find(row => row.id === req.params.id);
    if (!item) return res.status(404).json({ error: "App release not found." });
    if (item.version !== parsed.data.version) return res.status(409).json({ error: "App release changed. Reload before continuing." });
    if (action === "approve" && item.status !== "draft" || action === "withdraw" && item.status !== "approved") return res.status(409).json({ error: "This app release action is no longer available." });
    if (action === "approve") {
      if (rows("appReleases").some(row => row.platform === item.platform && row.status !== "draft" && row.approvedAt && row.buildNumber >= item.buildNumber)) return res.status(409).json({ error: "Approve a build newer than the previously approved release." });
      for (const previous of rows("appReleases").filter(row => row.platform === item.platform && row.status === "approved")) { previous.status = "superseded"; previous.version++; }
      Object.assign(item, { status: "approved", approvedBy: req.auth!.id, approvedAt: new Date().toISOString() });
      for (const user of rows("accessUsers").filter(user => user.status === "active")) {
        const platform = item.platform === "android" ? "Android" : "iOS";
        createNotification({ userId: user.id, user: user.name, type: "message", severity: "info", message: `Stocrant ${platform} ${item.versionName} is approved and available to download.`, messageKey: "Stocrant {platform} {version} is approved and available to download.", messageValues: { platform, version: item.versionName }, target: `app-release:${item.id}` });
      }
    } else Object.assign(item, { status: "withdrawn", withdrawnBy: req.auth!.id, withdrawnAt: new Date().toISOString() });
    item.version++;
    audit(req.auth!, `app.release-${action}`, { targetId: item.id, platform: item.platform, versionName: item.versionName }); saveStore(getStore());
    return res.json({ item });
  });
});
