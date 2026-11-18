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
