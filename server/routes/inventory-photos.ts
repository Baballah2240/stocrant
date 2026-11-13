import express, { Router, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { authenticatedUser, type AuthenticatedUser } from "../auth.js";
import { can, isWithinScope } from "../permissions.js";
import { getCollection, getDataDirectory, getStore, saveStore, transaction } from "../storage.js";
import { PHOTO_LIMIT, photoType } from "../shop-media.js";
import { audit, canReadApproval } from "../workspace.js";
type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
export const inventoryImage = z.union([z.literal(""), z.string().regex(/^\/api\/inventory-images\/[a-f0-9-]{36}$/)]);
const imageUrl = (id: string) => "/api/inventory-images/" + id;
function path(id: string) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid photo reference."); return join(getDataDirectory(), "inventory-images", id + ".bin"); }
function linked(id: string) { const url = imageUrl(id); return rows("inventoryItems").some(item => item.image === url) || rows("approvalRequests").some(request => request.collection === "inventoryItems" && ["pending", "changes-requested"].includes(request.status) && request.payload?.image === url); }
export function validateInventoryImage(actor: AuthenticatedUser, image: string, companyId: unknown, existing?: Row, ownerRequired = true) {
  if (!image || image === existing?.image) return;
  const file = rows("inventoryImages").find(file => imageUrl(file.id) === image && file.organizationId === companyId);
  if (!file || !existsSync(path(file.id)) || (file.inventoryItemId && file.inventoryItemId !== existing?.id) || (ownerRequired && file.createdBy !== actor.id)) throw new Error("Choose a picture uploaded for this inventory item and company.");
  if (rows("inventoryItems").some(item => item.id !== existing?.id && item.image === image)) throw new Error("Upload a separate picture for this inventory item.");
}
export const inventoryPhotoUploads = Router();
function uploadAccess(req: Request, res: Response, next: NextFunction) {
  req.auth = authenticatedUser(req);
  const company = rows("companies").find(company => company.id === req.params.companyId);
  const target = req.get("X-Inventory-Item");
  const item = target ? rows("inventoryItems").find(item => item.id === target && item.organizationId === req.params.companyId) : undefined;
  if (!req.auth || req.auth.mustChangePassword || req.auth.accountStatus !== "active" || !can(req.auth, "inventory", target ? "edit" : "create") || !company || !isWithinScope(req.auth, { ...company, organizationId: company.id }) || (target && (!item || !isWithinScope(req.auth, item)))) return res.status(403).json({ error: "You do not have permission to upload this inventory picture." });
  next();
}
inventoryPhotoUploads.post("/:companyId/photos", uploadAccess, express.raw({ type: "application/octet-stream", limit: PHOTO_LIMIT }), uploadAccess, (req, res) => {
  let id: string | undefined;
  try {
    if (!Buffer.isBuffer(req.body)) throw new Error("Send photo bytes as application/octet-stream.");
    const expired = rows("inventoryImages").filter(file => file.createdBy === req.auth!.id && Date.parse(file.createdAt) < Date.now() - 86400000 && !linked(file.id));
    if (expired.length) { const ids = new Set(expired.map(file => file.id)); transaction(() => { getStore().collections.inventoryImages = rows("inventoryImages").filter(file => !ids.has(file.id)); saveStore(getStore()); }); for (const file of expired) rmSync(path(file.id), { force: true }); }
    if (rows("inventoryImages").filter(file => file.createdBy === req.auth!.id && !linked(file.id)).length >= 24) return res.status(429).json({ error: "Remove unused photos before uploading more." });
    const mime = photoType(req.body); id = randomUUID();
    mkdirSync(join(getDataDirectory(), "inventory-images"), { recursive: true, mode: 0o700 });
    writeFileSync(path(id), req.body, { flag: "wx", mode: 0o600 });
    const file = { id, mime, organizationId: req.params.companyId, inventoryItemId: req.get("X-Inventory-Item") || "", size: req.body.length, createdBy: req.auth!.id, createdAt: new Date().toISOString() };
    transaction(() => { rows("inventoryImages").push(file); audit(req.auth, "inventory.photo-uploaded", { targetId: id, organizationId: file.organizationId }); saveStore(getStore()); });
    res.status(201).json({ url: imageUrl(id) });
  } catch (error) { if (id) rmSync(path(id), { force: true }); res.status((error as {statusCode?: number}).statusCode || 400).json({ error: (error as Error).message }); }
});
inventoryPhotoUploads.delete("/:companyId/photos/:id", (req, res) => {
  const file = rows("inventoryImages").find(file => file.id === req.params.id && file.organizationId === req.params.companyId && file.createdBy === req.auth?.id);
  if (!req.auth || !["create", "edit"].some(action => can(req.auth, "inventory", action as "create" | "edit"))) return res.status(403).json({ error: "You do not have permission to remove this picture." });
  if (!file || !isWithinScope(req.auth, { organizationId: file.organizationId })) return res.status(404).json({ error: "Photo not found." });
  if (linked(file.id)) return res.status(409).json({ error: "Save the inventory item without this picture before deleting it." });
  transaction(() => { getStore().collections.inventoryImages = rows("inventoryImages").filter(row => row.id !== file.id); saveStore(getStore()); }); rmSync(path(file.id), { force: true }); res.json({ ok: true });
});
export const inventoryPhotoDownloads = Router();
inventoryPhotoDownloads.get("/:id", (req, res) => {
  const file = rows("inventoryImages").find(file => file.id === req.params.id);
  if (!req.auth || !file || !existsSync(path(file.id))) return res.status(404).json({ error: "Photo not found." });
  const items = rows("inventoryItems").filter(item => item.image === imageUrl(file.id));
  const readable = can(req.auth, "inventory", "view") && items.some(item => isWithinScope(req.auth!, item));
  const ownDraft = !items.length && file.createdBy === req.auth.id && (file.inventoryItemId ? can(req.auth, "inventory", "edit") && rows("inventoryItems").some(item => item.id === file.inventoryItemId && isWithinScope(req.auth!, item)) : can(req.auth, "inventory", "create") && isWithinScope(req.auth, { organizationId: file.organizationId }));
  const reviewable = can(req.auth, "inventory", "approve") && rows("approvalRequests").some(request => request.collection === "inventoryItems" && ["pending", "changes-requested"].includes(request.status) && request.payload?.image === imageUrl(file.id) && canReadApproval(req.auth!, request as Parameters<typeof canReadApproval>[1]));
  if (!readable && !ownDraft && !reviewable) return res.status(404).json({ error: "Photo not found." });
  res.set({ "Cache-Control": "private, no-store", "Content-Type": file.mime, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" }); res.sendFile(path(file.id));
});
