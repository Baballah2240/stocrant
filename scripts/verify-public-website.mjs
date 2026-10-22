import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { browserQa } from "./browser-qa.mjs";

const root = mkdtempSync(join(tmpdir(), "stocrant-test-data-public-browser-"));
process.env.STOCRANT_DATA_DIR = root; process.env.NODE_ENV = "development";
const { createApp } = await import("../dist/app.js"), { getStore } = await import("../dist/storage.js");
const server = createApp().listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`, password = randomBytes(24).toString("hex");
const setup = await fetch(base + "/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Public website reviewer", email: "public-reviewer@example.test", password, setupKey: "local-setup" }) });
assert.equal(setup.status, 201); const cookie = setup.headers.get("set-cookie").split(";")[0];
let browser;
const directory = resolve(".local-preview/qa/public-explorer"); mkdirSync(directory, { recursive: true });
try {
  browser = await browserQa(root); const { send, evaluate, until } = browser;
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  async function screenshot(name) { if (process.env.STOCRANT_QA_SCREENSHOTS === "1") writeFileSync(join(directory, `${name}.png`), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64")); }
  async function fill(selector, value) { await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)throw Error('Missing field '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node),'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); }
  for (const width of [1440, 1024, 390, 320]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 });
    await send("Page.navigate", { url: base + "/" }); await until('document.querySelectorAll(".map-node").length===9');
    for (const theme of ["light", "dark"]) {
      if (await evaluate('document.documentElement.dataset.theme') !== theme) await evaluate('document.querySelector(".site-theme").click()');
      await until(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), `Map overflow ${width}/${theme}`);
      assert.ok(await evaluate('Array.from(document.querySelectorAll(".map-node")).every(node=>{const r=node.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;})'), `Clipped map node ${width}/${theme}`);
      await screenshot(`home-${theme}-${width}`);
    }
    await evaluate('document.querySelector(".map-node[aria-label*=Finance]").click()');
    await until('Boolean(document.querySelector(".focus-dialog[open]"))');
    assert.ok(await evaluate('document.querySelector(".focus-dialog").textContent.includes("ledger")'));
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await until('!document.querySelector(".focus-dialog[open]")');
    assert.ok(await evaluate('document.activeElement?.getAttribute("aria-label")==="Explore Finance"'));
    await evaluate('document.querySelector(".map-service").click()'); await until('Boolean(document.querySelector(".service-hero"))');
    assert.equal(await evaluate('location.pathname'), "/services/shop-websites");
    assert.equal(await evaluate('document.querySelectorAll(".plan-grid article").length'), 3);
    assert.ok(await evaluate('document.querySelector(".cost-notes").textContent.includes("no fixed published price")'));
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), `Service overflow ${width}`);
    await screenshot(`service-${width}`);
    await evaluate('document.querySelector(".service-inquiry").scrollIntoView({block:"start"})'); await screenshot(`inquiry-${width}`);
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: base }); await until('Boolean(document.querySelector(".section-map"))');
  const point = await evaluate('(()=>{const r=document.querySelector(".map-node[aria-label*=Finance]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point }); await until('Boolean(document.querySelector(".hover-focus"))');
  assert.ok(await evaluate('document.querySelector(".hover-focus").textContent.includes("Finance")'));
  await screenshot("hover-finance");
  await send("Page.navigate", { url: base + "/explore/finance" }); await until('Boolean(document.querySelector(".module-page"))');
  assert.equal(await evaluate('document.querySelector(".module-connect a").getAttribute("href")'), base + "/finance");
  await send("Page.navigate", { url: base + "/finance" }); await until('Boolean(document.querySelector(".auth-card"))');
  assert.ok(await evaluate('Boolean(document.querySelector(".auth-card input"))'));
  assert.ok(await evaluate('Boolean(document.querySelector(".auth-connected .constellation-background"))'), "Login shares the website star background");
  assert.equal(await evaluate('document.documentElement.dataset.theme'), "dark", "Website appearance carries into login");
  await fill(".appearance-selector select", "light");
  await until('document.documentElement.dataset.theme==="light"');
  await send("Page.navigate", { url: base + "/" }); await until('Boolean(document.querySelector(".map-node"))');
  assert.equal(await evaluate('document.documentElement.dataset.theme'), "light", "Login appearance carries back into the website");
  await send("Page.navigate", { url: base + "/services/shop-websites" }); await until('Boolean(document.querySelector(".inquiry-form"))');
  assert.ok(await evaluate('document.querySelector(".plan-grid").closest("#inquire")===document.querySelector(".inquiry-form").closest("#inquire")'), "Package selection and questions must share one request workspace");
  await evaluate('document.querySelector(".plan-featured button").click()');
  assert.equal(await evaluate('document.querySelector(".request-selection").dataset.plan'), "connected");
  for (const [selector, value] of [["label:nth-child(1) input", "Public Browser Visitor"], ["label:nth-child(2) input", "Browser Shop"], ["label:nth-child(3) input", "browser-visitor@example.test"], ["label:nth-child(4) input", "+974 5555 1234"]]) await fill(`.inquiry-fields ${selector}`, value);
  await fill(".inquiry-fields textarea", "Please contact me about a branded shop with a product catalog.");
  await evaluate('document.querySelector(".inquiry-consent input").click();document.querySelector(".inquiry-form").requestSubmit();document.querySelector(".inquiry-form").requestSubmit()');
  await until('Boolean(document.querySelector(".inquiry-reference"))');
  assert.equal(getStore().collections.websiteInquiries.length, 1);
  const inquiry = getStore().collections.websiteInquiries[0]; assert.equal(inquiry.plan, "connected");
  assert.ok(await evaluate('document.querySelector(".inquiry-success").textContent.includes("Customer Service")'));
  await screenshot("inquiry-received");
  await send("Network.enable"); await send("Network.setCookie", { name: "stocrant_session", value: cookie.slice(cookie.indexOf("=") + 1), url: base, path: "/" });
  await send("Page.navigate", { url: base + `/customer-service?websiteInquiry=${inquiry.id}` });
  await until('Boolean(document.querySelector(".app-lock-screen input[type=password]"))'); await fill(".app-lock-screen input", password); await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');
  await until('Boolean(document.querySelector(".inbox-detail"))');
  assert.ok(await evaluate('document.querySelector(".inbox-detail").textContent.includes("browser-visitor@example.test")'));
  await until('Boolean(document.querySelector(".inbox-detail form select"))');
  await fill(".inbox-detail form select", "contacted"); await fill(".inbox-detail form textarea", "Customer contacted; preparing the website scope."); await evaluate('document.querySelector(".inbox-detail form").requestSubmit()');
  await until('document.querySelector(".inbox-history")?.textContent.includes("preparing the website scope")');
  assert.equal(getStore().collections.websiteInquiries[0].status, "contacted");
  await screenshot("customer-service-inbox");
  await evaluate('localStorage.setItem("stocrant.language","ar")'); await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: base + `/customer-service?websiteInquiry=${inquiry.id}` }); await until('Boolean(document.querySelector(".app-lock-screen input[type=password]"))'); await fill(".app-lock-screen input", password); await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()'); await until('Boolean(document.querySelector(".inbox-detail"))');
  assert.equal(await evaluate('document.documentElement.dir'), "rtl"); assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  await screenshot("customer-service-ar-mobile");
  console.log("Public experience checks passed: 9-section map, hover focus, keyboard/dialog close, 8 responsive theme layouts, service packages and honest prices, public deep links, protected module login, one anonymous inquiry delivered to Customer Service, private follow-up and Arabic mobile inbox. Only isolated test data was used; no external email or call was made.");
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && root.includes("stocrant-test-data-public-browser-"));
  rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
