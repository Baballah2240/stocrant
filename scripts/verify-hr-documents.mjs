import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { browserQa } from "./browser-qa.mjs";
const root = mkdtempSync(join(tmpdir(), "stocrant-test-data-document-browser-"));
process.env.STOCRANT_DATA_DIR = root; process.env.NODE_ENV = "development";
const { createApp } = await import("../dist/app.js");
const server = createApp().listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`, password = randomBytes(24).toString("hex"); let browser, cookie;
async function request(path, method = "GET", input) { const response = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) }); const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return { response, data }; }
try {
  const setup = await request("/auth/setup", "POST", { name: "Documents browser QA", email: "document-browser@example.test", password, setupKey: "local-setup" }); cookie = setup.response.headers.get("set-cookie").split(";")[0];
  const { data: { item: employee } } = await request("/collections/employees", "POST", { employeeCode: "BROWSER-QA", name: "Browser Employee", email: "browser-employee@example.test", organizationId: "company-primary", employmentType: "full-time", status: "active", hireDate: "2026-01-01" });
  const imagePath = join(root, "browser-permit.png"); writeFileSync(imagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X8AAAAASUVORK5CYII=", "base64"));
  browser = await browserQa(root); const { send, evaluate, until } = browser;
  async function screenshot(name) { if (process.env.STOCRANT_QA_SCREENSHOTS !== "1") return; const directory = resolve(".local-preview/qa"); mkdirSync(directory, { recursive: true }); const result = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(directory, name + ".png"), Buffer.from(result.data, "base64")); }
  await send("Network.enable"); await send("Network.setCookie", { name: "stocrant_session", value: cookie.slice(cookie.indexOf("=") + 1), url: base, path: "/" });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  async function navigate(path) {
    await send("Page.navigate", { url: base + path });
    await until('Boolean(document.querySelector(".app-lock-screen input[type=password]"))');
    await evaluate(`(() => { const input=document.querySelector(".app-lock-screen input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,${JSON.stringify(password)});input.dispatchEvent(new Event("input",{bubbles:true})); })()`);
    await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');
    await until('Boolean(document.querySelector(".topbar"))');
  }
  async function fill(label, value) {
    await evaluate(`(() => { const label=Array.from(document.querySelectorAll("label")).find(label=>label.querySelector("span")?.textContent.trim().startsWith(${JSON.stringify(label)})); const input=label?.querySelector("input,textarea,select"); if(!input)throw Error("Field not found"); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),"value").set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==="SELECT"?"change":"input",{bubbles:true})); })()`);
  }
  await navigate(`/hr/documents/new?employee=${employee.id}&company=company-primary`);
  await until('Boolean(document.querySelector(".document-editor form"))');
  await evaluate('if (document.documentElement.dataset.theme !== "dark") document.querySelector(".topbar-actions .theme-toggle:not(.language-toggle)").click()');
  await until('document.documentElement.dataset.theme === "dark"');
  await screenshot("hr-document-form-desktop");
  assert.equal(await evaluate('document.querySelectorAll(".document-form-section")[0].querySelectorAll("select")[1].value'), employee.id);
  await fill("Document title", "A"); await fill("Document number / reference", "BROWSER-001"); await fill("Tags", "browser, renewal");
  await evaluate('document.querySelector(".language-toggle").click()'); await until('document.documentElement.dir === "rtl"');
  assert.equal(await evaluate('document.querySelectorAll(".document-form-section")[1].querySelector("input").value'), "A", "Language change must preserve the draft");
  await evaluate('document.querySelector(".language-toggle").click()'); await until('document.documentElement.dir === "ltr"');
  await evaluate('document.querySelectorAll(".document-form-section")[0].querySelectorAll(".choice-select-trigger")[1].click()');
  await until('Boolean(document.querySelector(".choice-picker[open] .choice-picker-search"))');
  await evaluate('(() => { const input=document.querySelector(".choice-picker-search");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"Browser Employee");input.dispatchEvent(new Event("input",{bubbles:true})); })()');
  await until('document.querySelectorAll(".choice-picker-options button").length === 1'); await evaluate('document.querySelector(".choice-picker-options button").click()');
  const dom = await send("DOM.getDocument"); const fileInput = await send("DOM.querySelector", { nodeId: dom.root.nodeId, selector: "input[type=file]" });
  await send("DOM.setFileInputFiles", { nodeId: fileInput.nodeId, files: [imagePath] }); await until('document.querySelector(".document-dropzone").textContent.includes("browser-permit.png")');
  await evaluate('document.querySelector(".document-editor form").requestSubmit()');
  await until('Boolean(document.querySelector(".document-editor [role=alert]")) && !document.querySelector(".document-form-actions button").disabled');
  assert.equal(await evaluate('document.querySelectorAll(".document-form-section")[1].querySelector("input").value'), "A");
  assert.equal((await request("/workspace/documents")).data.drafts.length, 1, "Recoverable metadata error must preserve the real upload");
  await fill("Document title", "Browser Employee Permit"); await evaluate('document.querySelector(".document-editor form").requestSubmit()');
  await until('Boolean(document.querySelector(".document-detail-page h1"))'); assert.equal(await evaluate('document.querySelector(".document-detail-page h1").textContent'), "Browser Employee Permit");
  const docs = (await request("/workspace/documents")).data; const item = docs.items.find(item => item.documentNumber === "BROWSER-001"); assert.ok(item?.attachment); assert.equal(docs.drafts.length, 0);
  const fileResponse = await fetch(`${base}/api/workspace/documents/${item.id}/file`, { headers: { Cookie: cookie } }); assert.equal(fileResponse.status, 200); assert.ok((await fileResponse.arrayBuffer()).byteLength > 0);
  await evaluate('document.querySelector(".document-attachment-card button").click()'); await until('Boolean(document.querySelector(".document-preview[open] img")) && document.querySelector(".document-preview img").naturalWidth === 1');
  await evaluate('document.querySelector(".document-preview header button").click()');
  await navigate(`/hr/employees/${employee.id}`); await until('document.querySelector(".employee-document-section")?.textContent.includes("Browser Employee Permit")');
  await navigate(`/hr/documents/${item.id}/edit`); await until('Boolean(document.querySelector(".document-editor form"))');
  await fill("Document title", "Browser Employee Permit updated"); await evaluate('document.querySelector(".document-editor form").requestSubmit()');
  await until('document.querySelector(".document-detail-page h1")?.textContent === "Browser Employee Permit updated"');
  const edited = (await request(`/workspace/documents/${item.id}`)).data.item; assert.equal(edited.fileId, item.fileId); assert.ok(edited.version > item.version);
  await navigate(`/hr/documents/${item.id}/edit`); await until('Boolean(document.querySelector(".document-editor form"))');
  const replacementPath = join(root, "renewed-permit.png"); writeFileSync(replacementPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X8AAAAASUVORK5CYII=", "base64"));
  const replaceDom = await send("DOM.getDocument"), replaceInput = await send("DOM.querySelector", { nodeId: replaceDom.root.nodeId, selector: "input[type=file]" });
  await send("DOM.setFileInputFiles", { nodeId: replaceInput.nodeId, files: [replacementPath] }); await until('document.querySelector(".document-dropzone").textContent.includes("renewed-permit.png")');
  await evaluate('document.querySelector(".document-editor form").requestSubmit()'); await until('Boolean(document.querySelector(".document-attachment-card"))');
  const replaced = (await request(`/workspace/documents/${item.id}`)).data.item; assert.notEqual(replaced.fileId, item.fileId); assert.ok(replaced.revisions.some(revision => revision.fileId === item.fileId));
  await evaluate('window.__documentConfirmations=[];window.confirm=message=>{window.__documentConfirmations.push(message);return true};document.querySelector(".document-detail-page .page-head .inline-actions button").click()');
  await until('Boolean(document.querySelector(".document-status--archived"))'); assert.ok(await evaluate('window.__documentConfirmations.length > 0'));
  await evaluate('document.querySelector(".document-detail-page .page-head .inline-actions button").click()'); await until('!document.querySelector(".document-status--archived")');
  const rule = (await request("/workspace/access/approval-rules", "POST", { section: "hr", action: "create", active: true })).data.item;
  try {
    const hrPassword = randomBytes(24).toString("hex"), hrEmail = "pending-browser-hr@example.test";
    await request("/workspace/access/users", "POST", { name: "Browser HR requester", email: hrEmail, password: hrPassword, roleId: "role-manager", organizationIds: ["company-primary"] });
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: hrEmail, password: hrPassword }) }); assert.equal(login.status, 200);
    const queuedResponse = await fetch(`${base}/api/workspace/documents`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: login.headers.get("set-cookie").split(";")[0] }, body: JSON.stringify({ category: "company", organizationId: "company-primary", type: "policy", title: "Browser approval policy", visibility: "company", fileUrl: "https://company.example.test/approval" }) }); assert.equal(queuedResponse.status, 202);
    const queued = await queuedResponse.json();
    await navigate(`/hr/documents/requests/${queued.request.id}`); await until('document.querySelector(".document-detail-page h1")?.textContent === "Browser approval policy"');
    await evaluate('window.__documentConfirmations=[];window.confirm=message=>{window.__documentConfirmations.push(message);return true};document.querySelector(".document-detail-page .inline-actions button.primary").click()');
    await until('document.querySelector(".document-detail-page .page-head .hint")?.textContent.includes("Approved") && Boolean(document.querySelector(".document-detail-page > .primary-link"))');
    assert.ok(await evaluate('window.__documentConfirmations.length > 0'));
    assert.ok((await request("/workspace/documents")).data.items.some(item => item.title === "Browser approval policy"));
  } finally { await request(`/workspace/access/approval-rules/${rule.id}`, "PATCH", { active: false }); }
  for (let index = 0; index < 12; index++) await request("/workspace/documents", "POST", { category: "company", organizationId: "company-primary", type: "policy", title: `Browser Company ${String(index).padStart(2,"0")}`, visibility: "company", fileUrl: "https://company.example.test/policy" });
  await navigate("/hr/documents"); await until('Boolean(document.querySelector(".document-search input"))');
  await evaluate('(() => { const input=document.querySelector(".document-search input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"Browser Company");input.dispatchEvent(new Event("input",{bubbles:true})); })()');
  await until('document.querySelectorAll(".document-table tbody tr").length === 10');
  await evaluate('document.querySelector(".document-pagination > div button:last-child").click()'); await until('document.querySelectorAll(".document-table tbody tr").length === 2');
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await until('Boolean(document.querySelector(".mobile-layout"))');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), "Document library must fit the mobile viewport");
  await evaluate('localStorage.setItem("stocrant.language","ar");localStorage.setItem("stocrant-theme","dark")');
  await navigate("/hr/documents"); await until('document.documentElement.dir === "rtl" && document.documentElement.dataset.theme === "dark" && Boolean(document.querySelector(".document-search input"))');
  assert.equal(await evaluate('document.querySelector(".document-search input").placeholder'), "العنوان أو الموظف أو المرجع أو الوسوم");
  await screenshot("hr-documents-mobile-arabic");
  console.log("HR document browser checks passed: employee preselection/search, real upload, recoverable errors/drafts, language switching, preview/download, employee profile, edit/replacement/history, archive/restore, pending review/approval, search/pagination and Arabic mobile dark mode.");
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes("stocrant-test-data-document-browser-")) throw new Error("Unexpected test directory");
  try { rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { console.warn("Temporary browser profile remains locked; business data was not affected."); }
}
