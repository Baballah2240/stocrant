/** Key figures for a company's overview, chosen by its business type. Read-only and permission-aware. */
import type { AuthenticatedUser } from "./auth.js";
import { settlementRows } from "./finance-ledger.js";
import { money, precision, scaled } from "./payroll-model.js";
import { can, isWithinScope } from "./permissions.js";
import { getCollection } from "./storage.js";
type Row = Record<string, any>;
export interface Kpi { id: string; label: string; value: string; kind: "money" | "count" | "percent"; hint?: string; hintValues?: Record<string, string | number>; tone?: "good" | "warn" | "bad"; link?: string }
const rows = (name: string) => getCollection(name) as Row[];
const localDate = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: process.env.STOCRANT_TIME_ZONE || "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export function companyKpis(user: AuthenticatedUser, companyId: string, now = new Date()) {
  const company = rows("companies").find(c => c.id === companyId);
  if (!company || !isWithinScope(user, { ...company, organizationId: company.id })) throw Object.assign(new Error("Company not found."), { statusCode: 404 });
  const today = localDate(now), month = today.slice(0, 7), currency = String(company.currency || "QAR"), digits = precision(currency), id = encodeURIComponent(companyId);
  const own = (name: string) => rows(name).filter(r => r.organizationId === companyId && isWithinScope(user, r));
  const finance = can(user, "finance", "view"), operations = can(user, "operations", "view"), inventory = can(user, "inventory", "view"), service = can(user, "customerService", "view");
  const sum = (list: Row[], key: string) => { let total = 0n; for (const r of list) { try { total += scaled(String(r[key] ?? 0), digits); } catch { /* invalid legacy amounts are ignored */ } } return money(total, digits); };
  const sales = own("sales").filter(s => s.status === "completed" && (!s.currency || s.currency === currency));
  const kpis: Kpi[] = [];
  const salesKpis = () => { if (!finance) return; kpis.push({ id: "salesToday", label: "Sales today", value: sum(sales.filter(s => String(s.date).slice(0, 10) === today), "total"), kind: "money", hint: "{count} sales", hintValues: { count: sales.filter(s => String(s.date).slice(0, 10) === today).length }, link: `/finance?tab=Sales&company=${id}&period=today` }, { id: "salesMonth", label: "Sales this month", value: sum(sales.filter(s => String(s.date).startsWith(month)), "total"), kind: "money", link: `/finance?tab=Sales&company=${id}&period=month` }); };
  const receivables = () => { if (!finance) return; const open = sales.map(s => settlementRows("sales", s)).filter(s => s.outstanding !== null && Number(s.outstanding) > 0); kpis.push({ id: "receivable", label: "Unpaid invoices", value: money(open.reduce((n, s) => n + scaled(String(s.outstanding), digits), 0n), digits), kind: "money", hint: "{count} invoices", hintValues: { count: open.length }, tone: open.length ? "warn" : "good", link: `/finance?tab=Aged%20balances&company=${id}` }); };
  const type = company.organizationType === "store" ? "shop" : company.organizationType === "office" ? "services" : String(company.organizationType || "mixed");
  if (type === "hotel" && operations) {
    const rooms = own("hotelRooms"), bookings = own("roomBookings").filter(b => !["cancelled", "no show"].includes(String(b.status)));
    const inHouse = bookings.filter(b => b.checkIn <= today && b.checkOut > today && b.status !== "checked out");
    const usable = rooms.filter(r => r.status !== "maintenance").length;
    kpis.push(
      { id: "occupancy", label: "Occupancy tonight", value: String(usable ? Math.round(inHouse.length / usable * 100) : 0), kind: "percent", hint: "{used} of {rooms} rooms", hintValues: { used: inHouse.length, rooms: usable }, link: `/stores/roomBookings?company=${id}` },
      { id: "arrivals", label: "Arrivals today", value: String(bookings.filter(b => b.checkIn === today && b.status === "reserved").length), kind: "count", link: `/stores/roomBookings?company=${id}&status=reserved` },
      { id: "departures", label: "Departures today", value: String(bookings.filter(b => b.checkOut === today && b.status === "checked in").length), kind: "count", link: `/stores/roomBookings?company=${id}&status=checked%20in` },
      { id: "cleaning", label: "Rooms to clean", value: String(rooms.filter(r => r.status === "cleaning").length), kind: "count", tone: rooms.some(r => r.status === "cleaning") ? "warn" : "good", link: `/stores/hotelRooms?company=${id}&status=cleaning` },
    );
  }
  if (type === "restaurant" && operations) {
    const tables = own("diningTables"), menu = own("menuItems");
    kpis.push(
      { id: "tables", label: "Tables in use", value: String(tables.filter(t => t.status === "occupied").length), kind: "count", hint: "{free} free · {reserved} reserved", hintValues: { free: tables.filter(t => t.status === "free").length, reserved: tables.filter(t => t.status === "reserved").length }, link: `/stores/diningTables?company=${id}` },
      { id: "soldOut", label: "Menu items sold out", value: String(menu.filter(m => m.status === "sold out").length), kind: "count", hint: "{count} items available", hintValues: { count: menu.filter(m => m.status === "available").length }, tone: menu.some(m => m.status === "sold out") ? "warn" : "good", link: `/stores/menuItems?company=${id}&status=sold%20out` },
    );
  }
  if ((type === "shop" || type === "restaurant") && inventory) {
    const low = own("inventoryItems").filter(i => Number(i.qty ?? i.onHand ?? 0) <= Number(i.reorderPoint ?? 0) && i.status !== "quarantine");
    kpis.push({ id: "lowStock", label: type === "restaurant" ? "Kitchen stock to reorder" : "Products to reorder", value: String(low.length), kind: "count", tone: low.length ? "bad" : "good", link: "/warehouse" });
  }
  if (type === "shop" && inventory && operations) {
    const waiting = own("shopOrders").filter(o => !["dispatched", "delivered", "cancelled"].includes(String(o.status)));
    kpis.push({ id: "ordersWaiting", label: "Orders waiting", value: String(waiting.length), kind: "count", tone: waiting.length ? "warn" : "good", link: `/shops?company=${id}&tab=orders` });
  }
  if (type === "services" && service) {
    const appointments = own("customerAppointments").filter(a => !["cancelled", "no-show"].includes(String(a.status)));
    const todays = appointments.filter(a => localDate(new Date(String(a.appointmentAt))) === today);
    kpis.push({ id: "appointmentsToday", label: "Appointments today", value: String(todays.length), kind: "count", hint: "{count} still to come", hintValues: { count: todays.filter(a => a.status !== "completed" && Date.parse(String(a.appointmentAt)) > now.getTime()).length }, link: "/customer-service" });
  }
  salesKpis();
  receivables();
  return { type, currency, asOf: today, kpis };
}
