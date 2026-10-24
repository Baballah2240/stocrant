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
  const purchase=(await req("/collections/purchases","POST",{organizationId:company.id,poNumber:"QA-PO-001",date:"2026-01-01",supplier:"QA supplier",items:10,subtotal:50,total:50,status:"ordered"})).data.item;
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
  await evaluate('document.querySelector(".shop-add-product .shop-warranty-fields input[type=checkbox]").click()');
  await until('Boolean(document.querySelector(".shop-add-product .shop-warranty-fields input[type=text]"))');
  await fill("Warranty details (optional)", "12 months", "Add product");
  const photoPaths = [];
  for (const [index, color] of ["#d3e8dd", "#e9d6c8"].entries()) {
    const bytes = await evaluate(`(()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const context=canvas.getContext('2d');context.fillStyle=${JSON.stringify(color)};context.fillRect(0,0,320,240);context.fillStyle='#243c36';context.font='24px sans-serif';context.fillText('Tea photo ${index + 1}',35,125);return canvas.toDataURL('image/png').split(',')[1];})()`);
    const path = join(root, `product-${index}.png`); writeFileSync(path, Buffer.from(bytes, "base64")); photoPaths.push(path);
  }
  const uploadDocument = await send("DOM.getDocument");
  const uploadInput = await send("DOM.querySelector", { nodeId: uploadDocument.root.nodeId, selector: '.shop-add-product input[type="file"]' });
  await send("DOM.setFileInputFiles", { nodeId: uploadInput.nodeId, files: photoPaths });
  await until('document.querySelectorAll(".shop-add-product .product-photo-grid img").length===2 && !document.querySelector(".shop-controls").disabled');
  const firstPhoto = await evaluate('document.querySelector(".product-photo-grid img").getAttribute("src")');
  await button("Make cover");
  await until(`document.querySelector(".product-photo-grid img").getAttribute("src")!==${JSON.stringify(firstPhoto)}`);
  await button("Add product");
  await until('document.querySelectorAll(".shop-product").length===1');
  const initialTea = (await req(`/workspace/shops/${company.id}`)).data.products[0];
  assert.equal(initialTea.images.length, 2); assert.notEqual(initialTea.image, firstPhoto);
  assert.equal(initialTea.warranty,true);assert.equal(initialTea.warrantyDetails,"12 months");
  await button("Edit product");
  await until('Boolean(document.querySelector(".shop-edit-product"))');
  await until('Array.from(document.querySelectorAll(".shop-edit-product .product-photo-grid img")).every(img=>img.complete && img.naturalWidth>0)');
  await button("Make cover");
  await until(`document.querySelector(".shop-edit-product .product-photo-grid img").getAttribute("src")===${JSON.stringify(firstPhoto)}`);
  await button("Save product");
  await until('!document.querySelector(".shop-edit-product")');
  await fill("Search products", "no-such-product");
  await until('document.querySelectorAll(".shop-product").length===0');
  await fill("Search products", "");
  await until('document.querySelectorAll(".shop-product").length===1');
  // Exercise Excel's worker under the same script/worker restrictions as hosting.
  await evaluate(`(()=>{const meta=document.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content="default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:";document.head.append(meta);})()`);
  const fixture = join(root, "products.xlsx");
  xlsxFixture(fixture);
  const document = await send("DOM.getDocument");
  const fileInput = await send("DOM.querySelector", {
    nodeId: document.root.nodeId,
    selector: '.shop-excel-panel input[type="file"]',
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
  await fill("Linked purchase (optional)",purchase.id,"Receive a shipment");
  await fill("Supplier", "QA supplier", "Receive a shipment");
  await fill("Shipment reference", "QA-IN-001", "Receive a shipment");
  await button("Confirm receipt");
  await until('document.querySelectorAll(".shop-history").length===1');
  assert.equal((await req(`/workspace/shops/${company.id}`)).data.receipts[0].purchaseId,purchase.id);
  assert.equal((await req("/workspace/finance")).data.sources.find(source=>source.id===purchase.id).receiptCount,1);
  assert.equal((await req("/workspace/finance")).data.transactions.length,0,"Stock receipt does not invent supplier payment");
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
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('.shop-workspace a')).some(a=>a.pathname==='/finance'&&new URLSearchParams(a.search).get('source')===${JSON.stringify(final.orders[0].saleId)})`),"Shop order opens its exact Finance sale");
  await fill("Search orders", "no-such-customer");
  await until('document.querySelectorAll(".shop-orders>button").length===0');
  await fill("Search orders", "QA customer");
  await until('document.querySelectorAll(".shop-orders>button").length===1');
  await fill("Order status", "reserved");
  await until('document.querySelectorAll(".shop-orders>button").length===0');
  await fill("Order status", "all");
  await until('document.querySelectorAll(".shop-orders>button").length===1');
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
    await until('Boolean(document.querySelector(".shop-order-layout"))');
    await evaluate('document.querySelector(".shop-orders>button").click()');
    await until('Boolean(document.querySelector(".shop-order-detail .shop-line-items"))');
    if (width < 700) await evaluate('document.querySelector(".shop-order-detail").scrollIntoView({block:"start"})');
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),
      `Order form fits ${width}`,
    );
    writeFileSync(join(directory, `orders-${language}-${theme}-${width}.png`), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  }
  const defaults = (await req(`/workspace/storefronts/${company.id}`)).data.settings;
  await req(`/workspace/storefronts/${company.id}`, "PUT", { ...defaults, slug: "photo-shop", name: "Amal photos", address: "QA collection point", contactEmail: "photos@qa.test", shippingPolicy: "QA collection", returnsPolicy: "QA returns", privacyPolicy: "QA privacy", terms: "QA terms", manualPaymentsAccepted: true, published: true });
  await send("Page.navigate", { url: base + `/shop/photo-shop/product/${tea.id}` });
  await until('document.querySelectorAll(".product-thumbnails button").length===2 && document.querySelector(".detail-image img")?.naturalWidth>0');
  assert.ok(await evaluate('Boolean(document.querySelector(".detail-copy .product-warranty svg"))'));
  assert.equal(await evaluate('document.querySelector(".warranty-details").textContent'),"12 months");
  const cover = await evaluate('document.querySelector(".detail-image img").getAttribute("src")');
  await evaluate('document.querySelectorAll(".product-thumbnails button")[1].click()');
  await until(`document.querySelector(".detail-image img").getAttribute("src")!==${JSON.stringify(cover)}`);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'), "Customer gallery fits phone width");
  writeFileSync(join(directory, "product-gallery-mobile.png"), Buffer.from((await send("Page.captureScreenshot", {format:"png"})).data,"base64"));
  await evaluate('document.querySelector(".wordmark").click()');
  await until('document.querySelectorAll(".product-card").length===2');
  assert.equal(await evaluate('document.querySelectorAll(".product-card .product-warranty").length'),1,"Only covered products show a warranty badge");
  await evaluate('document.querySelector(".product-card .product-warranty").scrollIntoView({block:"center"})');
  writeFileSync(join(directory,"warranty-card-mobile.png"),Buffer.from((await send("Page.captureScreenshot",{format:"png"})).data,"base64"));
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
    "Commerce browser checks passed: photo upload/preview/cover/edit/customer gallery, product/order filters, actual XLSX preview/import, shipment receipt, order reservation/preparation/dispatch/delivery, unpaid linked sale, one-time key display, persisted company data and responsive EN/AR light/dark layouts.",
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
