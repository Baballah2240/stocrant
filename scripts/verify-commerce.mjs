import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { browserQa } from "./browser-qa.mjs";

const root = mkdtempSync(
  join(tmpdir(), "stocrant-test-data-commerce-browser-"),
);
process.env.STOCRANT_DATA_DIR = root;
process.env.NODE_ENV = "development";
const { createApp } = await import("../dist/app.js");
const server = createApp().listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const password = randomBytes(24).toString("hex");
let cookie = "",
  browser;
async function req(path, method = "GET", body) {
  const response = await fetch(base + "/api" + path, {
    method,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.ok(response.ok, `${response.status}: ${JSON.stringify(data)}`);
  return { data, response };
}
// Minimal standards-based XLSX fixture; ZIP entries are stored without compression.
function xlsxFixture(path) {
  const parts = {
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml":
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>sku</t></is></c><c r="B1" t="inlineStr"><is><t>name</t></is></c><c r="C1" t="inlineStr"><is><t>price</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>COFFEE-02</t></is></c><c r="B2" t="inlineStr"><is><t>Excel coffee</t></is></c><c r="C2"><v>25.50</v></c></row></sheetData></worksheet>',
  };
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, value] of Object.entries(parts)) {
    const filename = Buffer.from(name),
      data = Buffer.from(value);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const entry = Buffer.concat([header, filename, data]);
    local.push(entry);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([directory, filename]));
    offset += entry.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(path, Buffer.concat([...local, directory, end]));
}
try {
  const setup = await req("/auth/setup", "POST", {
    name: "Shop QA owner",
    email: "owner@commerce-browser.test",
    password,
    setupKey: "local-setup",
  });
  cookie = setup.response.headers.get("set-cookie").split(";")[0];
  const org = (
    await req("/collections/organizations", "POST", {
      name: "Shop QA organization",
      status: "active",
    })
  ).data.item;
  const company = (
    await req("/collections/companies", "POST", {
      name: "Shop QA company",
      parentOrganizationId: org.id,
      status: "active",
      organizationType: "office",
      industry: "retail",
      currency: "SDG",
    })
  ).data.item;
  browser = await browserQa(root);
  const { send, evaluate, until } = browser;
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  async function fill(label, value, formTitle) {
    await evaluate(
      `(()=>{const root=${formTitle ? `Array.from(document.querySelectorAll('.shop-workspace section')).find(s=>s.querySelector('h2')?.textContent===${JSON.stringify(formTitle)})` : "document.querySelector('.shop-workspace')"};const control=Array.from(root.querySelectorAll('label')).find(el=>el.querySelector('span')?.textContent===${JSON.stringify(label)})?.querySelector('input,select,textarea');if(!control)throw Error('Missing '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control),'value').set.call(control,${JSON.stringify(value)});control.dispatchEvent(new Event(control.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
    );
  }
  async function button(text) {
    await evaluate(
      `(()=>{const b=Array.from(document.querySelectorAll('.shop-workspace button')).find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing '+${JSON.stringify(text)});b.click();})()`,
    );
  }
  async function navigate(path) {
    await send("Network.setCookie", {
      name: "stocrant_session",
      value: cookie.slice(cookie.indexOf("=") + 1),
      url: base,
      path: "/",
    });
    await send("Page.navigate", { url: base + path });
    await until(
      'Boolean(document.querySelector(".app-lock-screen input[type=password]"))',
    );
    await evaluate(
      `(()=>{const input=document.querySelector('.app-lock-screen input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(password)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await evaluate(
      'document.querySelector(".app-lock-screen form").requestSubmit()',
    );
    await until('Boolean(document.querySelector(".shop-tabs"))');
    await fill("Company", company.id);
    await until('!document.querySelector(".shop-controls").disabled');
  }
  await navigate("/shops");
  await fill("SKU", "TEA-01", "Add product");
  await fill("Product name", "Sudan tea", "Add product");
  await fill("Price", "12.35", "Add product");
  await button("Add product");
  await until('document.querySelectorAll(".shop-product").length===1');
  // Exercise Excel's worker under the same script/worker restrictions as hosting.
  await evaluate(`(()=>{const meta=document.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content="default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:";document.head.append(meta);})()`);
  const fixture = join(root, "products.xlsx");
  xlsxFixture(fixture);
  const document = await send("DOM.getDocument");
  const fileInput = await send("DOM.querySelector", {
    nodeId: document.root.nodeId,
    selector: '.shop-workspace input[type="file"]',
  });
  await send("DOM.setFileInputFiles", {
    nodeId: fileInput.nodeId,
    files: [fixture],
  });
  await until('Boolean(document.querySelector(".shop-import-preview"))');
  assert.ok(
    await evaluate(
      'document.querySelector(".shop-import-preview").textContent.includes("Excel coffee")',
    ),
  );
  await button("Confirm import");
  await until('document.querySelectorAll(".shop-product").length===2');
  const tea = (await req(`/workspace/shops/${company.id}`)).data.products.find(
    (p) => p.sku === "TEA-01",
  );
  await button("Incoming shipments");
  await fill("Product", tea.id, "Receive a shipment");
  await fill("Quantity", "10", "Receive a shipment");
  await fill("Supplier", "QA supplier", "Receive a shipment");
  await fill("Shipment reference", "QA-IN-001", "Receive a shipment");
  await button("Confirm receipt");
  await until('document.querySelectorAll(".shop-history").length===1');
  await button("Orders");
  await fill("Customer name", "QA customer", "Create order");
  await fill("Mobile number", "+249 912345678", "Create order");
  await fill("Product", tea.id, "Create order");
  await fill("Quantity", "2", "Create order");
  await button("Create order");
  await until('document.querySelectorAll(".shop-orders>button").length===1');
  assert.ok(
    await evaluate(
      'document.querySelector(".shop-orders").textContent.includes("24.70")',
    ),
  );
  await button("Start preparing");
  await until(
    'Boolean(Array.from(document.querySelectorAll(".shop-workspace button")).find(b=>b.textContent==="Dispatch order"))',
  );
  await fill("Shipment or collection reference", "QA-OUT-001");
  await button("Dispatch order");
  await until(
    'Boolean(Array.from(document.querySelectorAll(".shop-workspace button")).find(b=>b.textContent==="Confirm delivery"))',
  );
  await button("Confirm delivery");
  await until(
    'document.querySelector(".shop-orders").textContent.includes("delivered")',
  );
  const final = (await req(`/workspace/shops/${company.id}`)).data;
  assert.equal(final.products.find((p) => p.id === tea.id).onHand, 8);
  assert.equal(final.orders[0].settlement.paid, "0.00");
  await button("Shop connections");
  await fill("Connection name", "Future storefront");
  await button("Create connection key");
  await until('Boolean(document.querySelector(".shop-key code"))');
  const key = await evaluate(
    'document.querySelector(".shop-key code").textContent',
  );
  assert.match(key, /^stocrant_shop_/);
  await button("Hide key");
  assert.equal(await evaluate('document.querySelector(".shop-key")'), null);
  const directory = resolve(".local-preview/qa/commerce");
  mkdirSync(directory, { recursive: true });
  for (const [language, theme, width] of [
    ["en", "light", 1440],
    ["ar", "dark", 1440],
    ["ar", "light", 768],
    ["ar", "dark", 390],
    ["en", "light", 320],
  ]) {
    await evaluate(
      `localStorage.setItem("stocrant.language",${JSON.stringify(language)});localStorage.setItem("stocrant-theme",${JSON.stringify(theme)})`,
    );
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
    // Use full navigation to exercise persistence and the app lock. Arabic label handled directly.
    await send("Page.navigate", { url: base + "/shops" });
    await until(
      'Boolean(document.querySelector(".app-lock-screen input[type=password]"))',
    );
    await evaluate(
      `(()=>{const input=document.querySelector('.app-lock-screen input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(password)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await evaluate(
      'document.querySelector(".app-lock-screen form").requestSubmit()',
    );
    await until('Boolean(document.querySelector(".shop-tabs"))');
    await evaluate(
      `(()=>{const input=document.querySelector('.shop-workspace .page-header select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,${JSON.stringify(company.id)});input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await until('document.querySelectorAll(".shop-product").length===2');
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),
      `No page overflow ${language}/${width}`,
    );
    assert.equal(
      await evaluate("document.documentElement.dir"),
      language === "ar" ? "rtl" : "ltr",
    );
    writeFileSync(
      join(directory, `shops-${language}-${theme}-${width}.png`),
      Buffer.from(
        (await send("Page.captureScreenshot", { format: "png" })).data,
        "base64",
      ),
    );
    await evaluate('document.querySelectorAll(".shop-tabs button")[2].click()');
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),
      `Order form fits ${width}`,
    );
  }
  await send("Page.navigate", { url: base + "/services/shop-websites" });
  await until('Boolean(document.querySelector(".connected-shops"))');
  assert.ok(
    await evaluate(
      'document.querySelector(".connected-shops").textContent.includes("Product records, Excel product imports")',
    ),
  );
  assert.ok(
    await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),
  );
  writeFileSync(
    join(directory, "public-shop-services-mobile.png"),
    Buffer.from(
      (await send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  console.log(
    "Commerce browser checks passed: create product, actual XLSX preview/import, shipment receipt, order reservation/preparation/dispatch/delivery, unpaid linked sale, one-time key display, persisted company data and responsive EN/AR light/dark layouts.",
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  assert.ok(
    resolve(root).startsWith(resolve(tmpdir()) + sep) &&
      root.includes("stocrant-test-data-commerce-browser-"),
  );
  rmSync(root, {
    recursive: true,
    force: true,
    maxRetries: 4,
    retryDelay: 250,
  });
}
