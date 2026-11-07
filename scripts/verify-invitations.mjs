import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { browserQa } from "./browser-qa.mjs";

const root = mkdtempSync(join(tmpdir(), "stocrant-test-data-invitations-browser-"));
process.env.STOCRANT_DATA_DIR = root;
process.env.STOCRANT_ATTENDANCE_PILOT = "1";
process.env.NODE_ENV = "development";
const { createApp } = await import("../dist/app.js");
const server = createApp().listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const password = randomBytes(24).toString("hex");
let cookie = "", browser;
async function req(path, method = "GET", body) {
  const response = await fetch(base + "/api" + path, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return { data, response };
}
try {
  const setup = await req("/auth/setup", "POST", { name: "Pilot Owner", email: "owner@browser.test", password, setupKey: "local-setup" });
  cookie = setup.response.headers.get("set-cookie").split(";")[0];
  const org = (await req("/collections/organizations", "POST", { name: "Pilot", status: "active" })).data.item;
  const company = (await req("/collections/companies", "POST", { name: "Amal Pilot Company", parentOrganizationId: org.id, status: "active", organizationType: "office", industry: "services", currency: "SDG" })).data.item;
  browser = await browserQa(root);
  const { send, evaluate, until } = browser;
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Network.setCookie", { name: "stocrant_session", value: cookie.slice(cookie.indexOf("=") + 1), url: base, path: "/" });
  await send("Page.navigate", { url: base + "/admin?tab=Invitations" });
  async function fill(selector, value) {
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw Error('Missing field '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  }
  await until('Boolean(document.querySelector(".app-lock-screen input[type=password]"))');
  await fill('.app-lock-screen input', password);
  await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');
  await until('document.body.textContent.includes("Create invitation link")');
  await fill('.settings-content form input:not([type])', "Amal Browser");
  await fill('.settings-content form input[type=email]', "amal@browser.test");
  await fill('.settings-content form select', company.id);
  await evaluate('document.querySelector(".settings-content form").requestSubmit()');
  await until('Boolean(document.querySelector(".settings-content aside input"))');
  const invitationUrl = await evaluate('document.querySelector(".settings-content aside input").value');
  assert.ok(invitationUrl.startsWith(base + "/login#invite="));
  await until('document.querySelector(".settings-content table").textContent.includes("amal@browser.test")');
  const screenshots = join(process.cwd(), ".local-preview", "invitations"); mkdirSync(screenshots, { recursive: true });
  writeFileSync(join(screenshots, "desktop.png"), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  // Verify the navigation and invitation table at mobile width.
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('Boolean(document.querySelector(".grouped-settings-nav [aria-current=page]"))'));
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
  writeFileSync(join(screenshots, "mobile.png"), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  await send("Network.clearBrowserCookies");
  await send("Page.navigate", { url: invitationUrl });
  await until('Boolean(document.querySelector(".auth-card input[type=email]"))');
  await fill('.auth-card input[type=email]', "amal@browser.test");
  await fill('.auth-card input[autocomplete=new-password]', password);
  await fill('.auth-card input[type=password]:last-of-type', password);
  // Password inputs live in separate labels, so explicitly fill both.
  await evaluate(`(()=>{for(const input of document.querySelectorAll('.auth-card input[type=password]')){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(password)});input.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  await evaluate('document.querySelector(".auth-card").requestSubmit()');
  await until('document.body.textContent.includes("Your account is ready.")');
  const account = (await req("/workspace/access/users")).data.items.find(row => row.email === "amal@browser.test");
  assert.equal(account.roleId, "role-employee"); assert.deepEqual(account.organizationIds, [company.id]);
  console.log("PASS: desktop Invitations form, mobile layout, private activation link and recipient password setup with company/role isolation.");
} catch (error) { console.error(error); process.exitCode = 1; } finally {
  if (browser) await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.ok(root.includes("stocrant-test-data-"));
  try { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (error) { console.error("Temporary browser directory cleanup blocked:", error.code); }
}
