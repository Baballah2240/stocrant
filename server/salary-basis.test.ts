import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "./app.js";
import { getStore, saveStore } from "./storage.js";
import { rulesSchema } from "./payroll-model.js";
type Row = Record<string, any>;
let server: Server, base = "", cookie = "";
const call = (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") => fetch(`${base}/api${path}`, { method, headers: { Cookie: cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function expect(response: Response, code = 200): Promise<Row> { assert.equal(response.status, code, await response.clone().text()); return response.json() as Promise<Row>; }
before(async () => {
  server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(done => server.once("listening", done)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const setup = await call("/auth/setup", { name: "Salary basis admin", email: "basis@example.test", password: randomBytes(24).toString("hex"), setupKey: "local-setup" }); await expect(setup, 201); cookie = setup.headers.get("set-cookie")!.split(";")[0];
});
after(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); const target = resolve(TEST_DATA_DIR); assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes("stocrant-test-data-")); fs.rmSync(target, { recursive: true, force: true }); });

async function companyWith(basis: string, name: string) {
  const org = (await expect(await call("/collections/organizations", { name: name + " organization", status: "active" }), 201)).item;
  const company = (await expect(await call("/collections/companies", { name, parentOrganizationId: org.id, status: "active", organizationType: "office", industry: "services", currency: "QAR", salaryCountingBasis: basis, fiscalYearStart: "April", defaultPaymentTerms: "net30", vatRate: 5, vatNumber: "VAT-123" }), 201)).item;
  const initial = (await expect(await call(`/workspace/payroll/rules/${company.id}`))).rules;
  await expect(await call(`/workspace/payroll/rules/${company.id}`, { ...Object.fromEntries(Object.keys(rulesSchema.shape).map(key => [key, initial[key]])), workingDays: [0, 1, 2, 3, 4, 5, 6], policy: "Salary basis regression policy" }, "PUT"));
  const employee = (await expect(await call("/collections/employees", { name: name + " worker", organizationId: company.id, status: "active", hireDate: "2026-08-01" }), 201)).item;
  await expect(await call(`/workspace/payroll/salaries/${employee.id}`, { currency: "QAR", frequency: "monthly", base: "3000", overtimeEligible: false, shiftId: "", allowances: [], effectiveFrom: "2026-08-01", reason: "Salary basis fixture" }), 201);
  return { company, employee };
}
const run = async (companyId: string, employeeId: string, start: string, end: string, code = 201) => {
  const period = { companyId, frequency: "monthly", start, end, employeeIds: [employeeId] };
  const preview = await call("/workspace/payroll/preview", period);
  if (code !== 201) { assert.equal(preview.status, code, await preview.clone().text()); return (await preview.json()) as Row; }
  const data = await expect(preview);
  return { preview: data, run: (await expect(await call("/workspace/payroll/runs", { period, previewToken: data.previewToken }), 201)).run };
};

it("company settings are saved and the salary basis changes each employee's counted period", async () => {
  const lastPaid = await companyWith("from last salary paid", "Last paid company");
  assert.equal(lastPaid.company.salaryCountingBasis, "from last salary paid");
  assert.equal(lastPaid.company.fiscalYearStart, "April");
  // First salary: never paid, so counted from the assignment date (August) through September.
  const first = await run(lastPaid.company.id, lastPaid.employee.id, "2026-09-01", "2026-09-30") as Row;
  const firstEntry = (getStore().collections.payrollEntries as Row[]).find(e => e.runId === first.run.id) as Row;
  assert.equal(firstEntry.periodStart, "2026-08-01");
  assert.equal(firstEntry.basic, "6000.00");
  // October was skipped; the November run continues from the day after the last counted period, so October is included.
  const next = await run(lastPaid.company.id, lastPaid.employee.id, "2026-11-01", "2026-11-30") as Row;
  const nextEntry = (getStore().collections.payrollEntries as Row[]).find(e => e.runId === next.run.id) as Row;
  assert.equal(nextEntry.periodStart, "2026-10-01");
  assert.equal(nextEntry.basic, "6000.00");
  // Already counted through November: running November again is refused instead of paying twice.
  const blocked = await run(lastPaid.company.id, lastPaid.employee.id, "2026-11-01", "2026-11-30", 409);
  assert.match(String(blocked.error), /already counted through 2026-11-30/);

  const assignment = await companyWith("from assignment date", "Assignment company");
  const fromHire = await run(assignment.company.id, assignment.employee.id, "2026-09-01", "2026-09-30") as Row;
  assert.equal(((getStore().collections.payrollEntries as Row[]).find(e => e.runId === fromHire.run.id) as Row).basic, "6000.00");

  const periodStart = await companyWith("from payroll period start", "Period company");
  const fromPeriod = await run(periodStart.company.id, periodStart.employee.id, "2026-09-01", "2026-09-30") as Row;
  const periodEntry = (getStore().collections.payrollEntries as Row[]).find(e => e.runId === fromPeriod.run.id) as Row;
  assert.equal(periodEntry.periodStart, "2026-09-01");
  assert.equal(periodEntry.basic, "3000.00");
});

