import { TEST_DATA_DIR } from "./test-env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { request as httpRequest } from "node:http";
import { crc32 } from "node:zlib";
import { createApp } from "./app.js";
import { getStore, saveStore, type StoreData } from "./storage.js";
import { documentExpiry, migrateDocuments } from "./document-model.js";
import { filePath, validateDocumentFile } from "./document-files.js";
import { generateDocumentExpiryAlerts } from "./documents.js";
type Row = Record<string, any> & { id: string; version: number };
let server: Server, base = "", main = "", hr = "", own = "", other = "", foreign = "", noAccess = "";
let employeeA: Row, employeeB: Row, employeeForeign: Row, doc: Row, company: Row;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X8AAAAASUVORK5CYII=", "base64");
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const jsonHeaders = { "Content-Type": "application/json" };
function zip(entries: Record<string, string>) {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const filename = Buffer.from(name), bytes = Buffer.from(content), checksum = crc32(bytes), local = Buffer.alloc(30), entry = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(checksum, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt32LE(checksum, 16); entry.writeUInt32LE(bytes.length, 20); entry.writeUInt32LE(bytes.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    locals.push(local, filename, bytes); central.push(entry, filename); offset += local.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22), count = Object.keys(entries).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
async function req(path: string, method = "GET", body?: unknown, cookie = main) { return fetch(`${base}/api${path}`, { method, headers: { ...(body === undefined ? {} : jsonHeaders), ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function status(response: Response, code: number) { assert.equal(response.status, code, await response.clone().text()); return response.json() as Promise<Record<string, any>>; }
const cookie = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
async function employee(name: string, organizationId = "company-primary") { return (await status(await req("/collections/employees", "POST", { employeeCode: randomUUID(), name, email: randomUUID() + "@docs.test", organizationId, status: "active", employmentType: "full-time", hireDate: "2026-01-01" }), 201)).item as Row; }
async function account(name: string, roleId: string, companyId: string, employeeId = "", permissions?: string[]) {
  const email = randomUUID() + "@docs.test", password = randomBytes(24).toString("hex");
  const existing = employeeId && (getStore().collections.accessUsers as Row[]).find(row => row.employeeId === employeeId);
  const { item } = existing
    ? await status(await req(`/workspace/access/users/${existing.id}`, "PATCH", { name, email, password, roleId, status: "active", ownRecordsOnly: roleId === "role-employee" }), 200)
    : await status(await req("/workspace/access/users", "POST", { name, email, password, roleId, organizationIds: [companyId], ownRecordsOnly: roleId === "role-employee" }), 201);
  if (permissions) await status(await req(`/workspace/access/users/${item.id}`, "PATCH", { permissions }), 200);
  const login = await req("/auth/login", "POST", { email, password }, ""); await status(login, 200); return cookie(login);
}
async function upload(name = "permit.png", bytes = png, owner = hr, companyId = "company-primary") {
  return fetch(`${base}/api/workspace/documents/uploads`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(name), "X-Document-Company": companyId, Cookie: owner }, body: new Uint8Array(bytes) });
}
function values(overrides: Record<string, unknown> = {}) { return { category: "employee", organizationId: "company-primary", employeeId: employeeA.id, type: "passport", title: "Private passport record", documentNumber: "DOC-001", issuedOn: "2026-01-01", expiresOn: "2099-02-01", visibility: "hr", fileUrl: "", warningDays: 30, ...overrides }; }
function editable(row: Row, overrides: Record<string, unknown> = {}) { return values({ ...Object.fromEntries(["category", "organizationId", "employeeId", "type", "title", "documentNumber", "issuedOn", "expiresOn", "issuingAuthority", "notes", "tags", "fileId", "fileUrl", "visibility", "warningDays", "version"].filter(key => row[key] !== undefined).map(key => [key, row[key]])), ...overrides }); }
before(async () => {
  server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const setup = await req("/auth/setup", "POST", { name: "Documents Main", email: "main@docs.test", password: randomBytes(24).toString("hex"), setupKey: "local-setup" }, ""); await status(setup, 201); main = cookie(setup);
  const parent = (getStore().collections.companies as Row[])[0].parentOrganizationId;
  company = (await status(await req("/collections/companies", "POST", { name: "Other documents company", parentOrganizationId: parent, organizationType: "office", industry: "services", currency: "QAR", status: "active" }), 201)).item;
  employeeA = await employee("Employee Alpha"); employeeB = await employee("Employee Beta"); employeeForeign = await employee("Employee Foreign", company.id);
  hr = await account("HR Records Manager", "role-manager", "company-primary", "", ["hr.view", "hr.create", "hr.edit", "hr.delete"]);
  own = await account("Employee Alpha", "role-employee", "company-primary", employeeA.id);
  other = await account("Employee Beta", "role-employee", "company-primary", employeeB.id);
  foreign = await account("Foreign HR", "role-manager", company.id, "", ["hr.view", "hr.create", "hr.edit", "hr.delete"]);
  noAccess = await account("No HR access", "role-manager", "company-primary", "", []);
});
after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); if (!resolve(TEST_DATA_DIR).startsWith(resolve(tmpdir()) + sep) || !TEST_DATA_DIR.includes("stocrant-test-data-")) throw new Error("Unexpected test store"); rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 3 }); });
describe("Private HR documents, uploads and employee access", () => {
  it("migrates legacy links without losing metadata or guessing ambiguous employees", () => {
    const data = { collections: { documents: [{ id: "old", employee: "Employee Alpha", title: "Historical title", fileUrl: "https://records.example.test/old" }, { id: "policy", employee: "all", type: "policy" }], employees: [employeeA] } } as unknown as StoreData;
    assert.equal(migrateDocuments(data), true); const old = data.collections.documents[0] as Row; assert.equal(old.employeeId, employeeA.id); assert.equal(old.title, "Historical title"); assert.equal(old.fileUrl, "https://records.example.test/old"); assert.equal(old.visibility, "hr"); assert.equal((data.collections.documents[1] as Row).visibility, "company"); assert.equal(migrateDocuments(data), false);
  });
  it("keeps document configuration and upload endpoints authenticated and role checked", async () => {
    await status(await req("/workspace/documents/config", "GET", undefined, ""), 401);
    await status(await req("/workspace/documents/config", "GET", undefined, noAccess), 403);
    await status(await upload("private.png", png, own), 403);
    await status(await upload("private.png", png, foreign), 403);
    const config = await status(await req("/workspace/documents/config", "GET", undefined, hr), 200); assert.ok(config.extensions.includes("pdf"));
  });
  it("validates allowed formats, actual signatures, sizes and traversal filenames", async () => {
    for (const filename of ["../passport.png", "folder\\file.png", "evil.html", "document.svg", "file.exe"]) await status(await upload(filename), 400);
    await status(await upload("fake.pdf", Buffer.from("<script>unsafe</script>")), 400);
    await status(await upload("fake.docx", Buffer.from("PK not an Office archive")), 400);
    assert.throws(() => validateDocumentFile("bad.pdf", png), /contents/);
    const original = process.env.STOCRANT_DOCUMENT_MAX_BYTES; process.env.STOCRANT_DOCUMENT_MAX_BYTES = "16";
    try { await status(await upload(), 413); } finally { if (original) process.env.STOCRANT_DOCUMENT_MAX_BYTES = original; else delete process.env.STOCRANT_DOCUMENT_MAX_BYTES; }
    assert.equal(validateDocumentFile("record.pdf", pdf).mime, "application/pdf");
    const docx = zip({ "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>', "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>' });
    assert.equal(validateDocumentFile("record.docx", docx).extension, "docx");
    const xlsx = zip({ "[Content_Types].xml": '<Types/>', "xl/workbook.xml": '<workbook/>' }); assert.equal(validateDocumentFile("record.xlsx", xlsx).extension, "xlsx");
    assert.throws(() => validateDocumentFile("unsafe.docx", zip({ "[Content_Types].xml": "xml", "word/document.xml": "xml", "word/vbaProject.bin": "macro" })), /contents/);
    assert.throws(() => validateDocumentFile("unsafe.docx", zip({ "[Content_Types].xml": "xml", "word/document.xml": "xml", "../escape": "data" })), /contents/);
  });
  it("stores file bytes privately, creates a real employee document and handles duplicate submissions", async () => {
    const { file } = await status(await upload(), 201); assert.ok(existsSync(filePath(file.id))); assert.deepEqual(readFileSync(filePath(file.id)), png);
    const payload = values({ fileId: file.id, clientRequestId: randomUUID(), tags: ["renewal", "private"] });
    doc = (await status(await req("/workspace/documents", "POST", payload, hr), 201)).item;
    assert.equal(doc.employeeId, employeeA.id); assert.equal(doc.attachment.name, "permit.png"); assert.equal(doc.attachment.size, png.length);
    assert.equal((await status(await req("/workspace/documents", "POST", payload, hr), 201)).item.id, doc.id);
    assert.equal((getStore().collections.documents as Row[]).filter(row => row.id === doc.id).length, 1);
    assert.ok(!JSON.stringify(getStore().collections.documents).includes(png.toString("base64")));
  });
  it("prevents private employee access through direct downloads, generic collections, export and self-service", async () => {
    for (const auth of [own, other, foreign, noAccess]) {
      await status(await req(`/workspace/documents/${doc.id}`, "GET", undefined, auth), 404);
      await status(await req(`/workspace/documents/${doc.id}/file`, "GET", undefined, auth), 404);
      await status(await req(`/collections/documents/${doc.id}`, "GET", undefined, auth), 404);
    }
    const service = await status(await req("/workspace/self-service", "GET", undefined, own), 200); assert.ok(!service.documents.some((row: Row) => row.id === doc.id));
    const list = await status(await req("/collections/documents", "GET", undefined, other), 200); assert.ok(!list.items.some((row: Row) => row.id === doc.id));
    await status(await req("/workspace/export/documents", "GET", undefined, own), 403);
    assert.equal((await fetch(`${base}/private-documents/${doc.fileId}.bin`)).status, 404);
  });
  it("supports explicit own-employee visibility while denying another employee and cross-company assignments", async () => {
    doc = (await status(await req(`/workspace/documents/${doc.id}`, "PATCH", editable(doc, { visibility: "employee" }), hr), 200)).item;
    await status(await req(`/workspace/documents/${doc.id}`, "GET", undefined, own), 200);
    const file = await req(`/workspace/documents/${doc.id}/file`, "GET", undefined, own); assert.equal(file.status, 200); assert.deepEqual(Buffer.from(await file.arrayBuffer()), png); assert.match(file.headers.get("cache-control")!, /no-store/); assert.match(file.headers.get("content-disposition")!, /attachment/);
    await status(await req(`/workspace/documents/${doc.id}`, "GET", undefined, other), 404);
    await status(await req("/workspace/documents", "POST", values({ employeeId: employeeForeign.id, fileUrl: "https://docs.test/file.pdf", documentNumber: "CROSS" }), hr), 400);
    await status(await req("/workspace/documents", "POST", values({ visibility: "company", fileUrl: "https://docs.test/file.pdf" }), hr), 400);
  });
  it("supports secure previews, metadata-only edits, optimistic versions and reference uniqueness", async () => {
    const preview = await req(`/workspace/documents/${doc.id}/file?preview=1`, "GET", undefined, own); assert.equal(preview.status, 200); assert.match(preview.headers.get("content-disposition")!, /inline/); assert.equal(preview.headers.get("x-content-type-options"), "nosniff");
    const previous = doc;
    doc = (await status(await req(`/workspace/documents/${doc.id}`, "PATCH", editable(doc, { title: "Updated title", notes: "Retain original bytes" }), hr), 200)).item;
    assert.equal(doc.fileId, previous.fileId); assert.deepEqual(readFileSync(filePath(String(doc.fileId))), png);
    await status(await req(`/collections/employees/${employeeA.id}`, "PATCH", { name: "Employee Alpha renamed" }), 200);
    const renamed = (await status(await req(`/workspace/documents/${doc.id}`, "GET", undefined, hr), 200)).item;
    assert.equal(renamed.employee, "Employee Alpha renamed"); assert.equal(renamed.employeeId, employeeA.id);
    await status(await req(`/workspace/documents/${doc.id}`, "PATCH", editable(previous, { title: "Stale update" }), hr), 409);
    await status(await req("/workspace/documents", "POST", values({ fileUrl: "https://docs.test/duplicate" }), hr), 409);
    await status(await req("/workspace/documents", "POST", values({ documentNumber: "DATE-FAIL", fileUrl: "https://docs.test/file", issuedOn: "2026-02-30" }), hr), 400);
    await status(await req("/workspace/documents", "POST", values({ documentNumber: "URL-FAIL", fileUrl: "javascript:alert(1)" }), hr), 400);
  });
  it("retains replaced files and authorizes historical downloads only for HR managers", async () => {
    const previousFile = doc.fileId;
    const { file } = await status(await upload("replacement.pdf", pdf), 201);
    doc = (await status(await req(`/workspace/documents/${doc.id}`, "PATCH", editable(doc, { fileId: file.id }), hr), 200)).item;
    assert.ok(existsSync(filePath(String(previousFile)))); assert.ok(doc.revisions.some((revision: Row) => revision.fileId === previousFile));
    const history = await req(`/workspace/documents/${doc.id}/file?versionFile=${previousFile}`, "GET", undefined, hr); assert.equal(history.status, 200); assert.deepEqual(Buffer.from(await history.arrayBuffer()), png);
    await status(await req(`/workspace/documents/${doc.id}/file?versionFile=${previousFile}`, "GET", undefined, own), 404);
    await status(await req(`/workspace/documents/uploads/${previousFile}`, "DELETE", undefined, hr), 409);
    await status(await req(`/workspace/documents/${doc.id}`, "PATCH", editable(doc, { employeeId: employeeB.id }), hr), 400);
  });
  it("manages company files separately with configurable visibility and draft removal", async () => {
    const payload = { category: "company", organizationId: "company-primary", type: "policy", title: "Staff safety policy", visibility: "company", fileUrl: "https://docs.test/policy", tags: ["safety"] };
    const shared = (await status(await req("/workspace/documents", "POST", payload, hr), 201)).item;
    await status(await req(`/workspace/documents/${shared.id}`, "GET", undefined, own), 200); await status(await req(`/workspace/documents/${shared.id}`, "GET", undefined, other), 200); await status(await req(`/workspace/documents/${shared.id}`, "GET", undefined, foreign), 404);
    const unshared = (await status(await req("/workspace/documents", "POST", { ...payload, title: "HR procedure", type: "procedure", visibility: "hr" }, hr), 201)).item;
    await status(await req(`/workspace/documents/${unshared.id}`, "GET", undefined, other), 404);
    const { file } = await status(await upload("unused.png"), 201); await status(await req(`/workspace/documents/uploads/${file.id}`, "DELETE", undefined, foreign), 404); await status(await req(`/workspace/documents/uploads/${file.id}`, "DELETE", undefined, hr), 200); assert.equal(existsSync(filePath(file.id)), false);
    const scoped = await status(await req(`/workspace/documents?employee=${employeeA.id}`, "GET", undefined, hr), 200); assert.ok(scoped.items.every((row: Row) => row.employeeId === employeeA.id));
  });
  it("calculates expiry correctly and deduplicates authorized in-app alerts without sensitive titles", async () => {
    assert.equal(documentExpiry({ expiresOn: "2099-02-01", warningDays: 30 }, "2099-01-02"), "expiring");
    assert.equal(documentExpiry({ expiresOn: "2099-02-01" }, "2099-02-01"), "expiring");
    assert.equal(documentExpiry({ expiresOn: "2099-02-01" }, "2099-02-02"), "expired");
    assert.equal(documentExpiry({ expiresOn: "invalid" }, "2099-02-01"), "unknown"); assert.equal(documentExpiry({}, "2099-02-01"), "no-expiry");
    assert.ok(generateDocumentExpiryAlerts(new Date("2099-01-15T12:00:00Z")) > 0);
    assert.equal(generateDocumentExpiryAlerts(new Date("2099-01-15T12:00:00Z")), 0);
    const alerts = (getStore().collections.notifications as Row[]).filter(row => row.target === `document:${doc.id}`); assert.ok(alerts.length >= 2); assert.ok(alerts.every(row => !String(row.message).includes(doc.title as string) && !String(row.message).includes(employeeA.name as string)));
    const ownAlerts = await status(await req("/notifications", "GET", undefined, own), 200); assert.ok(ownAlerts.items.some((row: Row) => row.target === `document:${doc.id}`));
    const otherAlerts = await status(await req("/notifications", "GET", undefined, other), 200); assert.ok(!otherAlerts.items.some((row: Row) => row.target === `document:${doc.id}`));
  });
  it("archives without deleting files, guards employee history and records audit actions", async () => {
    await status(await req(`/collections/employees/${employeeA.id}`, "DELETE"), 400);
    await status(await req(`/workspace/documents/${doc.id}`, "DELETE", undefined, hr), 409);
    doc = (await status(await req(`/workspace/documents/${doc.id}/archive`, "POST", { archived: true, version: doc.version }, hr), 200)).item; assert.equal(doc.expiryStatus, "archived"); assert.ok(existsSync(filePath(String(doc.fileId))));
    await status(await req(`/workspace/documents/${doc.id}`, "GET", undefined, own), 404);
    doc = (await status(await req(`/workspace/documents/${doc.id}/archive`, "POST", { archived: false, version: doc.version }, hr), 200)).item; assert.equal(doc.lifecycle, "active");
    const actions = (getStore().collections.auditLog as Row[]).map(row => row.action); for (const action of ["documents.uploaded", "documents.created", "documents.updated", "documents.attachment-replaced", "documents.previewed", "documents.downloaded", "documents.archived", "documents.restored"]) assert.ok(actions.includes(action), `Missing audit ${action}`);
    const stored = JSON.parse(readFileSync(join(TEST_DATA_DIR, "data", "stocrant.json"), "utf8")); assert.ok(stored.collections.documents.some((row: Row) => row.id === doc.id));
  });
  it("honors HR approval rules, reserves private uploads, and permits secure review before approval or rejection", async () => {
    const reviewer = await account("Document reviewer", "role-main-manager", "company-primary");
    const financeApprover = await account("Non HR approver", "role-manager", "company-primary", "", ["approvals.view", "approvals.approve"]);
    const createRule = (await status(await req("/workspace/access/approval-rules", "POST", { section: "hr", action: "create", active: true }), 201)).item;
    let archiveRule: Row | undefined;
    try {
      const { file } = await status(await upload("awaiting-review.png"), 201), payload = values({ title: "Approval controlled document", documentNumber: "APPROVAL-01", fileId: file.id, clientRequestId: randomUUID() });
      const queued = await status(await req("/workspace/documents", "POST", payload, hr), 202); assert.equal(queued.pending, true);
      assert.ok(!(getStore().collections.documents as Row[]).some(row => row.documentNumber === "APPROVAL-01"));
      const retry = await status(await req("/workspace/documents", "POST", payload, hr), 202); assert.equal(retry.request.id, queued.request.id);
      await status(await req(`/workspace/documents/uploads/${file.id}`, "DELETE", undefined, hr), 409);
      await status(await req(`/workspace/documents/requests/${queued.request.id}`, "GET", undefined, financeApprover), 404);
      await status(await req(`/workspace/documents/requests/${queued.request.id}`, "GET", undefined, foreign), 404);
      const hidden = await status(await req("/workspace/approvals", "GET", undefined, financeApprover), 200); assert.ok(!hidden.items.some((row: Row) => row.id === queued.request.id));
      await status(await req(`/workspace/approvals/${queued.request.id}`, "POST", { decision: "approve" }, financeApprover), 403);
      await status(await req(`/workspace/approvals/${queued.request.id}`, "POST", { decision: "reject" }, financeApprover), 403);
      const review = await status(await req(`/workspace/documents/requests/${queued.request.id}`, "GET", undefined, reviewer), 200); assert.equal(review.metadata.title, payload.title); assert.equal(review.canDecide, true);
      const attachment = await req(`/workspace/documents/requests/${queued.request.id}/file`, "GET", undefined, reviewer); assert.equal(attachment.status, 200); assert.deepEqual(Buffer.from(await attachment.arrayBuffer()), png);
      await status(await req(`/workspace/approvals/${queued.request.id}`, "POST", { decision: "approve", note: "Reviewed private attachment" }, reviewer), 200);
      const approved = (getStore().collections.documents as Row[]).find(row => row.documentNumber === "APPROVAL-01")!; assert.ok(approved); assert.equal(approved.createdBy, (getStore().collections.accessUsers as Row[]).find(row => row.name === "HR Records Manager")!.id);
      archiveRule = (await status(await req("/workspace/access/approval-rules", "POST", { section: "hr", action: "delete", active: true }), 201)).item;
      const archiveRequest = await status(await req(`/workspace/documents/${approved.id}/archive`, "POST", { archived: true, version: approved.version }, hr), 202);
      assert.equal((getStore().collections.documents as Row[]).find(row => row.id === approved.id)!.lifecycle, "active");
      await status(await req(`/workspace/approvals/${archiveRequest.request.id}`, "POST", { decision: "approve" }, reviewer), 200);
      assert.equal((getStore().collections.documents as Row[]).find(row => row.id === approved.id)!.lifecycle, "archived"); assert.ok(existsSync(filePath(file.id)));
      const rejectedFile = (await status(await upload("rejected.png"), 201)).file;
      const rejected = await status(await req("/workspace/documents", "POST", values({ documentNumber: "APPROVAL-REJECT", fileId: rejectedFile.id }), hr), 202);
      await status(await req(`/workspace/approvals/${rejected.request.id}`, "POST", { decision: "reject" }, reviewer), 200);
      await status(await req(`/workspace/documents/uploads/${rejectedFile.id}`, "DELETE", undefined, hr), 200);
    } finally {
      await status(await req(`/workspace/access/approval-rules/${createRule.id}`, "PATCH", { active: false }), 200);
      if (archiveRule) await status(await req(`/workspace/access/approval-rules/${archiveRule.id}`, "PATCH", { active: false }), 200);
    }
  });
  it("increments legacy versions on their first edit so stale clients cannot overwrite them", async () => {
    const data = getStore(), legacy = { id: "legacy-version-check", ...values({ documentNumber: "LEGACY-VERSION", fileUrl: "https://docs.test/legacy", lifecycle: "active", documentSchemaVersion: 1 }) };
    data.collections.documents.push(legacy); saveStore(data);
    const initial = (await status(await req(`/workspace/documents/${legacy.id}`, "GET", undefined, hr), 200)).item;
    assert.equal(initial.version, 1);
    const updated = (await status(await req(`/workspace/documents/${legacy.id}`, "PATCH", editable(initial, { title: "Legacy updated" }), hr), 200)).item;
    assert.equal(updated.version, 2);
    await status(await req(`/workspace/documents/${legacy.id}`, "PATCH", editable(initial, { title: "Stale legacy update" }), hr), 409);
  });
  it("rechecks suspended sessions after the upload stream completes", async () => {
    const fileCount = getStore().collections.documentFiles.length;
    const incoming = new Promise<void>(resolve => server.once("request", () => resolve()));
    const result = new Promise<number>((resolve, reject) => {
      const outgoing = httpRequest(`${base}/api/workspace/documents/uploads`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "Content-Length": png.length, "X-File-Name": "suspended.png", "X-Document-Company": "company-primary", Cookie: hr } }, response => { response.resume(); response.on("end", () => resolve(response.statusCode!)); });
      outgoing.on("error", reject); outgoing.write(png.subarray(0, 20));
      void incoming.then(async () => {
        const account = (getStore().collections.accessUsers as Row[]).find(row => row.name === "HR Records Manager")!;
        try { await status(await req(`/workspace/access/users/${account.id}`, "PATCH", { status: "suspended" }), 200); outgoing.end(png.subarray(20)); } catch (error) { outgoing.destroy(); reject(error); }
      });
    });
    assert.equal(await result, 403); assert.equal(getStore().collections.documentFiles.length, fileCount);
  });
});
