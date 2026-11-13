import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { browserQa } from "./browser-qa.mjs";
const root = mkdtempSync(join(tmpdir(), "stocrant-test-data-sidebar-")); process.env.STOCRANT_DATA_DIR = root; process.env.NODE_ENV = "development";
const { createApp } = await import("../dist/app.js");
const server = createApp().listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
const base = "http://127.0.0.1:" + server.address().port, password = randomBytes(24).toString("hex");
let browser, cookie = "", activePassword = password;
const directory = resolve(".local-preview/qa/sidebar"); mkdirSync(directory, { recursive: true });
async function api(path, method = "GET", body, auth = cookie) { const response = await fetch(base + "/api" + path, { method, headers: { Cookie: auth, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); const data = await response.json(); assert.ok(response.ok, path + ": " + JSON.stringify(data)); return { data, response }; }
const cookieFor = response => response.headers.get("set-cookie").split(";")[0];
try {
  cookie = cookieFor((await api("/auth/setup", "POST", { name: "Navigation Reviewer", email: "navigation@sidebar.test", password, setupKey: "local-setup" })).response);
  const org = (await api("/collections/organizations", "POST", { name: "Navigation Organization", status: "active" })).data.item;
  const company = (await api("/collections/companies", "POST", { name: "Navigation Company", parentOrganizationId: org.id, status: "active", organizationType: "office", industry: "services", currency: "QAR" })).data.item;
  browser = await browserQa(root); const { send, evaluate, until } = browser; await send("Network.enable");
  const setCookie = () => send("Network.setCookie", { name: "stocrant_session", value: cookie.slice(cookie.indexOf("=") + 1), url: base, path: "/" }); await setCookie();
  const frame = () => evaluate("new Promise(resolve=>requestAnimationFrame(resolve))");
  async function fill(selector, value) { await until('Boolean(document.querySelector(' + JSON.stringify(selector) + '))'); await evaluate('(()=>{const input=document.querySelector(' + JSON.stringify(selector) + ');input.focus();Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),"value").set.call(input,' + JSON.stringify(value) + ');input.dispatchEvent(new Event("input",{bubbles:true}));})()'); await frame(); }
  async function click(selector) { await until('Boolean(document.querySelector(' + JSON.stringify(selector) + '))'); await evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()'); await frame(); }
  async function navigate(path) { await send("Page.navigate", { url: base + path }); await until('Boolean(document.querySelector(".app-lock-screen input")||document.querySelector(".topbar"))'); if (await evaluate('Boolean(document.querySelector(".app-lock-screen input"))')) { await fill('.app-lock-screen input', activePassword); await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()'); } await until('Boolean(document.querySelector(".topbar"))'); await until('Boolean(document.querySelector("#main-content h1, #main-content h2"))'); if (await evaluate('Boolean(document.querySelector(".inventory-page"))')) await until('document.querySelector(".inventory-page").getAttribute("aria-busy")==="false"'); await frame(); }
  async function size(width, height = 1000) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 700 }); await frame(); }
  async function screenshot(name) { await evaluate('Promise.all(Array.from(document.querySelectorAll(".workspace-navigation")).flatMap(node=>node.getAnimations({subtree:true})).filter(animation=>animation.effect.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})))'); writeFileSync(join(directory, name + ".png"), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64")); }
  const group = id => '.sidebar [data-nav-group="' + id + '"]';
  await size(1440); await navigate('/warehouse');
  await until('document.querySelectorAll(".sidebar .workspace-section-toggle").length===5');
  assert.equal(await evaluate('document.querySelector(' + JSON.stringify(group('operations') + ' button') + ').getAttribute("aria-expanded")'), "true");
  assert.equal(await evaluate('document.querySelectorAll(".sidebar a[aria-current=page]").length'), 1);
  await click(group('operations') + ' button'); assert.ok(await evaluate('document.querySelector(' + JSON.stringify(group('operations') + ' .workspace-group-links') + ').hidden'));
  await evaluate('document.querySelector(' + JSON.stringify(group('operations') + ' button') + ').focus()'); await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await until('document.querySelector(' + JSON.stringify(group('operations') + ' button') + ').getAttribute("aria-expanded")==="true"');
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown" }); assert.equal(await evaluate('document.activeElement.closest("section").dataset.navGroup'), "finance");
  await click(group('workspace') + ' button'); await navigate('/warehouse'); assert.equal(await evaluate('document.querySelector(' + JSON.stringify(group('workspace') + ' button') + ').getAttribute("aria-expanded")'), "false");
  await fill('.sidebar input[type=search]', "Finance"); await click('.sidebar a[href="/finance"]'); await until('location.pathname==="/finance"'); assert.equal(await evaluate('document.querySelector(' + JSON.stringify(group('finance') + ' button') + ').getAttribute("aria-expanded")'), "true");
  await fill('.sidebar input[type=search]', "Customer Service"); assert.equal(await evaluate('document.querySelectorAll(".sidebar .workspace-group-links a").length'), 1);
  assert.equal(await evaluate('document.querySelector(".sidebar .workspace-group-links a").getAttribute("href")'), "/customer-service");
  await fill('.sidebar input[type=search]', "no-such-page"); assert.ok(await evaluate('document.querySelector(".workspace-nav-empty").textContent.includes("No pages match")'));
  await evaluate('document.querySelector(".sidebar input[type=search]").focus()'); await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await until('document.querySelector(".sidebar input[type=search]").value===""');
  await click('.workspace-sidebar-toggle'); assert.ok(await evaluate('document.querySelector(".sidebar").inert')); await until('document.querySelector(".sidebar").getBoundingClientRect().width<1');
  await click('.workspace-sidebar-toggle'); assert.ok(await evaluate('!document.querySelector(".sidebar").inert')); await until('Math.round(document.querySelector(".sidebar").getBoundingClientRect().width)===248');
  await navigate('/hr/payroll'); assert.equal(await evaluate('document.querySelector(".sidebar a[aria-current=page]").getAttribute("href")'), "/hr/payroll");
  await navigate('/inventory'); assert.equal(await evaluate('document.querySelector(".sidebar a[aria-current=page]").getAttribute("href")'), "/warehouse");
  for (const [language, theme] of [["en","light"],["en","dark"],["ar","light"],["ar","dark"]]) {
    await evaluate('localStorage.setItem("stocrant.language",' + JSON.stringify(language) + ');localStorage.setItem("stocrant-theme",' + JSON.stringify(theme) + ')'); await navigate('/warehouse');
    assert.equal(await evaluate('document.documentElement.dir'), language === "ar" ? "rtl" : "ltr"); assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
    await screenshot('desktop-' + language + '-' + theme);
  }
  await evaluate('localStorage.setItem("stocrant.language","en");localStorage.setItem("stocrant-theme","dark")'); await navigate('/workspace'); assert.equal(Math.round(await evaluate('document.querySelector(".sidebar").getBoundingClientRect().width')), 248);
  await navigate('/warehouse'); await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  assert.ok(await evaluate('parseFloat(getComputedStyle(document.querySelector(".workspace-section-toggle")).transitionDuration)<.001'));
  await evaluate('document.documentElement.style.fontSize="32px"'); await frame();
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".sidebar .workspace-section-label,.sidebar .nav-label")).filter(node=>node.getClientRects().length).every(node=>node.scrollWidth<=node.clientWidth+2)'));
  await screenshot('desktop-large-text'); await evaluate('document.documentElement.style.fontSize=""'); await frame();
  for (const [width, height] of [[1024,768],[800,900],[812,375]]) { await size(width,height); assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'), "Overflow at " + width); await until('(()=>{const list=document.querySelector(".sidebar .workspace-section-list").getBoundingClientRect(),item=document.querySelector(".sidebar a[aria-current=page]").getBoundingClientRect();return item.top>=list.top-2&&item.bottom<=list.bottom+2})()'); await screenshot('tablet-' + width); }
  for (const width of [375,430]) {
    await size(width, 900); await until('Boolean(document.querySelector(".mobile-header-control"))');
    await evaluate('(()=>{const trigger=document.querySelector(".mobile-header-control");trigger.focus();trigger.click();})()');
    await until('document.querySelector("#mobile-account-menu").open'); assert.equal(await evaluate('document.querySelectorAll("#mobile-account-menu .workspace-section-toggle").length'), 5);
    await fill('#mobile-account-menu input[type=search]', "Inventory"); assert.equal(await evaluate('document.querySelectorAll("#mobile-account-menu .workspace-group-links a").length'),1);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await until('document.querySelector("#mobile-account-menu input[type=search]").value===""'); assert.ok(await evaluate('document.querySelector("#mobile-account-menu").open'));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2')); await screenshot('phone-menu-' + width);
    await click('#mobile-account-menu a[href="/warehouse"]'); await until('!document.querySelector("#mobile-account-menu").open');
    await click('button[aria-label="Open account menu"]'); await until('document.querySelector("#mobile-account-menu").open'); await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await until('!document.querySelector("#mobile-account-menu").open');
  }
  await evaluate('localStorage.setItem("stocrant.language","ar")'); await navigate('/warehouse'); await click('.mobile-header-control'); await until('document.querySelector("#mobile-account-menu").open'); await screenshot('phone-arabic-menu');
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const temporary = randomBytes(24).toString("hex"), staffPassword = randomBytes(24).toString("hex");
  const staff = (await api("/workspace/access/users", "POST", { name: "Inventory Viewer", email: "viewer@sidebar.test", password: temporary, roleId: "role-company-manager", organizationIds: [company.id], ownRecordsOnly: false })).data.item;
  await api('/workspace/access/users/' + staff.id, "PATCH", { permissions: ["inventory.view"] });
  cookie = cookieFor((await api("/auth/login", "POST", { email: "viewer@sidebar.test", password: temporary }, "")).response); await api("/auth/password", "POST", { currentPassword: temporary, newPassword: staffPassword });
  cookie = cookieFor((await api("/auth/login", "POST", { email: "viewer@sidebar.test", password: staffPassword }, "")).response); activePassword = staffPassword; await setCookie(); await size(1440); await evaluate('localStorage.setItem("stocrant.language","en")'); await navigate('/warehouse');
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".sidebar a")).some(link=>link.getAttribute("href")==="/warehouse")'));
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".sidebar a")).some(link=>link.getAttribute("href")==="/warehouse")'));
  await fill('.sidebar input[type=search]', "Customer Service"); assert.ok(await evaluate('Boolean(document.querySelector(".sidebar .workspace-nav-empty"))'));
  assert.equal(await evaluate('fetch("/api/workspace/finance").then(response=>response.status)'), 403);
  console.log("Sidebar checks passed: five dropdown groups, saved preferences, route aliases/current state, permission-filtered search, keyboard controls, hidden-sidebar focus protection, dashboard consistency, light/dark and Arabic layouts, tablet/phone menus, reduced motion and read-only access.");
} catch (error) { if (browser) console.log(await browser.evaluate('document.body.innerText.slice(0,3500)')); throw error; }
finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && root.includes("stocrant-test-data-sidebar-")); rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); }
