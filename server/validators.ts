import { z } from "zod";

export const storeKindSchema = z.enum(["store", "restaurant", "office", "warehouse"]);
export const zoneKindSchema = z.enum(["floor", "dining", "counter", "back", "restroom", "outdoor", "storage"]);
export const personStatusSchema = z.enum(["active", "leave", "terminated"]);
export const storeStatusSchema = z.enum(["open", "open-limited", "closed"]);

export const storeSchema = z.object({
  id: z.string().optional(),
  companyId: z.string().min(1, "Company is required").optional(),
  name: z.string().min(1, "Store name is required").max(120),
  kind: storeKindSchema.default("restaurant"),
  address: z.string().min(1, "Address is required").max(200),
  city: z.string().min(1, "City is required").max(100),
  totalArea: z.number().int().min(1, "Area must be at least 1 sq m"),
  floorCount: z.number().int().min(1, "At least one floor required").max(50),
  status: storeStatusSchema.default("open"),
  mapLink: z.string().url("Enter a valid map URL").max(2000).optional().or(z.literal("")),
  responsibleEmployee: z.string().max(120).optional(),
  responsibleEmployeeId: z.string().max(160).optional(),
  notes: z.string().max(2000).optional(),
});

export const zoneSchema = z.object({
  id: z.string().optional(),
  storeId: z.string().min(1, "Store ID is required"),
  name: z.string().min(1, "Zone name is required").max(120),
  kind: zoneKindSchema.default("floor"),
  area: z.number().int().min(1, "Area must be at least 1 sq m"),
  capacity: z.number().int().min(0, "Capacity cannot be negative"),
  notes: z.string().max(500).optional(),
});

export const personSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required").max(120),
  role: z.string().min(1, "Role is required").max(120),
  storeId: z.string().min(1, "Store ID is required"),
  zoneId: z.string().min(1).max(120).optional(),
  status: personStatusSchema.default("active"),
  hireDate: z.string().min(1, "Hire date is required").regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  email: z.string().email().max(160).optional(),
  phone: z.string().max(40).optional(),
  notes: z.string().max(500).optional(),
});

export type StoreInput = z.infer<typeof storeSchema>;
export type ZoneInput = z.infer<typeof zoneSchema>;
export type PersonInput = z.infer<typeof personSchema>;

/** Validate and normalize an incoming request body. Throws on failure. */
export function parseJson<T extends z.ZodTypeAny>(schema: T, input: unknown, label: string) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    const err = new Error(message) as Error & { statusCode?: number };
    err.name = "ValidationError";
    throw err;
  }
  return result.data as z.infer<T>;
}