it("company default payment terms set the due date of documents without their own terms", async () => {
  const data = getStore(), company = (data.collections.companies as Row[]).find(c => c.name === "Last paid company")!;
  (data.collections.sales as Row[]).push({ id: "terms-sale", organizationId: company.id, invoiceNo: "INV-TERMS", date: "2026-11-01", customer: "Terms customer", total: 100, status: "completed" });
  saveStore(data);
  const finance = await expect(await call("/workspace/finance"));
  assert.equal(finance.sources.find((s: Row) => s.id === "terms-sale").dueDate, "2026-12-01");
});

it("salary transfer file lists bank and mobile-money details, and the end-of-service report follows the company rule", async () => {
  const data = getStore(), runs = data.collections.payrollRuns as Row[], entries = data.collections.payrollEntries as Row[], employees = data.collections.employees as Row[], companies = data.collections.companies as Row[];
  const company = companies.find(c => c.name === "Period company")!, employee = employees.find(e => e.organizationId === company.id)!;
  Object.assign(employee, { salaryPaymentMethod: "mobile money", mobileWalletProvider: "Bankak", mobileWalletNumber: "0912345678" });
  Object.assign(company, { gratuityDaysPerYear: 30, gratuityDaysAfterFiveYears: 30, gratuityMinimumYears: 0 });
  const run = runs.find(r => entries.some(e => e.runId === r.id && e.employeeId === employee.id))!;
  saveStore(data);
  assert.equal((await call(`/workspace/payroll/runs/${run.id}/bank-file`)).status, 409); // draft runs cannot be paid
  run.status = "Approved"; saveStore(getStore());
  const file = await call(`/workspace/payroll/runs/${run.id}/bank-file`);
  assert.equal(file.status, 200);
  const csv = await file.text();
  assert.match(csv, /"mobile money","","","Bankak","0912345678","3000\.00","QAR","SAL-2026-09-[^"]+",""/);
  const report = await expect(await call(`/workspace/payroll/end-of-service?company=${company.id}`));
  const line = report.employees.find((e: Row) => e.employeeId === employee.id);
  assert.equal(report.companies[0].configured, true);
  assert.ok(line.years > 0.2 && Number(line.liability) > 0, JSON.stringify(line));
});

it("company types: new types save, earlier types map to their current equivalents, and type registers work", async () => {
  const org = (await expect(await call("/collections/organizations", { name: "Types organization", status: "active" }), 201)).item;
  const make = async (organizationType: string, extra: Row = {}) => (await expect(await call("/collections/companies", { name: "Type " + organizationType + Math.random(), parentOrganizationId: org.id, status: "active", organizationType, industry: "mixed", currency: "SDG", ...extra }), 201)).item;
  const hotel = await make("hotel");
  assert.equal(hotel.organizationType, "hotel");
  assert.equal((await make("services", { serviceCategory: "clinic" })).serviceCategory, "clinic");
  const office = await make("office");
  assert.equal(office.organizationType, "services"); assert.equal(office.serviceCategory, "office");
  assert.equal((await make("store")).organizationType, "shop");
  assert.equal((await call("/collections/companies", { name: "Bad type", parentOrganizationId: org.id, status: "active", organizationType: "spaceship", industry: "mixed", currency: "SDG" })).status, 400);
  const booking = (await expect(await call("/collections/roomBookings", { organizationId: hotel.id, guestName: "Guest", roomNumber: "101", checkIn: "2026-12-01", checkOut: "2026-12-03", nightlyRate: 15000, status: "reserved" }), 201)).item;
  assert.equal(booking.organizationId, hotel.id);
  assert.equal((await call("/collections/menuItems", { organizationId: hotel.id, name: "Ful medames", category: "breakfast", price: 2500, status: "available" })).status, 201);
});

