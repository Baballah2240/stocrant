
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import express from "express";
import { browserQa } from "./browser-qa.mjs";

// Real inventory APIs and transactions, isolated from business records.
const root = mkdtempSync(join(tmpdir(), "stocrant-test-data-inventory-browser-"));
process.env.STOCRANT_DATA_DIR = root; process.env.NODE_ENV = "development";
const { createApp } = await import("../dist/app.js");
const { getStore, saveStore } = await import("../dist/storage.js");
let failInventory = false, inventoryDelay = 0;
const app = express();
app.get("/inventory-fixture-photo.svg", (_req, res) => res.type("svg").send('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#304d60"/><path d="M100 50h280v140H100zM70 190h340v20H70z" fill="#9bbccc"/></svg>'));
app.use((req, res, next) => { if (req.path !== "/api/workspace/inventory") return next(); if (failInventory) return res.status(503).json({ error: "Inventory temporarily unavailable." }); if (inventoryDelay) return setTimeout(next, inventoryDelay); next(); });
app.use(createApp());
const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
const base = 'http://127.0.0.1:' + server.address().port, password = randomBytes(24).toString("hex");
let browser, cookie = "", activePassword = password;
async function req(path, method = "GET", body, auth = cookie) { const response = await fetch(base + "/api" + path, { method, headers: { Cookie: auth, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); const data = await response.json(); assert.ok(response.ok, path + ": " + JSON.stringify(data)); return { data, response }; }
const cookieFor = response => response.headers.get("set-cookie").split(";")[0];
const directory = resolve(".local-preview/qa/inventory"); mkdirSync(directory, { recursive: true });
try {
  cookie = cookieFor((await req("/auth/setup", "POST", { name: "Inventory Reviewer", email: "owner@inventory-browser.test", password, setupKey: "local-setup" })).response);
  const mainCookie = cookie;
  const org = (await req("/collections/organizations", "POST", { name: "QA Inventory Organization", status: "active" })).data.item;
  async function company(name) { return (await req("/collections/companies", "POST", { name, parentOrganizationId: org.id, status: "active", organizationType: "office", industry: "services", currency: "QAR" })).data.item; }
  const firstCompany = await company("QA Fleet Company"), secondCompany = await company("QA Other Company");
  async function item(name, sku, openingStock, reorderPoint, stockLocation, companyId = firstCompany.id, itemType = "equipment", notes = "") { return (await req("/workspace/inventory/items", "POST", { name, sku, unit: "unit", organizationId: companyId, itemType, stockLocation, openingStock, reorderPoint, notes })).data.item; }
  const laptop = await item("QA Laptop", "LT-QA-104", 150, 5, "A-03", firstCompany.id, "equipment", "Legacy searchable note");
  const low = await item("QA Cup holders", "CH-QA-028", 2, 5, "B-01", firstCompany.id, "finished-product");
  const zero = await item("QA Empty carton", "BX-QA-000", 0, 0, "A-03");
  const archive = await item("QA Archive item", "OLD-QA-1", 12, 2, "A-03", firstCompany.id, "other");
  await item("QA Other Laptop", "LT-QA-2", 30, 2, "A-03", secondCompany.id);
  for (const [type, quantity] of [["incoming", 5], ["return", 2], ["outgoing", 3], ["adjustment", -1]]) await req("/workspace/inventory/movements", "POST", { inventoryItemId: laptop.id, type, quantity, date: "2026-10-17", reason: "Fixture " + type });
  const store = getStore();
  const storedLaptop = store.collections.inventoryItems.find(row => row.id === laptop.id); storedLaptop.image = "/inventory-fixture-photo.svg";
  const storedArchive = store.collections.inventoryItems.find(row => row.id === archive.id); for (const field of ["createdAt", "updatedAt", "createdByName", "updatedByName"]) delete storedArchive[field];
  store.collections.inventoryHistory = store.collections.inventoryHistory.filter(row => row.inventoryItemId !== archive.id);
  store.collections.inventoryItems.find(row => row.id === low.id).imageUrl = "/missing-inventory-photo.png";
  saveStore(store);
  browser = await browserQa(root); const { send, evaluate, until } = browser;
  await send("Network.enable");
  const setCookie = () => send("Network.setCookie", { name: "stocrant_session", value: cookie.slice(cookie.indexOf("=") + 1), url: base, path: "/" });
  await setCookie();
  async function fill(selector, value) { await until('Boolean(document.querySelector(' + JSON.stringify(selector) + '))'); await evaluate('(()=>{const input=document.querySelector(' + JSON.stringify(selector) + ');Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),"value").set.call(input,' + JSON.stringify(value) + ');input.dispatchEvent(new Event(input.tagName==="SELECT"?"change":"input",{bubbles:true}));})()'); }
  async function label(name, value) { await evaluate('(()=>{const field=Array.from(document.querySelectorAll(".inventory-editor label")).find(node=>node.querySelector("span")?.textContent.trim()===' + JSON.stringify(name) + ');if(!field)throw Error("Missing field");const input=field.querySelector("input");Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),"value").set.call(input,' + JSON.stringify(value) + ');input.dispatchEvent(new Event("input",{bubbles:true}));})()'); }
  async function click(selector) { await until('Boolean(document.querySelector(' + JSON.stringify(selector) + '))'); await evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()'); }
  async function button(text, container = ".inventory-page") { await until('Array.from(document.querySelectorAll(' + JSON.stringify(container + " button") + ')).some(button=>button.textContent.trim()===' + JSON.stringify(text) + ')'); await evaluate('Array.from(document.querySelectorAll(' + JSON.stringify(container + " button") + ')).find(button=>button.textContent.trim()===' + JSON.stringify(text) + ').click()'); }
  async function navigate(path = "/warehouse") { await send("Page.navigate", { url: base + path }); await until('Boolean(document.querySelector(".app-lock-screen input[type=password]")||document.querySelector(".inventory-page"))'); if (await evaluate('Boolean(document.querySelector(".app-lock-screen input[type=password]"))')) { await fill('.app-lock-screen input', activePassword); await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()'); } await until('Boolean(document.querySelector(".inventory-page"))'); }
  async function ready() { await until('document.querySelector(".inventory-page")?.getAttribute("aria-busy")==="false"'); }
  async function screenshot(name) { writeFileSync(join(directory, name + ".png"), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64")); }
  const row = id => '[data-item-id="' + id + '"]';
  const rowIds = () => evaluate('Array.from(document.querySelectorAll(".inventory-table tbody tr")).map(row=>row.dataset.itemId)');
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  inventoryDelay = 700; await navigate(); await until('document.body.textContent.includes("Loading inventory")'); await ready(); inventoryDelay = 0;
  await evaluate('localStorage.setItem("stocrant-theme","dark");document.documentElement.dataset.theme="dark"');
  for (const term of ["QA Laptop", "LT-QA-104", "QA Fleet Company", "equipment", "A-03", "Legacy searchable note"]) { await fill('.inventory-search input', term); assert.ok((await rowIds()).includes(laptop.id), "Search field " + term); }
  await fill('.inventory-search input', "LT-QA-104"); await fill('select[aria-label="Filter by company"]', firstCompany.id); await fill('select[aria-label="Filter by location"]', "A-03"); await fill('select[aria-label="Filter by stock status"]', "in");
  assert.deepEqual(await rowIds(), [laptop.id]);
  await click(row(laptop.id) + ' .inventory-item-link'); await until('Boolean(document.querySelector("#inventory-details"))');
  assert.ok(await evaluate('document.querySelector(".inventory-detail-facts").textContent.includes("QA Fleet Company")&&document.querySelector(".inventory-detail-facts").textContent.includes("equipment")'));
  assert.equal(await evaluate('document.querySelector("[data-detail-available]").textContent.trim()'), "153 unit");
  await until('document.querySelector(".inventory-detail-panel img")?.naturalWidth>0');
  await screenshot("desktop-dark-details");
  await click('#inventory-movements-tab'); assert.ok(await evaluate('document.querySelector("#inventory-movements").textContent.includes("Inventory Reviewer")')); assert.equal(await evaluate('document.querySelectorAll("#inventory-movements .inventory-movement-list:first-of-type li").length'), 4);
  const filters = await evaluate('new URLSearchParams(location.search).get("q")+"|"+new URLSearchParams(location.search).get("company")+"|"+new URLSearchParams(location.search).get("location")+"|"+new URLSearchParams(location.search).get("status")');
  await click('button[aria-label="Close item details"]'); await until('document.activeElement.className==="inventory-item-link"');
  await click(row(laptop.id) + ' .inventory-item-link');
  assert.equal(await evaluate('new URLSearchParams(location.search).get("q")+"|"+new URLSearchParams(location.search).get("company")+"|"+new URLSearchParams(location.search).get("location")+"|"+new URLSearchParams(location.search).get("status")'), filters);
  await button("Record movement", ".inventory-detail-panel"); await until('Boolean(document.querySelector(".inventory-editor"))');
  assert.equal(await evaluate('document.querySelector("#movement-item").value'), laptop.id);
  await label("Quantity", "2"); await label("Reason", "Browser receipt"); await label("Reference", "QA-RECEIPT"); await evaluate('document.querySelector(".inventory-editor form").requestSubmit()');
  await until('document.querySelector("[data-detail-available]")?.textContent.trim()==="155 unit"'); await ready();
  assert.equal(await evaluate('document.querySelector(' + JSON.stringify(row(laptop.id) + ' .inventory-quantity strong') + ').textContent'), "155");
  const refreshed = (await req("/workspace/inventory")).data; assert.equal(refreshed.items.find(item => item.id === laptop.id).available, 155);
  await click('#inventory-movements-tab'); assert.equal(await evaluate('document.querySelectorAll("#inventory-movements .inventory-movement-list:first-of-type li").length'), 5);
  assert.ok(await evaluate('document.querySelector(".inventory-last-change").textContent.includes("Inventory Reviewer")'));
  await click('button[aria-label="Close item details"]'); await button("Clear filters");
  await click('.inventory-low-stock'); const lowIds = await rowIds(); assert.ok(lowIds.includes(low.id) && lowIds.includes(zero.id) && !lowIds.includes(laptop.id));
  assert.deepEqual(lowIds.sort(), refreshed.items.filter(item => item.lowStock).map(item => item.id).sort());
  await click('.inventory-low-stock'); await fill('.inventory-search input', "not-a-real-inventory-item"); assert.equal((await rowIds()).length, 0); assert.ok(await evaluate('document.body.textContent.includes("No matching items")')); await button("Clear filters");
  await click(row(archive.id) + ' .inventory-item-link'); assert.ok(await evaluate('document.querySelector(".inventory-photo.is-large").textContent.includes("No product photo")')); assert.ok(!await evaluate('document.querySelector(".inventory-page").textContent.includes("undefined")')); await screenshot("desktop-legacy-placeholder");
  await click('button[aria-label="Close item details"]'); await click(row(low.id) + ' .inventory-item-link'); await until('Boolean(document.querySelector(".inventory-photo.is-large > span"))'); await click('button[aria-label="Close item details"]');
  await click(row(laptop.id) + ' button[aria-label^="Actions for"]'); await until('Boolean(document.querySelector(".inventory-actions-popover"))'); assert.ok(await evaluate('document.activeElement.textContent==="View details"')); await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }); await until('!document.querySelector(".inventory-actions-popover")');
  await fill('.inventory-search input', "LT-QA-104"); await click(row(laptop.id) + ' .inventory-item-link');
  await evaluate('window.__inventoryPrints=0;window.print=()=>{window.__inventoryPrints++}'); await button("Print inventory", ".inventory-toolbar"); assert.equal(await evaluate('window.__inventoryPrints'), 1);
  await send("Emulation.setEmulatedMedia", { media: "print" });
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".inventory-stock-report")).display'), "block"); assert.equal(await evaluate('getComputedStyle(document.querySelector(".inventory-detail-panel")).display'), "none"); assert.equal(await evaluate('getComputedStyle(document.querySelector("th.inventory-print-only")).display'), "table-cell");
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".inventory-print-heading h1")).color'), "rgb(0, 0, 0)");
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".action-toast-stack")).display'), "none");
  await screenshot("print-layout");
  await send("Emulation.setEmulatedMedia", { media: "screen", features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  assert.ok(await evaluate('parseFloat(getComputedStyle(document.querySelector(".inventory-detail-tabs button")).transitionDuration) < .001'));
  for (const [width, height] of [[375, 812], [430, 932], [812, 375]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 700 });
    await until('document.querySelector(".inventory-detail-panel")?.getAttribute("role")===' + JSON.stringify(width <= 700 ? "dialog" : "region"));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'), "Overflow at " + width);
    if (width <= 700) { assert.ok(await evaluate('document.querySelector(".inventory-detail-panel").getBoundingClientRect().width>=innerWidth-2')); assert.ok(await evaluate('document.querySelector(".inventory-stock-report").inert')); const focused = await evaluate('(()=>{const buttons=Array.from(document.querySelectorAll(".inventory-detail-panel button"));buttons.at(-1).focus();return buttons.at(-1).textContent;})()'); assert.ok(focused); await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" }); assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), "Close item details"); }
    await evaluate('document.querySelector(".inventory-detail-panel").scrollTop=0');
    await screenshot("details-dark-" + width);
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await click('button[aria-label="Close item details"]'); assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2')); await evaluate('document.querySelector(".main").scrollTop=0;window.scrollTo(0,0)'); await screenshot("phone-dark-table");
  await evaluate('localStorage.setItem("stocrant.language","ar");localStorage.setItem("stocrant-theme","light")'); await navigate('/warehouse?q=LT-QA-104&item=' + laptop.id); await ready();
  assert.equal(await evaluate('document.documentElement.dir'), "rtl"); assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2')); await screenshot("phone-arabic-light-details");
  await evaluate('localStorage.setItem("stocrant.language","en");localStorage.setItem("stocrant-theme","dark")'); failInventory = true; await navigate(); await until('document.querySelector(".inventory-page [role=alert]")?.textContent.includes("temporarily unavailable")'); failInventory = false; await button("Try again"); await ready(); assert.ok((await rowIds()).includes(laptop.id));
  const temp = randomBytes(24).toString("hex"), viewerPassword = randomBytes(24).toString("hex");
  const viewer = (await req("/workspace/access/users", "POST", { name: "Inventory Reader", email: "reader@inventory-browser.test", password: temp, roleId: "role-employee", organizationIds: [firstCompany.id], ownRecordsOnly: false })).data.item;
  await req('/workspace/access/users/' + viewer.id, "PATCH", { permissions: ["inventory.view"] });
  cookie = cookieFor((await req("/auth/login", "POST", { email: "reader@inventory-browser.test", password: temp }, "")).response);
  await req("/auth/password", "POST", { currentPassword: temp, newPassword: viewerPassword });
  cookie = cookieFor((await req("/auth/login", "POST", { email: "reader@inventory-browser.test", password: viewerPassword }, "")).response); activePassword = viewerPassword;
  await setCookie(); await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }); await navigate('/warehouse?q=LT-QA-104&item=' + laptop.id); await ready();
  assert.ok(!await evaluate('Array.from(document.querySelectorAll(".inventory-page button")).some(button=>["New item","Edit","Record movement"].includes(button.textContent.trim()))'));
  const blocked = await evaluate('fetch("/api/workspace/inventory/movements",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({inventoryItemId:' + JSON.stringify(laptop.id) + ',type:"incoming",quantity:1,date:"2026-10-20",reason:"Unauthorized"})}).then(response=>response.status)'); assert.equal(blocked, 403);
  cookie = mainCookie;
  console.log("Inventory checks passed: real API balances and movement refresh, combined search/company/location/status filters, low-stock rules, legacy/missing/broken photos, field mapping, preserved filters, keyboard focus/action popover, print breakdown, phone/full-screen and Arabic layouts, reduced motion, loading/retry/empty states and read-only permissions.");
} catch (error) { if (browser) console.log(await browser.evaluate('document.querySelector(".main")?.innerText.slice(-3500)||document.body.innerText.slice(-3500)')); throw error; }
finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && root.includes("stocrant-test-data-inventory-browser-")); rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); }
