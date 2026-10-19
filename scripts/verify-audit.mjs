import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { browserQa } from "./browser-qa.mjs";

const root = mkdtempSync(join(tmpdir(), "stocrant-test-data-audit-browser-"));
process.env.STOCRANT_DATA_DIR = root;
process.env.NODE_ENV = "development";
const { createApp } = await import("../dist/app.js");
const { getStore, saveStore } = await import("../dist/storage.js");
const server = createApp().listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const password = randomBytes(24).toString("hex");
let browser, cookie;
async function req(path, method = "GET", input, owner = cookie) {
  const response = await fetch(base + "/api" + path, { method, headers: { ...(owner ? { Cookie: owner } : {}), ...(input === undefined ? {} : { "Content-Type": "application/json" }) }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  const data = await response.json(); assert.ok(response.ok, JSON.stringify(data));
  return { data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
try {
  cookie = (await req("/auth/setup", "POST", { name: "Audit Browser Owner", email: "owner@audit-browser.test", password, setupKey: "local-setup" }, "")).cookie;
  const mainCookie = cookie;
  const work = (await req("/workspace/work", "POST", { title: "Audit assigned work", assignee: "Audit Browser Owner", organizationId: "company-primary", status: "Assigned", priority: "High", comments: "Retained work detail" })).data.item;
  const data = getStore();
  data.collections.documents.push({ id: "audit-legacy-policy", category: "company", type: "policy", title: "Audit legacy policy", organizationId: "company-primary", lifecycle: "active", visibility: "company", createdAt: new Date().toISOString(), fileUrl: "javascript:window.__unsafePolicy=true" });
  saveStore(data);
  const temporaryPassword = randomBytes(24).toString("hex"), newPassword = randomBytes(24).toString("hex");
  const account = (await req("/workspace/access/users", "POST", { name: "Temporary Browser User", email: "temporary@audit-browser.test", password: temporaryPassword, roleId: "role-manager", organizationIds: ["company-primary"] })).data.item;
  const temporaryCookie = (await req("/auth/login", "POST", { email: account.email, password: temporaryPassword }, "")).cookie;
  browser = await browserQa(root);
  const { send, evaluate, until } = browser;
  await send("Network.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__auditErrors=[];addEventListener('error',e=>window.__auditErrors.push(e.message));" });
  async function setCookie(value) { await send("Network.setCookie", { name: "stocrant_session", value: value.slice(value.indexOf("=") + 1), url: base, path: "/" }); }
  async function fill(selector, value) {
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw Error('Missing input: '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  }
  async function navigate(path, secret = password, expected = ".main .page") {
    await send("Page.navigate", { url: base + path });
    await until('Boolean(document.querySelector(".app-lock-screen input[type=password]"))');
    await fill(".app-lock-screen input", secret); await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');
    await until(`Boolean(document.querySelector(${JSON.stringify(expected)}))`);
  }
  async function click(text) { await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button: '+${JSON.stringify(text)});b.click();})()`); }
  async function labelFill(label, value) {
    const selector = await evaluate(`(()=>{const labels=Array.from(document.querySelectorAll('.main form label'));const label=labels.find(l=>l.querySelector('.field-label,span')?.textContent.trim()===${JSON.stringify(label)});const input=label?.querySelector('input,select,textarea');if(!input)throw Error('Missing label');input.setAttribute('data-audit-field','current');return '[data-audit-field=current]';})()`);
    await fill(selector, value); await evaluate('document.querySelector("[data-audit-field]").removeAttribute("data-audit-field")');
  }
  async function screenshot(name) {
    if (process.env.STOCRANT_QA_SCREENSHOTS !== "1") return;
    const directory = resolve(".local-preview/qa/audit"); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, name + ".png"), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  }

  await setCookie(temporaryCookie);
  await navigate("/", temporaryPassword, ".auth-page .auth-card");
  assert.equal(await evaluate('document.querySelector(".auth-card h1").textContent'), "Set a new password");
  await fill('input[autocomplete="current-password"]', temporaryPassword);
  const newInputs = 'input[autocomplete="new-password"]';
  await fill(newInputs, newPassword);
  // Labels wrap separate inputs, so choose confirmation by its label.
  await evaluate(`(()=>{const inputs=document.querySelectorAll('input[autocomplete="new-password"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[1],${JSON.stringify(newPassword)});inputs[1].dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate('document.querySelector(".auth-card form").requestSubmit()');
  await until('Boolean(document.querySelector(".auth-experience"))');
  assert.equal(getStore().collections.accessUsers.find(row => row.id === account.id).mustChangePassword, false);
  console.log("Verified real temporary-password change screen and server enforcement.");

  await setCookie(mainCookie); cookie = mainCookie; await navigate("/");
  const policyHref = await evaluate('Array.from(document.querySelectorAll("#policies a")).find(a=>a.textContent.includes("Audit legacy policy"))?.getAttribute("href")');
  assert.equal(policyHref, "/hr/documents/audit-legacy-policy");
  const task = await evaluate('Array.from(document.querySelectorAll(".dashboard-row")).find(a=>a.textContent.includes("Audit assigned work"))?.getAttribute("href")');
  assert.equal(task, `/operations/work/${work.id}`);
  await navigate(task); await until('Boolean(document.querySelector(".work-detail h2"))');
  assert.equal(await evaluate('document.querySelector(".work-detail h2").textContent'), "Audit assigned work");
  await evaluate('document.querySelector(".language-toggle").click()'); await until('document.documentElement.dir==="rtl"');
  const workSelect = `tr[data-work-id="${work.id}"] select`;
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(workSelect)}).value`), "Assigned");
  await fill(workSelect, "Completed");
  await until(`document.querySelector(${JSON.stringify(workSelect)})?.value==="Completed" && !document.querySelector(${JSON.stringify(workSelect)}).disabled`);
  assert.equal((await req("/workspace/work?view=all")).data.items.find(row => row.id === work.id).status, "Completed");
  await screenshot("arabic-work-detail");
  await evaluate('document.querySelector(".language-toggle").click()'); await until('document.documentElement.dir==="ltr"');

  await navigate("/hr/departments/new");
  await until('Boolean(document.querySelector("#field-name"))');
  const companySelect = await evaluate('document.querySelector(".entity-form-page select")?.outerHTML'); assert.ok(companySelect.includes("company-primary"));
  await fill(".entity-form-page select", "company-primary"); await fill("#field-name", "   ");
  await evaluate('document.querySelector(".entity-form-page form").requestSubmit()');
  await until('Boolean(document.querySelector("#error-name"))');
  assert.equal(await evaluate('document.querySelector("#field-name").value'), "   ");
  assert.equal(await evaluate('document.querySelector("#field-name").getAttribute("aria-invalid")'), "true");
  await evaluate('window.__discardPrompts=[];window.confirm=message=>{window.__discardPrompts.push(message);return false}');
  await click("Cancel");
  await until('window.__discardPrompts.length===1');
  assert.equal(await evaluate('location.pathname'), "/hr/departments/new");
  assert.equal(await evaluate('document.querySelector("#field-name").value'), "   ");
  await screenshot("inline-validation");
  await fill("#field-name", "Audit Department"); await evaluate('document.querySelector(".entity-form-page form").requestSubmit()');
  await until('location.pathname==="/hr/departments"');
  assert.equal(getStore().collections.departments.find(row => row.name === "Audit Department").organizationId, "company-primary");

  await navigate("/finance"); await click("New account");
  await labelFill("Company *", "company-primary"); await labelFill("Name", "Audit Decimal Account"); await labelFill("Currency", "QAR"); await labelFill("Opening balance", "125.75");
  assert.equal(await evaluate('document.querySelector(".finance-page form").checkValidity()'), true);
  await evaluate('document.querySelector(".finance-page form").requestSubmit()');
  await until('!document.querySelector(".finance-page form")');
  assert.equal(getStore().collections.financeAccounts.find(row => row.name === "Audit Decimal Account").openingBalance, 125.75);

  await navigate("/hr/payroll");
  await evaluate('document.querySelector(".payroll-company .choice-select-trigger").click()');
  await until('Boolean(document.querySelector(".choice-picker[open]"))');
  await evaluate('document.querySelector(".choice-picker-search").focus()');
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
  assert.equal(await evaluate('document.activeElement.closest(".choice-picker-options")!==null'), true);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", nativeVirtualKeyCode: 13, windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await until('!document.querySelector(".choice-picker[open]")');
  assert.equal(await evaluate('document.activeElement.classList.contains("choice-select-trigger")'), true);

  const metadataFailure = await send("Page.addScriptToEvaluateOnNewDocument", { source: "const originalFetch=window.fetch;window.fetch=(url,options)=>String(url).includes('/api/collections/meta')?Promise.resolve(new Response(JSON.stringify({error:'Fixture metadata outage'}),{status:503,headers:{'Content-Type':'application/json'}})):originalFetch(url,options);" });
  await navigate("/stores/products");
  await until('Boolean(document.querySelector(".main .page [role=alert]"))');
  assert.ok(await evaluate('document.querySelector(".main").textContent.includes("Could not load workspace metadata")'));
  await screenshot("metadata-recovery");
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: metadataFailure.identifier });
  await evaluate('document.querySelector(".main .page > button").click()');
  await until('Boolean(document.querySelector(".app-lock-screen input[type=password]"))');
  await fill(".app-lock-screen input", password); await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');
  await until('Boolean(document.querySelector(".entity-list-page h1"))');
  await navigate("/hr/not-a-module");
  assert.ok(await evaluate('document.querySelector(".main").textContent.includes("This section could not be found.")'));

  await navigate("/admin?tab=Mobile+app"); await until('Boolean(document.querySelector("#server-url"))');
  await evaluate(`localStorage.setItem('stocrant.serverUrl',${JSON.stringify(base)});localStorage.setItem('stocrant.mobileSession','audit-old-server-token');(window.Capacitor ||= {}).isNativePlatform=()=>true;`);
  await fill("#server-url", ""); await click("Test and save");
  await until('localStorage.getItem("stocrant.serverUrl")===null');
  assert.equal(await evaluate('localStorage.getItem("stocrant.mobileSession")'), null);
  assert.deepEqual(await evaluate('window.__auditErrors'), []);
  console.log("Audit browser checks passed: forced password setup, working task details, safe policy links, Arabic status/save, company-scoped creation, inline validation/draft retention and discard guard, decimal amounts, keyboard picker/focus, metadata outage/retry, missing-route recovery, and default server restore with old token cleared.");
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && root.includes("stocrant-test-data-audit-browser-"));
  rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
