import { renderCompanyWebsite } from "./company-website.js";
import { Router } from "express";
import { z } from "zod";
import { getCollection, getStore, saveStore, transaction } from "./storage.js";
import { can, isMainManager, isWithinScope, ownRecordsRequired } from "./permissions.js";
import { audit } from "./workspace.js";

type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
const copy = z.string().trim().max(3000);
const inputSchema = z.object({
  shortcuts: z.array(z.enum(["hr", "finance", "inventory", "operations", "shops"])).max(5),
  version: z.number().int().nonnegative(), websiteEnabled: z.boolean(), published: z.boolean(),
  slug: z.string().trim().max(70).regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/),
  language: z.enum(["en", "ar"]), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  title: z.string().trim().max(160), titleAr: z.string().trim().max(160),
  tagline: z.string().trim().max(300), taglineAr: z.string().trim().max(300),
  about: copy, aboutAr: copy, services: copy, servicesAr: copy,
  email: z.union([z.literal(""), z.string().trim().email().max(160)]),
  phone: z.string().trim().max(40).regex(/^[+\d\s().-]*$/).refine(value => !value || value.replace(/\D/g, "").length >= 6), address: z.string().trim().max(400),
}).strict();

export function companyServiceSettings(company: Row) {
  return rows("companyServiceSettings").find(row => row.organizationId === company.id) || {
    organizationId: company.id, version: 0, shortcuts: ["hr", "finance", "inventory", "operations", "shops"], websiteEnabled: false, published: false, slug: "",
    language: "en", accent: "#34786b", title: String(company.tradeName || company.name || ""), titleAr: "",
    tagline: "", taglineAr: "", about: "", aboutAr: "", services: "", servicesAr: "",
    email: "", phone: "", address: "",
  };
}

export const companyServicesRouter = Router();
companyServicesRouter.get("/:id", (req, res) => {
  const user = req.auth!;
  const company = rows("companies").find(row => row.id === req.params.id && isWithinScope(user, { ...row, organizationId: row.id }));
  if (!company || !can(user, "organizations", "view") || ownRecordsRequired(user)) return res.status(404).json({ error: "Company not found." });
  const settings = companyServiceSettings(company);
  return res.json({ settings, availableModules: ["hr", "finance", "inventory", "operations", "shops"].filter(section => can(user, section as any, "view")), url: settings.slug ? `/company/${settings.slug}` : null,
    permissions: { edit: isMainManager(user) || can(user, "organizations", "edit"), provision: isMainManager(user) } });
});
companyServicesRouter.put("/:id", (req, res) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check the website fields, language, color and address." });
  const user = req.auth!;
  const company = rows("companies").find(row => row.id === req.params.id && isWithinScope(user, { ...row, organizationId: row.id }));
  if (!company) return res.status(404).json({ error: "Company not found." });
  if (!can(user, "organizations", "edit") || ownRecordsRequired(user)) return res.status(403).json({ error: "Company edit permission is required." });
  return transaction(() => {
    const previous = companyServiceSettings(company), input = parsed.data;
    if (input.version !== previous.version) return res.status(409).json({ error: "Company settings changed. Reload before saving." });
    if (input.websiteEnabled !== previous.websiteEnabled && !isMainManager(user)) return res.status(403).json({ error: "Only the Super Admin can enable or disable the website service." });
    if (input.slug && rows("companyServiceSettings").some(row => row.organizationId !== company.id && row.slug === input.slug)) return res.status(409).json({ error: "This website address is already in use." });
    const parent = rows("organizations").find(row => row.id === company.parentOrganizationId);
    if (input.published && (!input.websiteEnabled || company.status !== "active" || parent?.status !== "active" || !input.slug || !(input.language === "ar" ? input.titleAr && input.aboutAr : input.title && input.about) || !(input.email || input.phone))) return res.status(400).json({ error: "Enable the service and complete the website title, introduction, address and public contact before publishing." });
    const settings = { ...input, id: `company-service-${company.id}`, organizationId: company.id, version: previous.version + 1, updatedAt: new Date().toISOString(), updatedBy: user.id };
    const data = getStore();
    data.collections.companyServiceSettings = [...rows("companyServiceSettings").filter(row => row.organizationId !== company.id), settings];
    audit(user, "company.services-updated", { collection: "companies", targetId: company.id, version: settings.version, websiteEnabled: settings.websiteEnabled, published: settings.published });
    saveStore(data);
    return res.json({ settings, url: settings.slug ? `/company/${settings.slug}` : null });
  });
});

/** Public pages have an explicit allowlist. Never serialize the internal company record. */
export const companyWebsiteRouter = Router();
companyWebsiteRouter.get("/:slug", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const settings = rows("companyServiceSettings").find(row => row.slug === req.params.slug && row.websiteEnabled && row.published);
  const company = settings && rows("companies").find(row => row.id === settings.organizationId && row.status === "active");
  const parent = company && rows("organizations").find(row => row.id === company.parentOrganizationId);
  if (!settings || !company || parent?.status !== "active") return res.status(404).type("text").send("Website not available.");
  const ar = (req.query.lang === "ar" || req.query.lang !== "en" && settings.language === "ar");
  const store = rows("shopStorefronts").find(row => row.organizationId === company.id && row.published && row.slug);
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  return res.type("html").send(renderCompanyWebsite(settings, store, ar));
});
