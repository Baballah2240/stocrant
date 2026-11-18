/** Bank / mobile-money transfer payments for the hosted shop: the merchant lists accounts (Bankak, Fawry, bank…),
 * the customer pays outside Stocrant and uploads a screenshot, staff verify or reject it, then record the payment in Finance. */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { AuthenticatedUser } from "./auth.js";
import { shopCompany, shopPermission } from "./commerce.js";
import { photoType } from "./shop-media.js";
import { getCollection, getDataDirectory, getStore, saveStore, transaction } from "./storage.js";
import { audit } from "./workspace.js";
import { createNotification } from "./notifications.js";

type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
export const PROOF_LIMIT = 4 * 1024 * 1024;
export const MAX_PROOFS = 3;
const account = z.object({ id: z.string().uuid(), label: z.string().trim().min(1).max(60), accountName: z.string().trim().min(1).max(120), accountNumber: z.string().trim().min(1).max(60), instructions: z.string().trim().max(400).default("") }).strict();
export const paymentsSchema = z.object({ cashEnabled: z.boolean().default(true), transferEnabled: z.boolean().default(false), accounts: z.array(account).max(6).refine(v => new Set(v.map(a => a.id)).size === v.length).default([]) }).strict()
  .refine(p => p.cashEnabled || p.transferEnabled, "Allow cash or transfer payment.")
  .refine(p => !p.transferEnabled || p.accounts.length > 0, "Add at least one transfer account before accepting transfers.");
export type ShopPayments = z.infer<typeof paymentsSchema>;
export const defaultPayments: ShopPayments = { cashEnabled: true, transferEnabled: false, accounts: [] };
export function paymentsFor(s: Row): ShopPayments { const p = paymentsSchema.safeParse(s.payments ?? {}); return p.success ? p.data : defaultPayments; }

/** Applied when a storefront checkout creates its order. */
export function applyCheckoutPayment(s: Row, order: Row, choice: "cash" | "transfer") {
  const p = paymentsFor(s);
  if (choice === "transfer" && !p.transferEnabled) throw Object.assign(new Error("This shop does not accept transfers. Choose another payment option."), { statusCode: 400 });
  if (choice === "cash" && !p.cashEnabled) throw Object.assign(new Error("This shop accepts transfer payment only."), { statusCode: 400 });
  if (choice === "transfer") { order.paymentMethod = "bank-transfer"; order.transferStatus = "awaiting-proof"; order.transferProofs = []; }
}
/** Transfer details shown to the customer on their private order page. */
export function receiptPayment(s: Row, order: Row) {
  if (order.paymentMethod !== "bank-transfer") return { method: order.paymentMethod || "pay-on-delivery" };
  return { method: "bank-transfer", status: order.transferStatus, note: order.transferNote || "", proofs: (order.transferProofs || []).length, canUpload: ["awaiting-proof", "rejected"].includes(order.transferStatus) && (order.transferProofs || []).length < MAX_PROOFS && !["cancelled", "expired"].includes(order.status), accounts: paymentsFor(s).accounts.map(({ label, accountName, accountNumber, instructions }) => ({ label, accountName, accountNumber, instructions })) };
}
const proofDir = () => join(getDataDirectory(), "payment-proofs");
const proofPath = (id: string) => { if (!/^[a-f0-9-]{36}$/.test(id)) throw Object.assign(new Error("Proof not found."), { statusCode: 404 }); return join(proofDir(), id); };
/** Stores a customer's transfer screenshot (JPEG/PNG/WebP, magic-number checked) against the order. */
export function saveTransferProof(s: Row, order: Row, bytes: Buffer, reference: string, owner: AuthenticatedUser) {
  if (order.paymentMethod !== "bank-transfer") throw Object.assign(new Error("This order is not paid by transfer."), { statusCode: 409 });
  if (!receiptPayment(s, order).canUpload) throw Object.assign(new Error("A transfer proof can't be added to this order now."), { statusCode: 409 });
  let mime = "";
  try { mime = photoType(bytes); } catch { throw Object.assign(new Error("Send a JPEG, PNG or WebP photo of the transfer receipt."), { statusCode: 400 }); }
  const id = randomUUID();
  mkdirSync(proofDir(), { recursive: true, mode: 0o700 });
  writeFileSync(proofPath(id), bytes, { flag: "wx", mode: 0o600 });
  try {
    transaction(() => {
      order.transferProofs = [...(order.transferProofs || []), { id, mime, size: bytes.length, reference, at: new Date().toISOString() }];
      order.transferStatus = "proof-submitted"; delete order.transferNote;
      audit(undefined, "storefront.transfer-proof", { organizationId: order.organizationId, targetId: order.id, section: "operations" });
      createNotification({ userId: owner.id, user: owner.name, type: "message", severity: "info", message: `Transfer proof received for order ${order.orderNumber || order.id.slice(0, 8)}.`, messageKey: "Transfer proof received for order {reference}.", messageValues: { reference: order.orderNumber || order.id.slice(0, 8) }, target: `shop-order:${order.id}` });
      saveStore(getStore());
    });
  } catch (e) { rmSync(proofPath(id), { force: true }); throw e; }
}

/** Staff: view proofs and verify or reject a transfer. Verifying does not create a Finance entry by itself. */
export const transferReviewRouter = Router();
const staffOrder = (user: AuthenticatedUser, companyId: string, orderId: string) => { const c = shopCompany(user, companyId); const order = rows("shopOrders").find(o => o.id === orderId && o.organizationId === c.id); if (!order) throw Object.assign(new Error("Order not found."), { statusCode: 404 }); return order; };
const sendError = (res: any, e: unknown) => res.status((e as { statusCode?: number }).statusCode || (e instanceof z.ZodError ? 400 : 500)).json({ error: e instanceof z.ZodError ? "Check the review details." : (e as Error).message });
transferReviewRouter.get("/:companyId/orders/:id/transfer-proofs/:proofId", (req, res) => {
  try {
    shopPermission(req.auth!, "view");
    const order = staffOrder(req.auth!, String(req.params.companyId), String(req.params.id));
    const proof = (order.transferProofs || []).find((p: Row) => p.id === req.params.proofId);
    if (!proof || !existsSync(proofPath(proof.id))) return res.status(404).json({ error: "Proof not found." });
    res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.type(proof.mime).send(readFileSync(proofPath(proof.id)));
  } catch (e) { sendError(res, e); }
});
transferReviewRouter.post("/:companyId/orders/:id/transfer-review", (req, res) => {
  try {
    shopPermission(req.auth!, "edit");
    const b = z.object({ decision: z.enum(["verify", "reject"]), note: z.string().trim().max(300).default("") }).strict().parse(req.body);
    const order = transaction(() => {
      const order = staffOrder(req.auth!, String(req.params.companyId), String(req.params.id));
      if (order.transferStatus !== "proof-submitted") throw Object.assign(new Error("There is no transfer proof waiting for review."), { statusCode: 409 });
      if (b.decision === "reject" && !b.note) throw Object.assign(new Error("Tell the customer why the transfer was not accepted."), { statusCode: 400 });
      order.transferStatus = b.decision === "verify" ? "verified" : "rejected";
      order.transferNote = b.note; order.transferReviewedBy = req.auth!.id; order.transferReviewedAt = new Date().toISOString();
      audit(req.auth, b.decision === "verify" ? "shop.transfer-verified" : "shop.transfer-rejected", { organizationId: order.organizationId, targetId: order.id, section: "operations" });
      saveStore(getStore());
      return order;
    });
    res.json({ transferStatus: order.transferStatus, transferNote: order.transferNote });
  } catch (e) { sendError(res, e); }
});
