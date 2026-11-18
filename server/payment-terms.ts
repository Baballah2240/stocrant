/** Payment terms shared by sales, purchases and expenses (Odoo-style "Net N days"). */
export const paymentTermDays: Readonly<Record<string, number>> = { immediate: 0, net7: 7, net15: 15, net30: 30, net45: 45, net60: 60, net90: 90 };
export const paymentTermOptions = Object.keys(paymentTermDays);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Explicit due date wins; otherwise document date plus the term's days; otherwise the document date. */
export function documentDueDate(row: { [key: string]: unknown }): string {
  const explicit = String(row.dueDate ?? "").slice(0, 10), date = String(row.date ?? "").slice(0, 10);
  if (isoDate.test(explicit) && Number.isFinite(Date.parse(explicit + "T00:00:00Z"))) return explicit;
  if (!isoDate.test(date)) return "";
  const start = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(start)) return "";
  const days = paymentTermDays[String(row.paymentTerms ?? "")] ?? 0;
  return new Date(start + days * 86_400_000).toISOString().slice(0, 10);
}
