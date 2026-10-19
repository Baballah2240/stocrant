import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { browserQa } from "./browser-qa.mjs";

const root = mkdtempSync(join(tmpdir(), "stocrant-test-data-redesign-"));
process.env.STOCRANT_DATA_DIR = root;
process.env.NODE_ENV = "development";
const { createApp } = await import("../dist/app.js");
const server = createApp().listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const password = randomBytes(24).toString("hex");
let browser;
const routes = ["/", "/organizations", "/locations", "/hr", "/hr/employees", "/hr/attendance", "/hr/leaveRequests", "/hr/departments", "/hr/employeeHistory", "/hr/documents", "/hr/communication", "/hr/payroll", "/me/payroll", "/operations", "/stores/products", "/stores/suppliers", "/stores/customers", "/warehouse", "/finance", "/customer-service", "/admin", "/security", "/report", "/calculator", "/stores", "/places", "/people", "/mobile-more", "/about"];
const selectedRoutes = process.env.STOCRANT_QA_ROUTES ? process.env.STOCRANT_QA_ROUTES.split(",") : routes;
assert.ok(selectedRoutes.length && selectedRoutes.every(route => routes.includes(route)), "Unknown QA route");
try {
  const setup = await fetch(base + "/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Redesign Reviewer", email: "review@redesign.test", password, setupKey: "local-setup" }) });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  browser = await browserQa(root);
  const { send, evaluate, until } = browser;
  const exceptions = [];
  // The transport evaluates expressions with exception reporting; also collect
  // uncaught browser errors across route changes.
  await send("Network.enable");
  await send("Page.enable");
  await send("Network.setCookie", { name: "stocrant_session", value: cookie.slice(cookie.indexOf("=") + 1), url: base, path: "/" });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__qaErrors=[];window.addEventListener('error',e=>window.__qaErrors.push(e.message));" });
  async function navigate(path) {
    await send("Page.navigate", { url: base + path });
    await until('Boolean(document.querySelector(".app-lock-screen input[type=password]"))');
    await evaluate(`(()=>{const input=document.querySelector('.app-lock-screen input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(password)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');
    await until('Boolean(document.querySelector(".main .page")) && !document.querySelector(".main .skeleton")');
    await until('!Array.from(document.querySelectorAll(".main .hint")).some(n=>/^(Loading|جارٍ تحميل)/u.test(n.textContent.trim()))');
  }
  async function screenshot(name) {
    if (process.env.STOCRANT_QA_SCREENSHOTS !== "1") return;
    const directory = resolve(".local-preview/qa/redesign");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, name + ".png"), Buffer.from((await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })).data, "base64"));
  }
  await navigate("/");
  await evaluate('localStorage.setItem("stocrant-sidebar-collapsed","false")');
  for (const [language, theme] of [["en", "light"], ["en", "dark"], ["ar", "light"], ["ar", "dark"]]) {
    await evaluate(`localStorage.setItem('stocrant.language',${JSON.stringify(language)});localStorage.setItem('stocrant-theme',${JSON.stringify(theme)})`);
    for (const [width, height] of [[1440, 1000], [1024, 900], [390, 844]]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
      for (const path of selectedRoutes) {
        await navigate(path);
        const state = await evaluate(`({theme:document.documentElement.dataset.theme,dir:document.documentElement.dir,width:document.documentElement.scrollWidth,viewport:innerWidth,heading:document.querySelector('.main h1,.main h2')?.textContent,errors:window.__qaErrors,body:document.querySelector('.main').textContent})`);
        assert.equal(state.theme, theme, path);
        assert.equal(state.dir, language === "ar" ? "rtl" : "ltr", path);
        assert.ok(state.width <= state.viewport + 2, `Overflow at ${path} ${language}/${theme}/${width}: ${state.width}`);
        assert.ok(state.heading, `Missing page heading: ${path}`);
        assert.doesNotMatch(state.body, /Something went wrong|Could not load|حدث خطأ غير متوقع/);
        exceptions.push(...state.errors);
        if (["/", "/hr", "/finance", "/warehouse", "/hr/payroll", "/admin"].includes(path) && (width === 1440 || width === 390)) await screenshot(`${language}-${theme}-${width}-${path === "/" ? "dashboard" : path.replaceAll("/", "-").slice(1)}`);
        if (path === "/finance") {
          await evaluate(`(()=>{const buttons=Array.from(document.querySelectorAll('.page-head button'));buttons[buttons.length-1].click();})()`);
          await until('Boolean(document.querySelector(".finance-page form"))');
          assert.equal(await evaluate('document.querySelector(".finance-page form select:nth-of-type(1)") !== null'), true);
          assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'), `Account form overflow: ${language}/${theme}/${width}`);
          // Localized options must retain the API's original enum values.
          assert.equal(await evaluate('document.querySelector(".finance-page form option[value=bank]").value'), "bank");
        }
      }
      console.log(`Verified ${selectedRoutes.length} routes: ${language}/${theme}, ${width}px`);
    }
  }
  assert.deepEqual(exceptions, []);
  // Preference independence, immediate updates, persistence, and live OS changes.
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate("/finance");
  await evaluate('(()=>{const buttons=Array.from(document.querySelectorAll(".page-head button"));buttons[buttons.length-1].click();})()');
  await until('Boolean(document.querySelector(".finance-page form input[type=text]"))');
  await evaluate('(()=>{const input=document.querySelector(".finance-page form input[type=text]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"Unsubmitted draft");input.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await evaluate(`(()=>{const select=document.querySelector('.appearance-selector select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'system');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until('localStorage.getItem("stocrant-theme")==="system"');
  for (const value of ["light", "dark", "light"]) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value }] });
    await until(`document.documentElement.dataset.theme===${JSON.stringify(value)}`);
    assert.equal(await evaluate('localStorage.getItem("stocrant.language")'), "ar");
  }
  await evaluate('document.querySelector(".language-toggle").click()');
  await until('document.documentElement.dir==="ltr"');
  assert.equal(await evaluate('localStorage.getItem("stocrant-theme")'), "system");
  assert.equal(await evaluate('document.querySelector(".finance-page form input[type=text]").value'), "Unsubmitted draft");
  await navigate("/finance");
  assert.equal(await evaluate('document.documentElement.dataset.theme'), "light");
  assert.equal(await evaluate('document.querySelector(".appearance-selector select").value'), "system");
  console.log(`Redesign checks passed: ${selectedRoutes.length * 12} route/language/theme/viewport combinations, no uncaught errors, live system appearance, independent preferences and persistence.`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && root.includes("stocrant-test-data-redesign-"));
  rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
