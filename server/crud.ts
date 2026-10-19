import { payrollList } from "./payroll.js";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { registry, type EntitySpec, type FieldSpec } from "./registry.js";
import {
  listCollection,
  getCollectionItem,
} from "./storage.js";
import { can, isWithinScope, redactRecord, sectionForCollection } from "./permissions.js";
import { mutateCollection } from "./workspace.js";

/** Turn registry field metadata into a permissive-but-safe Zod schema. */
export function buildSchema(fields: FieldSpec[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    let base: z.ZodTypeAny;
    switch (field.type) {
      case "number":
      case "currency":
      case "percent": {
        let num = z.coerce.number();
        if (field.min !== undefined) num = num.min(field.min);
        if (field.max !== undefined) num = num.max(field.max);
        base = num as z.ZodNumber;
        break;
      }
      case "email":
        base = field.required ? z.string().email("Enter a valid email") : z.string().email().optional().or(z.literal(""));
        break;
      case "select":
        base = field.required && !field.options?.length
          ? z.string().min(1, `${field.label} is required`)
          : z.string();
        break;
      default:
        base = field.required ? z.string().min(1, `${field.label} is required`) : z.string().optional();
        break;
    }
    shape[field.key] = field.required && field.type !== "email" ? base : base;
    if (!field.required && (field.type === "number" || field.type === "currency" || field.type === "percent")) {
      shape[field.key] = z.coerce.number().optional().default(0);
    }
  }
  return z.object(shape).catchall(z.unknown());
}

export function validateEntity(spec: EntitySpec, body: unknown, path?: Request["path"]) {
  const schema = buildSchema(spec.fields);
  const result = schema.safeParse(body);
  if (!result.success) {
    const err = new Error(
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    ) as Error & { statusCode?: number };
    err.name = "ValidationError";
    throw err;
  }
  return result.data as Record<string, unknown>;
}

function sendError(res: Response, err: unknown) {
  const status = (err as Error & { statusCode?: number })?.statusCode;
  if ((err as Error)?.name === "ValidationError") {
    return res.status(400).json({ error: (err as Error).message });
  }
  const message = err instanceof Error ? err.message : "Request failed";
  return res.status(status ?? (/permission|scope/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400)).json({ error: message });
}

/** One collection = full CRUD under /api/collections/:name, driven by registry. */
export function createCollectionRouter(spec: EntitySpec): Router {
  const router = Router({ mergeParams: true });
  const section = sectionForCollection(spec.collection);

  router.get("/", (req: Request, res: Response) => {
    if (!req.auth || !can(req.auth, section, "view")) return res.status(403).json({ error: "You do not have permission to view this section." });
    if(spec.collection === "payroll") return res.json({items:payrollList(req.auth).legacy,entity:"payroll"});
    const items = listCollection(spec.collection)
      .filter((item) => isWithinScope(req.auth!, item))
      .map((item) => redactRecord(spec.collection, item, req.auth!));
    res.json({ items, entity: spec.collection });
  });

  router.get("/:id", (req: Request, res: Response) => {
    if (!req.auth || !can(req.auth, section, "view")) return res.status(403).json({ error: "You do not have permission to view this section." });
    if(spec.collection === "payroll") { const item=payrollList(req.auth).legacy.find(row=>row.id===req.params.id);return item?res.json({item}):res.status(404).json({error:"Payslip not found."}); }
    const item = getCollectionItem(spec.collection, req.params.id as string);
    if (!item) return res.status(404).json({ error: `${spec.singular} not found.` });
    if (!isWithinScope(req.auth, item)) return res.status(404).json({ error: `${spec.singular} not found.` });
    res.json({ item: redactRecord(spec.collection, item, req.auth) });
  });

  router.post("/", (req: Request, res: Response) => {
    if (!req.auth || !can(req.auth, section, "create")) return res.status(403).json({ error: "You do not have permission to create this record." });
    try {
      const input = validateEntity(spec, req.body);
      if (spec.collection === "employees") {
        const company = getCollectionItem("companies", String(input.organizationId ?? ""));
        if (!company || !isWithinScope(req.auth, { ...company, organizationId: company.id })) return res.status(400).json({ error: "Choose a valid company for this employee." });
      }
      const result = mutateCollection(req.auth, spec.collection, "create", input);
      res.status(result.pending ? 202 : 201).json({ ...result, entity: spec.collection });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch("/:id", (req: Request, res: Response) => {
    if (!req.auth || !can(req.auth, section, "edit")) return res.status(403).json({ error: "You do not have permission to edit this record." });
    const existing = getCollectionItem(spec.collection, req.params.id as string);
    if (!existing) return res.status(404).json({ error: `${spec.singular} not found.` });
    if (!isWithinScope(req.auth, existing)) return res.status(404).json({ error: `${spec.singular} not found.` });
    try {
      const input = validateEntity(spec, { ...existing, ...req.body });
      if (spec.collection === "employees" && (input.organizationId || req.body.organizationId !== undefined)) {
        const company = getCollectionItem("companies", String(input.organizationId ?? ""));
        if (!company || !isWithinScope(req.auth, { ...company, organizationId: company.id })) return res.status(400).json({ error: "Choose a valid company for this employee." });
      }
      const result = mutateCollection(req.auth, spec.collection, "edit", input, req.params.id as string);
      res.status(result.pending ? 202 : 200).json({ ...result, entity: spec.collection });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete("/:id", (req: Request, res: Response) => {
    if (!req.auth || !can(req.auth, section, "delete")) return res.status(403).json({ error: "You do not have permission to delete this record." });
    const existing = getCollectionItem(spec.collection, req.params.id as string);
    if (!existing || !isWithinScope(req.auth, existing)) return res.status(404).json({ error: `${spec.singular} not found.` });
    try {
      const result = mutateCollection(req.auth, spec.collection, "delete", {}, req.params.id as string);
      res.status(result.pending ? 202 : 200).json({ ...result, ok: !result.pending, entity: spec.collection });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}

export function collectionsMeta(): EntitySpec[] {
  return registry;
}

export function requireJson(_req: Request, _res: Response, next: NextFunction) {
  next();
}