it("hotel bookings: nights and total are calculated, check-out creates one sale, and paid sales are protected", async () => {
  const org = (await expect(await call("/collections/organizations", { name: "Hotel organization", status: "active" }), 201)).item;
  const hotel = (await expect(await call("/collections/companies", { name: "Nile Hotel", parentOrganizationId: org.id, status: "active", organizationType: "hotel", industry: "hospitality", currency: "SDG", vatRate: 17 }), 201)).item;
  const booking = (await expect(await call("/collections/roomBookings", { organizationId: hotel.id, guestName: "Amna", roomNumber: "204", checkIn: "2026-12-01", checkOut: "2026-12-03", nightlyRate: 15000, total: 1, status: "reserved" }), 201)).item;
  assert.equal(booking.nights, 2); assert.equal(booking.total, "30000.00"); // client total is ignored
  assert.equal(booking.saleId, undefined);
  assert.equal((await call("/collections/roomBookings", { organizationId: hotel.id, guestName: "Bad", roomNumber: "1", checkIn: "2026-12-05", checkOut: "2026-12-05", nightlyRate: 100, status: "reserved" })).status, 400);
  const patch = (id: string, body: Row) => call(`/collections/roomBookings/${id}`, body, "PATCH");
  await expect(await patch(booking.id, { status: "checked out" }));
  const sales = () => (getStore().collections.sales as Row[]).filter(s => s.bookingId === booking.id);
  assert.equal(sales().length, 1);
  const sale = sales()[0];
  assert.deepEqual([sale.invoiceNo, sale.date, sale.customer, sale.total, sale.tax, sale.status], [`BK-${booking.id}`, "2026-12-03", "Amna", "30000.00", "4358.97", "completed"]);
  await expect(await patch(booking.id, { status: "checked out" }));
  assert.equal(sales().length, 1); // saving again never creates a second sale
  await expect(await patch(booking.id, { nightlyRate: 20000 }));
  assert.equal(sales()[0].total, "40000.00");
  // Once the sale has a payment, financial changes to the booking are refused.
  const data = getStore(); (data.collections.financeTransactions as Row[]).push({ id: "booking-pay", organizationId: hotel.id, sourceCollection: "sales", sourceId: sale.id, status: "paid", amount: "1000.00", direction: "in", type: "income", currency: "SDG" }); saveStore(data);
  assert.equal((await patch(booking.id, { nightlyRate: 1 })).status, 409);
  assert.equal((await call(`/collections/roomBookings/${booking.id}`, undefined, "DELETE")).status, 409);
  // A cancelled booking cancels its unpaid sale.
  const other = (await expect(await call("/collections/roomBookings", { organizationId: hotel.id, guestName: "Omer", roomNumber: "101", checkIn: "2026-12-10", checkOut: "2026-12-11", nightlyRate: 10000, status: "checked out" }), 201)).item;
  const otherSale = (getStore().collections.sales as Row[]).find(s => s.bookingId === other.id)!;
  assert.equal(otherSale.status, "completed");
  await expect(await patch(other.id, { status: "cancelled" }));
  assert.equal((getStore().collections.sales as Row[]).find(s => s.id === otherSale.id)!.status, "cancelled");
});

it("company setup checklist and licence expiry reminders", async () => {
  const { generateLicenseExpiryAlerts } = await import("./company-setup.js");
  const org = (await expect(await call("/collections/organizations", { name: "Setup organization", status: "active" }), 201)).item;
  const company = (await expect(await call("/collections/companies", { name: "Setup Co", parentOrganizationId: org.id, status: "active", organizationType: "shop", industry: "retail", currency: "SDG" }), 201)).item;
  let setup = await expect(await call(`/workspace/companies/${company.id}/setup`));
  const item = (id: string) => setup.items.find((i: Row) => i.id === id);
  assert.equal(item("type").done, true); assert.equal(item("eos").done, false); assert.equal(item("registration").done, false);
  assert.ok(setup.done < setup.total);
  // Saving from the company page with optional settings left empty must work; VAT 17% without a number is not done.
  await expect(await call(`/collections/companies/${company.id}`, { fiscalYearStart: "January", vatRate: "17", vatNumber: "", exchangeRateSource: "", salaryCountingBasis: "from last salary paid", gratuityDaysPerYear: "30", gratuityDaysAfterFiveYears: "", booksLockedUntil: "" }, "PATCH"));
  setup = await expect(await call(`/workspace/companies/${company.id}/setup`));
  assert.equal(item("fiscal").done, true); assert.equal(item("eos").done, true); assert.equal(item("vat").done, false);
  // Licences: an expired commercial registration is flagged and notifies once per stage.
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await expect(await call("/collections/companyLicenses", { organizationId: company.id, licenseType: "commercial registration", number: "CR-1", expiryDate: "2025-01-01", status: "active" }), 201);
  await expect(await call("/collections/companyLicenses", { organizationId: company.id, licenseType: "municipality licence", number: "ML-9", expiryDate: soon, status: "active" }), 201);
  setup = await expect(await call(`/workspace/companies/${company.id}/setup`));
  assert.equal(item("registration").done, true); assert.equal(item("licensesCurrent").done, false);
  assert.deepEqual(setup.licenses.map((l: Row) => l.status), ["expired", "expiring"]);
  const first = generateLicenseExpiryAlerts(), again = generateLicenseExpiryAlerts();
  assert.ok(first >= 2); assert.equal(again, 0);
  const notes = (getStore().collections.notifications as Row[]).filter(n => n.type === "license_expiry");
  assert.ok(notes.some(n => n.messageKey === "A company licence has expired: {type} for {company}." && n.severity === "critical"));
  assert.ok(notes.some(n => n.messageKey === "A company licence expires in {days} days: {type} for {company}."));
});

