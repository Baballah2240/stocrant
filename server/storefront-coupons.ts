/** Discount codes for the hosted shop: percentage or fixed amount, minimum order, dates and a use limit.
 * Applied to the product subtotal in the server-calculated quote, so prices can't be changed by the browser. */
import { z } from "zod";
import { money, scaled } from "./payroll-model.js";
import { getCollection } from "./storage.js";

type Row = Record<string, any>;
const amount = z.string().trim().regex(/^\d{1,12}(\.\d{1,3})?$/, "Use a positive amount like 500 or 12.50.");
const date = z.union([z.literal(""), z.string().datetime({ offset: true })]).default("");
const coupon = z.object({
  id: z.string().uuid(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,23}$/, "Codes use 3–24 letters, numbers or dashes."),
  kind: z.enum(["percent", "amount"]),
  value: amount,
  minSubtotal: amount.default("0"),
  startsAt: date,
  endsAt: date,
  maxUses: z.number().int().min(0).max(1000000).default(0),
  enabled: z.boolean().default(true),
}).strict()
  .refine(c => c.kind !== "percent" || (Number(c.value) >= 1 && Number(c.value) <= 90 && Number.isInteger(Number(c.value))), "Percentage codes must be a whole number from 1 to 90.")
  .refine(c => c.kind !== "amount" || Number(c.value) > 0, "Enter the discount amount.")
  .refine(c => !c.startsAt || !c.endsAt || Date.parse(c.endsAt) > Date.parse(c.startsAt), "The end must be after the start.");
export const couponsSchema = z.array(coupon).max(50).refine(list => new Set(list.map(c => c.code)).size === list.length, "Each discount code must be different.").default([]);
export type Coupon = z.infer<typeof coupon>;
export function couponsFor(s: Row): Coupon[] { const p = couponsSchema.safeParse(s.coupons ?? []); return p.success ? p.data : []; }
/** Orders that used the code and were not cancelled or expired. */
export function couponUses(storefrontId: string, code: string) {
  return (getCollection("shopOrders") as Row[]).filter(o => o.storefrontId === storefrontId && o.couponCode === code && !["cancelled", "expired"].includes(String(o.status))).length;
}
const fail = (message: string): never => { throw Object.assign(new Error(message), { statusCode: 400 }); };
/** Discount for a code on a product subtotal (in minor units). Throws a customer-readable error when the code can't be used. */
export function couponDiscount(s: Row, rawCode: string, subtotal: bigint, digits: number, now = Date.now()) {
  const code = rawCode.trim().toUpperCase();
  const c = couponsFor(s).find(x => x.code === code);
  if (!c || !c.enabled) fail("This discount code is not valid.");
  if (c!.startsAt && Date.parse(c!.startsAt) > now) fail("This discount code is not active yet.");
  if (c!.endsAt && Date.parse(c!.endsAt) <= now) fail("This discount code has expired.");
  if (c!.maxUses && couponUses(s.id, c!.code) >= c!.maxUses) fail("This discount code has been fully used.");
  const minimum = scaled(c!.minSubtotal, digits);
  if (subtotal < minimum) fail(`This code needs an order of at least ${money(minimum, digits)}.`);
  let off = c!.kind === "percent" ? (subtotal * BigInt(Number(c!.value)) + 50n) / 100n : scaled(c!.value, digits);
  if (off > subtotal) off = subtotal;
  return { code: c!.code, discount: off, label: c!.kind === "percent" ? `${c!.value}%` : money(scaled(c!.value, digits), digits) };
}
