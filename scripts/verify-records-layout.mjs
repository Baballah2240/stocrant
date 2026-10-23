import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { browserQa } from "./browser-qa.mjs";

const root = mkdtempSync(join(tmpdir(), "stocrant-test-data-records-browser-"));
process.env.STOCRANT_DATA_DIR = root;
process.env.NODE_ENV = "development";
const { createApp } = await import("../dist/app.js");
const server = createApp().listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const secret = () => randomBytes(24).toString("hex");
let cookie = "", password = secret(), browser;
async function req(path, method = "GET", body) {
  const response = await fetch(base + "/api" + path, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  assert.ok(response.ok, `${response.status}: ${JSON.stringify(data)}`);
  return { data, response };
}
const session = result => result.response.headers.get("set-cookie").split(";")[0];
try {
  cookie = session(await req("/auth/setup", "POST", { name: "Test Owner", email: "owner@records-browser.test", password, setupKey: "local-setup" }));
  const ownerCookie = cookie;
  browser = await browserQa(root);
  const { send, evaluate, until } = browser;
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  async function fill(selector, value) {
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw Error('Missing '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  }
  async function button(text, container) {
    await evaluate(`(()=>{const button=Array.from(document.querySelectorAll(${JSON.stringify(container + " button")})).find(el=>el.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Missing button '+${JSON.stringify(text)});button.click();})()`);
  }
  async function navigate(path) {
    await send("Network.setCookie", { name: "stocrant_session", value: cookie.slice(cookie.indexOf("=") + 1), url: base, path: "/" });
    await send("Page.navigate", { url: base + path });
    await until('Boolean(document.querySelector(".app-lock-screen input[type=password]"))');
    await fill('.app-lock-screen input', password);
    await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');
    await until('Boolean(document.querySelector(".topbar"))');
  }
  const org = (await req("/collections/organizations", "POST", { name: "Records layout organization", status: "active" })).data.item;
  const company = (await req("/collections/companies", "POST", { name: "Records layout company", parentOrganizationId: org.id, status: "active", organizationType: "office", industry: "services", currency: "SDG" })).data.item;
  const people = [];
  for (let index = 0; index < 23; index++) people.push((await req("/collections/employees", "POST", { name: `Layout Person ${String(index).padStart(2,"0")}`, email: `person${index}@records-browser.test`, organizationId: company.id, status: index === 0 ? "terminated" : "active", hireDate: "2026-10-23", department: "Operations", jobTitle: "Team member" })).data.item);
  const path = `/hr/employees?company=${company.id}`;
  await navigate(path); await until('document.querySelectorAll(".entity-record-table tbody tr").length===20');
  assert.ok(await evaluate('document.querySelectorAll(".workspace-nav-group").length>=3'));
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".entity-record-table tbody tr")).every(row=>row.getBoundingClientRect().height<105)'), "Compact table rows");
  await button("Next", ".entity-pagination"); await until('document.querySelectorAll(".entity-record-table tbody tr").length===3');
  await fill(".entity-search input", "Layout Person 01"); await until('document.querySelectorAll(".entity-record-table tbody tr").length===1');
  await evaluate('document.querySelector(".record-menu-trigger").click()'); await until('Boolean(document.querySelector(".record-action-menu"))');
  assert.equal(await evaluate('document.activeElement?.getAttribute("role")'), "menuitem");
  const down = { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 };
  await send("Input.dispatchKeyEvent", down);
  assert.equal(await evaluate('document.activeElement?.textContent.trim()'), "✎Edit");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "End", code: "End", windowsVirtualKeyCode: 35 });
  assert.ok(await evaluate('document.activeElement.classList.contains("record-delete")'));
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await until('!document.querySelector(".record-action-menu")'); assert.ok(await evaluate('document.activeElement.classList.contains("record-menu-trigger")'));
  await evaluate('document.querySelector(".record-menu-trigger").click()'); await until('Boolean(document.querySelector(".record-action-menu"))');
  await evaluate('document.querySelector(".entity-results").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');
  await until('!document.querySelector(".record-action-menu")');
  await evaluate('document.querySelector(".record-menu-trigger").click()'); await until('Boolean(document.querySelector(".record-action-menu"))');
  await evaluate('document.querySelectorAll(".record-action-menu a")[1].click()'); await until('Boolean(document.querySelector(".entity-form"))');
  assert.ok(await evaluate('location.pathname.endsWith("/edit")'));
  await navigate(path); await until('document.querySelectorAll(".entity-record-table tbody tr").length===20');
  await fill(".entity-toolbar .entity-filter select", "terminated"); await until('document.querySelectorAll(".entity-record-table tbody tr").length===1');
  await button("Clear filters", ".entity-results"); await until('document.querySelectorAll(".entity-record-table tbody tr").length===20');
  await fill(".entity-filter:last-child select", "name"); await until('document.querySelector(".record-name-cell")?.textContent.includes("Layout Person 00")');
  // A pending approval must keep the record visible until the server approves deletion.
  await evaluate('(()=>{const original=window.fetch;window.confirm=()=>true;window.fetch=(url,options)=>options?.method==="DELETE"&&String(url).includes("/collections/employees/")?Promise.resolve(new Response(JSON.stringify({pending:true,entity:"employees"}),{status:202,headers:{"Content-Type":"application/json"}})):original(url,options);})()');
  await evaluate('document.querySelector(".record-menu-trigger").click()'); await until('Boolean(document.querySelector(".record-action-menu"))');
  await evaluate('document.querySelector(".record-action-menu .record-delete").click()');
  await until('document.querySelector(".entity-list-page [role=status]")?.textContent.includes("approval")');
  assert.equal(await evaluate('document.querySelectorAll(".entity-record-table tbody tr").length'), 20);
  const directory = resolve(".local-preview/qa/records-layout"); mkdirSync(directory, { recursive: true });
  for (const [language, theme, width] of [["en","light",1440],["ar","dark",1440],["ar","light",768],["ar","dark",390],["en","light",320]]) {
    await evaluate(`localStorage.setItem("stocrant.language",${JSON.stringify(language)});localStorage.setItem("stocrant-theme",${JSON.stringify(theme)})`);
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 });
    await navigate(path); await until('Boolean(document.querySelector(".entity-record-table tbody tr"))');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'), `No page overflow ${language}/${width}`);
    assert.ok(await evaluate('(()=>{const style=getComputedStyle(document.querySelector(".entity-search input"));return parseFloat(document.documentElement.dir==="rtl"?style.paddingRight:style.paddingLeft)>=36;})()'), "Search text clears its icon");
    await evaluate('document.querySelector(".record-menu-trigger").click()'); await until('Boolean(document.querySelector(".record-action-menu"))');
    assert.ok(await evaluate('(()=>{const r=document.querySelector(".record-action-menu").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()'), `Action menu stays on screen ${width}`);
    writeFileSync(join(directory, `records-${language}-${theme}-${width}.png`), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  }
  // Employee permissions: the visual redesign must not expose HR edit/delete actions.
  const person = people[1], invitation = (await req(`/workspace/hr/communication/employees/${person.id}/invitation`, "POST")).data, employeePassword = secret();
  await req("/auth/activate-employee", "POST", { token: invitation.token, email: person.email, password: employeePassword });
  cookie = session(await req("/auth/login", "POST", { email: person.email, password: employeePassword })); password = employeePassword;
  await navigate(path); await until('Boolean(document.querySelector(".entity-record-table tbody tr"))');
  assert.equal(await evaluate('document.querySelectorAll(".record-menu-trigger").length'), 0);
  console.log("Records layout browser checks passed: compact rows, grouped navigation, pagination, search/status/sort, keyboard menu focus/Escape/edit navigation, on-screen RTL menus at desktop/tablet/mobile sizes and permission-aware employee actions.");
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && root.includes("stocrant-test-data-records-browser-"));
  rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
