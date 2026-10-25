import { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { publicUser, type AuthenticatedUser } from "./auth.js";
import { can, platformWebsiteInquiries, canReadWebsiteInquiry } from "./permissions.js";
import { getCollection, getStore, saveStore, transaction } from "./storage.js";
import { createNotification } from "./notifications.js";
import { audit } from "./workspace.js";

type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
const statuses = ["new", "in-progress", "contacted", "quoted", "closed", "spam"] as const;
export const publicWebsiteRouter = Router();
export const websiteInquiryRouter = Router();
const limits = new Map<string, { count: number; reset: number }>();

/** Explicit platform access; a tenant's customerService.* never exposes other businesses' leads. */
export function platformInquiries(user: AuthenticatedUser) {
  return platformWebsiteInquiries(user);
}
const readable = canReadWebsiteInquiry;
const staff = () => rows("accessUsers").filter(row => row.status === "active").map(row => publicUser(row as any)).filter(user => platformWebsiteInquiries(user));
const publicInput = z.object({
  name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160).transform(value => value.toLowerCase()),
  phone: z.string().trim().min(5).max(40).regex(/^[+\d\s().-]+$/).refine(value => value.replace(/\D/g, "").length >= 6 && value.replace(/\D/g, "").length <= 20), company: z.string().trim().max(160).default(""),
  existingWebsite: z.string().trim().max(300).default(""), service: z.enum(["shop-website", "workspace", "general"]).default("shop-website"),
  plan: z.enum(["essentials", "connected", "custom", "unsure"]).default("unsure"), message: z.string().trim().min(10).max(6000),
  consent: z.literal(true), website: z.string().max(300).default(""), requestId: z.string().uuid(),
}).strict();

publicWebsiteRouter.get("/info", (_req, res) => res.json({ services: ["shop-website", "workspace"], pricing: "quote", acceptingInquiries: true }));
publicWebsiteRouter.post("/inquiries", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = publicInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter your name, a valid email and phone number, a message, and consent to be contacted." });
  const input = parsed.data;
  if (input.website) return res.status(202).json({ accepted: true, reference: "RECEIVED" });
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const existing = rows("websiteInquiries").find(row => row.requestId === input.requestId);
  if (existing) return existing.requestHash === fingerprint ? res.status(200).json({ accepted: true, reference: existing.reference }) : res.status(409).json({ error: "This request changed. Refresh the page and send it again." });
  const now = Date.now();
  for (const [key, bucket] of limits) if (bucket.reset < now) limits.delete(key);
  const key = createHash("sha256").update(req.ip || "unknown").digest("hex");
  const bucket = limits.get(key) || { count: 0, reset: now + 15 * 60_000 };
  if (bucket.count >= 5 || (!limits.has(key) && limits.size >= 10_000)) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.reset - now) / 1000))));
    return res.status(429).json({ error: "Too many inquiries. Please try again later." });
  }
  bucket.count++; limits.set(key, bucket);
  const inquiry = transaction(() => {
    const id = randomUUID(), createdAt = new Date().toISOString();
    const item: Row = { id, reference: `ST-${id.slice(0, 8).toUpperCase()}`, requestId: input.requestId, requestHash: fingerprint,
      name: input.name, email: input.email, phone: input.phone, company: input.company, existingWebsite: input.existingWebsite,
      service: input.service, plan: input.plan, message: input.message, consentAt: createdAt, createdAt, updatedAt: createdAt,
      source: "public-website", status: "new", assignedTo: "", version: 1, history: [] };
    rows("websiteInquiries").push(item);
    for (const user of staff().filter(platformInquiries)) createNotification({ userId: user.id, user: user.name, type: "message", severity: "info",
      message: `New website inquiry ${item.reference}. Review it in Customer Service.`, messageKey: "New website inquiry {reference}. Review it in Customer Service.", messageValues: { reference: item.reference }, target: `/customer-service?websiteInquiry=${id}` });
    audit(undefined, "website.inquiry-received", { targetId: id, reference: item.reference, source: "public-website" });
    saveStore(getStore()); return item;
  });
  return res.status(201).json({ accepted: true, reference: inquiry.reference });
});