it("company overview figures follow the company type", async () => {
  const { companyKpis } = await import("./company-kpis.js");
  const org = (await expect(await call("/collections/organizations", { name: "KPI organization", status: "active" }), 201)).item;
  const make = async (organizationType: string) => (await expect(await call("/collections/companies", { name: "KPI " + organizationType, parentOrganizationId: org.id, status: "active", organizationType, industry: "mixed", currency: "SDG" }), 201)).item;
  const now = new Date("2026-12-15T09:00:00Z"), today = "2026-12-15";
  const hotel = await make("hotel"), restaurant = await make("restaurant");
  const data = getStore(), c = data.collections as Record<string, Row[]>;
  (c.hotelRooms ||= []).push(...["101", "102", "103", "104"].map((roomNumber, i) => ({ id: `kpi-room-${i}`, organizationId: hotel.id, roomNumber, roomType: "double", nightlyRate: 100, status: i === 3 ? "maintenance" : i === 2 ? "cleaning" : "available" })));
  (c.roomBookings ||= []).push(
    { id: "kpi-b1", organizationId: hotel.id, guestName: "A", roomNumber: "101", checkIn: "2026-12-14", checkOut: "2026-12-16", status: "checked in", nightlyRate: 100 },
    { id: "kpi-b2", organizationId: hotel.id, guestName: "B", roomNumber: "102", checkIn: today, checkOut: "2026-12-17", status: "reserved", nightlyRate: 100 },
    { id: "kpi-b3", organizationId: hotel.id, guestName: "C", roomNumber: "103", checkIn: "2026-12-13", checkOut: today, status: "checked in", nightlyRate: 100 },
    { id: "kpi-b4", organizationId: hotel.id, guestName: "D", roomNumber: "103", checkIn: today, checkOut: "2026-12-16", status: "cancelled", nightlyRate: 100 });
  c.sales.push({ id: "kpi-s1", organizationId: hotel.id, invoiceNo: "K1", date: today, total: "300.00", status: "completed" }, { id: "kpi-s2", organizationId: hotel.id, invoiceNo: "K2", date: "2026-12-01", total: "200.00", status: "completed" }, { id: "kpi-s3", organizationId: hotel.id, invoiceNo: "K3", date: today, total: "999.00", status: "cancelled" });
  (c.diningTables ||= []).push({ id: "kpi-t1", organizationId: restaurant.id, name: "1", seats: 4, status: "occupied" }, { id: "kpi-t2", organizationId: restaurant.id, name: "2", seats: 2, status: "free" });
  (c.menuItems ||= []).push({ id: "kpi-m1", organizationId: restaurant.id, name: "Ful", category: "breakfast", price: 10, status: "sold out" }, { id: "kpi-m2", organizationId: restaurant.id, name: "Tea", category: "hot drinks", price: 2, status: "available" });
  saveStore(data);
  const admin = { ...(c.accessUsers.find(a => a.roleId === "role-main-manager")), organizationIds: [], locationIds: [], permissions: ["*"], ownRecordsOnly: false } as any;
  const value = (result: Row, id: string) => result.kpis.find((k: Row) => k.id === id)?.value;
  const h = companyKpis(admin, hotel.id, now);
  assert.equal(h.type, "hotel");
  assert.equal(value(h, "occupancy"), "67");   // 2 guests in house tonight out of 3 usable rooms
  assert.equal(value(h, "arrivals"), "1"); assert.equal(value(h, "departures"), "1"); assert.equal(value(h, "cleaning"), "1");
  assert.equal(value(h, "salesToday"), "300.00"); assert.equal(value(h, "salesMonth"), "500.00");
  assert.equal(value(h, "receivable"), "500.00");
  const r = companyKpis(admin, restaurant.id, now);
  assert.equal(value(r, "tables"), "1"); assert.equal(value(r, "soldOut"), "1"); assert.equal(value(r, "occupancy"), undefined);
  assert.equal((await call(`/workspace/companies/${hotel.id}/kpis`)).status, 200);
});
