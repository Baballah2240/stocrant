import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { browserQa } from "./browser-qa.mjs";

const root = mkdtempSync(join(tmpdir(), "stocrant-test-data-org-admin-browser-"));
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
  cookie = session(await req("/auth/setup", "POST", { name: "Test Owner", email: "owner@org-admin-browser.test", password, setupKey: "local-setup" }));
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
  const org = (await req("/collections/organizations", "POST", { name: "Browser Admin Organization", status: "active" })).data.item;
  const company = (await req("/collections/companies", "POST", { name: "Browser Admin Company", parentOrganizationId: org.id, status: "active", organizationType: "office", industry: "services", currency: "SDG" })).data.item;
  const people = [];
  for (const [name, email] of [["Company Administrator", "company@org-admin-browser.test"], ["HR Staff Person", "staff@org-admin-browser.test"]]) {
    const employee = (await req("/collections/employees", "POST", { name, email, organizationId: company.id, status: "active", hireDate: "2026-10-23" })).data.item;
    const invitation = (await req(`/workspace/hr/communication/employees/${employee.id}/invitation`, "POST")).data;
    const pass = secret();
    await req("/auth/activate-employee", "POST", { token: invitation.token, email, password: pass });
    const account = (await req(`/workspace/company-profiles/${company.id}`)).data.employees.find(person => person.id === employee.id).account;
    people.push({ ...employee, accountId: account.id, password: pass });
  }
  await navigate(`/organizations?org=${org.id}`);
  await until('Boolean(document.querySelector(".organization-admin-card button:not(:disabled)"))');
  await button("Assign main admin", ".organization-admin-card");
  await fill(".organization-admin-form select", "new");
  await fill('.organization-admin-form input[type="text"]', "Browser Organization Main Admin");
  await fill('.organization-admin-form input[type="email"]', "org@org-admin-browser.test");
  const temporary = secret();
  await fill('.organization-admin-form input[type="password"]', temporary);
  await evaluate('document.querySelector(".organization-admin-form").requestSubmit()');
  await until('!document.querySelector(".organization-admin-form") && document.querySelector(".organization-admin-card")?.textContent.includes("Browser Organization Main Admin")');
  const primary = (await req(`/workspace/organization-admins/${org.id}`)).data.admin;
  assert.ok(primary.id);
  async function login(email, pass, rotate = false) {
    cookie = session(await req("/auth/login", "POST", { email, password: pass }));
    password = pass;
    if (rotate) { password = secret(); await req("/auth/password", "POST", { currentPassword: pass, newPassword: password }); cookie = session(await req("/auth/login", "POST", { email, password })); }
  }
  await login("org@org-admin-browser.test", temporary, true);
  const orgCookie = cookie, orgPassword = password;
  const companyPath = `/organization/companies/${company.id}?section=users`;
  await navigate(companyPath);
  await until('document.querySelectorAll(".company-staff-access select option").length>4');
  await fill(".company-staff-access select", people[0].accountId);
  await fill(".company-staff-access label:nth-child(2) select", "role-company-manager");
  await evaluate('document.querySelector(".company-staff-access form").requestSubmit()');
  await until('Boolean(document.querySelector(".company-staff-access [role=status]"))');
  assert.equal((await req("/workspace/access/users")).data.items.find(row => row.id === people[0].accountId).roleId, "role-company-manager");
  await login(people[0].email, people[0].password);
  const companyCookie = cookie, companyPassword = password;
  await navigate(companyPath);
  await until('document.querySelectorAll(".company-staff-access select option").length>3');
  assert.ok(!await evaluate('Array.from(document.querySelectorAll(".company-staff-access label:nth-child(2) option")).some(option=>option.value==="role-company-manager")'));
  await fill(".company-staff-access select", people[1].accountId);
  for (const role of ["role-hr-staff", "role-hr-manager", "role-employee"]) {
    await fill(".company-staff-access label:nth-child(2) select", role);
    await evaluate('document.querySelector(".company-staff-access form").requestSubmit()');
    await until('Boolean(document.querySelector(".company-staff-access [role=status]")) && !document.querySelector(".company-staff-access button.primary").disabled');
    assert.equal((await req("/workspace/access/users")).data.items.find(row => row.id === people[1].accountId).roleId, role);
  }
  const directory = resolve(".local-preview/qa/organization-admins"); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "company-staff-en-desktop.png"), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 1000, deviceScaleFactor: 1, mobile: true });
  await evaluate('localStorage.setItem("stocrant.language","ar");localStorage.setItem("stocrant-theme","dark")');
  await navigate(companyPath);
  await until('document.documentElement.dir==="rtl" && Boolean(document.querySelector(".company-staff-access"))');
  await evaluate('document.querySelector(".company-staff-access").scrollIntoView({block:"start"})');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
  writeFileSync(join(directory, "company-staff-ar-mobile.png"), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  cookie = ownerCookie;
  await req(`/workspace/organization-admins/${org.id}`, "POST", { version: 1, accountId: people[0].accountId });
  const stale = await fetch(base + "/api/workspace/access/users", { headers: { Cookie: companyCookie } }); assert.equal(stale.status, 401);
  // Original organization admin remains authorized until explicitly changed.
  cookie = orgCookie; password = orgPassword;
  await navigate(`/organizations?org=${org.id}`);
  await until('document.querySelector(".organization-admin-card")?.textContent.includes("Company Administrator")');
  assert.ok(!await evaluate('Boolean(document.querySelector(".organization-admin-card button"))'));
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
  writeFileSync(join(directory, "organization-admin-ar-mobile.png"), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  assert.ok(companyPassword);
  console.log("Organization administration browser checks passed: create main admin from the organization page, real first-login rotation, organization-to-company admin delegation, company HR/Staff assignments, role restrictions, replacement/session revocation and Arabic mobile layouts.");
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && root.includes("stocrant-test-data-org-admin-browser-"));
  rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