websiteInquiryRouter.get("/", (req, res) => {
  if (!can(req.auth, "customerService", "view")) return res.status(403).json({ error: "Customer Service access is required." });
  const all = rows("websiteInquiries").filter(row => readable(req.auth!, row));
  const query = String(req.query.q || "").slice(0, 200).toLowerCase(), status = String(req.query.status || "all");
  const filtered = all.filter(row => (status === "all" || row.status === status) && (!query || [row.reference, row.name, row.email, row.company].some(value => String(value).toLowerCase().includes(query)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1)), size = 25;
  res.json({ items: filtered.slice((page - 1) * size, page * size), total: filtered.length, page, pages: Math.max(1, Math.ceil(filtered.length / size)),
    canAssign: platformInquiries(req.auth!), canEdit: platformInquiries(req.auth!) || can(req.auth, "customerService", "edit"),
    staff: platformInquiries(req.auth!) ? staff().map(user => ({ id: user.id, name: user.name })) : [],
    counts: Object.fromEntries(statuses.map(status => [status, all.filter(row => row.status === status).length])) });
});
websiteInquiryRouter.get("/:id", (req, res) => {
  const row = rows("websiteInquiries").find(row => row.id === req.params.id && readable(req.auth!, row));
  if (!row) return res.status(404).json({ error: "Inquiry not found." });
  res.json({ item: row });
});
websiteInquiryRouter.patch("/:id", (req, res) => {
  const row = rows("websiteInquiries").find(row => row.id === req.params.id && readable(req.auth!, row));
  if (!row) return res.status(404).json({ error: "Inquiry not found." });
  if (!platformInquiries(req.auth!) && !can(req.auth, "customerService", "edit")) return res.status(403).json({ error: "You cannot update this inquiry." });
  const parsed = z.object({ version: z.number().int().positive(), status: z.enum(statuses).optional(), assignedTo: z.string().max(100).optional(), note: z.string().trim().max(2000).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid status, assignment and note." });
  if (parsed.data.version !== row.version) return res.status(409).json({ error: "This inquiry changed. Refresh it before saving." });
  if (parsed.data.assignedTo !== undefined && !platformInquiries(req.auth!)) return res.status(403).json({ error: "Platform inbox access is required to assign inquiries." });
  const assignee = parsed.data.assignedTo ? staff().find(user => user.id === parsed.data.assignedTo) : undefined;
  if (parsed.data.assignedTo && !assignee) return res.status(400).json({ error: "Choose an active Customer Service staff member." });
  transaction(() => {
    const previous = { status: row.status, assignedTo: row.assignedTo }, updatedAt = new Date().toISOString();
    if (parsed.data.status) row.status = parsed.data.status;
    if (parsed.data.assignedTo !== undefined) row.assignedTo = parsed.data.assignedTo;
    row.version++; row.updatedAt = updatedAt;
    row.history.push({ id: randomUUID(), at: updatedAt, by: req.auth!.name, actorId: req.auth!.id, note: parsed.data.note || "", before: previous, status: row.status, assignedTo: row.assignedTo });
    if (assignee && previous.assignedTo !== assignee.id) createNotification({ userId: assignee.id, user: assignee.name, type: "message", severity: "info", message: `Website inquiry ${row.reference} was assigned to you.`, messageKey: "Website inquiry {reference} was assigned to you.", messageValues: { reference: row.reference }, target: `/customer-service?websiteInquiry=${row.id}` });
    audit(req.auth, "website.inquiry-updated", { targetId: row.id, reference: row.reference, before: previous, after: { status: row.status, assignedTo: row.assignedTo } });
    saveStore(getStore());
  });
  res.json({ item: row });
});
