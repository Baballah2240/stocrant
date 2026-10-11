import { Router } from "express";
import { z } from "zod";
import { blockedFor, recordFailure } from "../rate-limit.js";
import { getCollection, getStore, nextCollectionId, saveStore } from "../storage.js";
import { requireAuth } from "../auth.js";
import { isMainManager } from "../permissions.js";

const router = Router();
router.get("/info", (_req, res) => res.json({ email: process.env.STOCRANT_CONTACT_EMAIL || "", phone: process.env.STOCRANT_CONTACT_PHONE || "" }));
router.post("/contact", (req, res) => {
  const key = `contact:${req.ip ?? "unknown"}`;
  if (blockedFor(key)) return res.status(429).json({ error: "Too many messages. Please try again later." });
  recordFailure(key);
  const parsed = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160), company: z.string().trim().max(160), message: z.string().trim().min(10).max(3000), website: z.string().max(200).optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter your name, valid email and a message of at least 10 characters." });
  if (parsed.data.website) return res.status(200).json({ ok: true });
  const items = getCollection("contactInquiries") as Record<string, unknown>[];
  if (items.length >= 5000) return res.status(503).json({ error: "The contact inbox is currently full. Please use the listed contact details." });
  const { website: _website, ...input } = parsed.data;
  const data = getStore();
  data.collections.contactInquiries = [...items, { ...input, id: nextCollectionId("contactInquiries"), createdAt: new Date().toISOString() }];
  saveStore(data);
  res.status(201).json({ ok: true });
});
router.get("/inquiries", requireAuth, (req, res) => {
  if (!isMainManager(req.auth!)) return res.status(403).json({ error: "Only the main admin can view contact inquiries." });
  res.json({ items: [...getCollection("contactInquiries")].reverse() });
});
export default router;
