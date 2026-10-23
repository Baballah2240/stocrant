import express, { Router, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { authenticatedUser, publicUser, accountScopeActive } from "../auth.js";
import { can, isWithinScope } from "../permissions.js";
import { shopCompany, shopPermission } from "../commerce.js";
import { getCollection, getDataDirectory, getStore, saveStore, transaction } from "../storage.js";
import { audit } from "../workspace.js";
import { PHOTO_LIMIT, mediaRows, photoPath, photoType, photoLinked, productPhotos } from "../shop-media.js";
import { merchandisingFor, visibleProduct } from "../storefront-merchandising.js";
type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
function failure(res: Response, e: unknown) { return res.status((e as {statusCode?: number}).statusCode || 400).json({ error: (e as Error).message }); }
function access(req: Request, res: Response, next: NextFunction) {
  try {
    req.auth = authenticatedUser(req);
    if (!req.auth || req.auth.mustChangePassword || req.auth.accountStatus !== "active") return res.status(403).json({ error: "Sign in with an active account to upload photos." });
    if (!["create", "edit"].some(action => can(req.auth, "inventory", action as "create" | "edit") && can(req.auth, "operations", action as "create" | "edit"))) return res.status(403).json({error:"Shop management requires inventory and operations permission."});
    shopCompany(req.auth, String(req.params.companyId));
    next();
  } catch (e) { failure(res, e); }
}
export const shopImageUploads = Router();
shopImageUploads.post("/:companyId/photos", access, express.raw({ type: "application/octet-stream", limit: PHOTO_LIMIT }), access, (req, res) => {
  let id: string | undefined;
  try {
    if (!Buffer.isBuffer(req.body)) throw new Error("Send photo bytes as application/octet-stream.");
    // Discard abandoned drafts after a day, without touching any linked photo.
    const expired = mediaRows().filter(p => p.createdBy === req.auth!.id && Date.parse(p.createdAt) < Date.now() - 86400000 && !photoLinked(p.id));
    if (expired.length) {
      const ids = new Set(expired.map(p => p.id));
      transaction(() => { getStore().collections.shopProductImages = mediaRows().filter(p => !ids.has(p.id)); saveStore(getStore()); });
      for (const file of expired) rmSync(photoPath(file.id), { force: true });
    }
    if (mediaRows().filter(p => p.createdBy === req.auth!.id && !photoLinked(p.id)).length >= 24) return res.status(429).json({ error: "Remove unused photos before uploading more." });
    const mime = photoType(req.body);
    id = randomUUID();
    mkdirSync(join(getDataDirectory(), "shop-images"), { recursive: true, mode: 0o700 });
    writeFileSync(photoPath(id), req.body, { flag: "wx", mode: 0o600 });
    const row = { id, mime, size: req.body.length, organizationId: req.params.companyId, createdBy: req.auth!.id, createdAt: new Date().toISOString() };
    transaction(() => { mediaRows().push(row); audit(req.auth, "shop.photo-uploaded", { targetId: id, organizationId: row.organizationId }); saveStore(getStore()); });
    res.status(201).json({ url: `/api/shop-images/${id}` });
  } catch (e) { if (id) rmSync(photoPath(id), { force: true }); failure(res, e); }
});
shopImageUploads.delete("/:companyId/photos/:id", access, (req, res) => {
  try {
    const file = mediaRows().find(p => p.id === req.params.id && p.organizationId === req.params.companyId && p.createdBy === req.auth!.id);
    if (!file) return res.status(404).json({error:"Photo not found."});
    if (photoLinked(file.id)) return res.status(409).json({ error: "Save the product without this photo before deleting it." });
    transaction(() => { getStore().collections.shopProductImages = mediaRows().filter(p => p.id !== file.id); saveStore(getStore()); });
    rmSync(photoPath(file.id), { force: true });
    res.json({ ok: true });
  } catch (e) { failure(res, e); }
});
export const shopImageDownloads = Router();
shopImageDownloads.get("/:id", (req, res) => {
  const file = mediaRows().find(p => p.id === req.params.id);
  if (!file) return res.status(404).json({ error: "Photo not found." });
  const products = rows("shopProducts").filter(p => p.organizationId === file.organizationId && productPhotos(p).includes(`/api/shop-images/${file.id}`));
  let permitted = false;
  try {
    if (req.auth && !req.auth.mustChangePassword && req.auth.accountStatus === "active") {
      shopPermission(req.auth, "view"); shopCompany(req.auth, file.organizationId);
      permitted = products.length ? products.some(p => isWithinScope(req.auth!, rows("inventoryItems").find(i => i.id === p.inventoryItemId) || {})) : file.createdBy === req.auth.id;
    }
  } catch { /* Fall through to published storefront access. */ }
  if (!permitted) for (const s of rows("shopStorefronts").filter(s => s.organizationId === file.organizationId && s.published)) {
    try {
      const connector = rows("shopConnectors").find(c => c.id === s.connectorId && c.active && c.organizationId === s.organizationId);
      const account = rows("accessUsers").find(a => a.id === connector?.ownerId && a.status === "active" && !a.mustChangePassword && accountScopeActive(a));
      if (!account) continue;
      const user = publicUser(account as Parameters<typeof publicUser>[0]);
      shopPermission(user, "view"); const company = shopCompany(user, file.organizationId);
      if (!rows("organizations").some(o => o.id === company.parentOrganizationId && o.status === "active")) continue;
      permitted = products.some(p => p.active && visibleProduct(merchandisingFor(s), p) && isWithinScope(user, rows("inventoryItems").find(i => i.id === p.inventoryItemId) || {}));
    } catch { /* Unavailable storefronts do not publish photos. */ }
    if (permitted) break;
  }
  if (!permitted || !existsSync(photoPath(file.id))) return res.status(404).json({error:"Photo not found."});
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", file.mime);
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(photoPath(file.id));
});
