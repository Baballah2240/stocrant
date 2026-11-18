/**
 * Hotel room bookings: nights and total are calculated on the server, and a checked-out booking becomes a
 * completed sale in Finance exactly once. Until the sale has payments, booking changes update the sale;
 * after payments exist, financial changes are refused so the ledger never silently changes.
 */
import { assertBooksOpen, financialError } from "./finance-ledger.js";
import { getCollection, getStore, nextCollectionId, saveStore } from "./storage.js";
import { money, precision, scaled } from "./payroll-model.js";
type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
const iso = /^\d{4}-\d{2}-\d{2}$/;
const FINANCIAL_FIELDS = ["checkIn", "checkOut", "nightlyRate", "status", "guestName", "organizationId"];
const saleSettled = (saleId: unknown) => Boolean(saleId) && rows("financeTransactions").some(t => t.sourceCollection === "sales" && t.sourceId === saleId);

/** Nights × nightly rate, exact in the company currency. */
export function bookingAmounts(booking: Row, currency: string) {
  const checkIn = String(booking.checkIn || ""), checkOut = String(booking.checkOut || "");
  if (!iso.test(checkIn) || !iso.test(checkOut) || checkOut <= checkIn) financialError("Check-out must be after check-in.");
  const nights = Math.round((Date.parse(checkOut + "T00:00:00Z") - Date.parse(checkIn + "T00:00:00Z")) / 86_400_000);
  const digits = precision(currency);
  let rate: bigint;
  try { rate = scaled(String(booking.nightlyRate ?? ""), digits); } catch { financialError("Enter a valid nightly rate for this currency."); }
  if (rate < 0n) financialError("Enter a valid nightly rate for this currency.");
  return { nights, total: money(rate * BigInt(nights), digits) };
}

/** Called before a booking is saved: validates dates, fills nights and total, and protects settled sales. */
export function prepareBooking(action: string, payload: Row, current?: Row): Row {
  if (action === "delete") {
    if (current?.saleId) financialError("This booking has a sale in Finance. Cancel the booking instead of deleting it.", 409);
    return payload;
  }
  const item = { ...current, ...payload };
  if (current?.saleId && saleSettled(current.saleId) && FINANCIAL_FIELDS.some(key => key in payload && String(payload[key] ?? "") !== String(current[key] ?? ""))) financialError("This booking's sale already has payments. Record a correction in Finance instead of changing the booking.", 409);
  const company = rows("companies").find(c => c.id === item.organizationId);
  return { ...payload, ...bookingAmounts(item, String(company?.currency || "QAR")) };
}

/** Called after a booking is saved: create, update or cancel its sale. */
export function syncBookingSale(booking: Row | undefined) {
  if (!booking) return;
  const data = getStore(), sales = rows("sales"), sale = booking.saleId ? sales.find(s => s.id === booking.saleId) : undefined;
  const company = rows("companies").find(c => c.id === booking.organizationId), currency = String(company?.currency || "QAR"), digits = precision(currency);
  if (sale && saleSettled(sale.id)) return;
  if (booking.status === "cancelled" || booking.status === "no show") {
    if (sale && sale.status !== "cancelled") { assertBooksOpen(sale.organizationId, sale.date); Object.assign(sale, { status: "cancelled", updatedAt: new Date().toISOString() }); saveStore(data); }
    return;
  }
  if (booking.status !== "checked out" && !sale) return;
  const total = scaled(String(booking.total), digits), vatRate = Number(company?.vatRate || 0);
  // Room rates are treated as VAT-inclusive when the company has a VAT rate.
  const tax = vatRate > 0 ? total * BigInt(Math.round(vatRate * 100)) / BigInt(Math.round((100 + vatRate) * 100)) : 0n;
  const values = { organizationId: booking.organizationId, invoiceNo: `BK-${booking.id}`, date: booking.checkOut, customer: booking.guestName, channel: "in-store", items: booking.nights, subtotal: money(total - tax, digits), tax: money(tax, digits), total: money(total, digits), payment: "credit", status: booking.status === "checked out" ? "completed" : "pending", currency, bookingId: booking.id, source: "roomBookings" };
  assertBooksOpen(booking.organizationId, booking.checkOut);
  if (sale) { if (sale.date !== values.date) assertBooksOpen(sale.organizationId, sale.date); Object.assign(sale, values, { updatedAt: new Date().toISOString() }); }
  else { const created = { id: nextCollectionId("sales"), ...values, createdAt: new Date().toISOString(), dataClassification: "company" }; data.collections.sales = [...sales, created]; booking.saleId = created.id; }
  saveStore(data);
}
