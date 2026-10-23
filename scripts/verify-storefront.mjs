import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { browserQa } from "./browser-qa.mjs";
import { seedAmal } from "./storefront-fixture.mjs";
import { verifyStorefrontDesign } from "./verify-storefront-design.mjs";
const root = mkdtempSync(join(tmpdir(), "stocrant-test-data-amal-browser-"));
process.env.STOCRANT_DATA_DIR = root;
process.env.NODE_ENV = "development";
const { createApp } = await import("../dist/app.js");
const server = createApp().listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const fixture = await seedAmal(base);
  browser = await browserQa(root);
  const { send, evaluate, until } = browser;
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1050,
    deviceScaleFactor: 1,
    mobile: false,
  });
  async function fill(selector, value) {
    await evaluate(
      `(()=>{const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw Error('Missing input '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
    );
  }
  async function click(text, selector = "button,a") {
    await evaluate(
      `(()=>{const button=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Missing button '+${JSON.stringify(text)});button.click();})()`,
    );
  }
  // Exercise the manager's real settings form before the anonymous shopper flow.
  await send("Network.setCookie", {
    name: "stocrant_session",
    value: fixture.cookie.split("=").slice(1).join("="),
    url: base,
    path: "/",
  });
  await send("Page.navigate", { url: base + "/shops" });
  await until(
    'Boolean(document.querySelector(".app-lock-screen input[type=password]"))',
  );
  await fill(".app-lock-screen input", fixture.password);
  await evaluate(
    'document.querySelector(".app-lock-screen form").requestSubmit()',
  );
  await until('Boolean(document.querySelector(".shop-tabs"))');
  await fill(".shop-workspace .page-header select", fixture.company.id);
  await until('document.querySelectorAll(".shop-product").length===4');
  await click("Customer storefront", ".shop-tabs button");
  await until(
    'Boolean(document.querySelector(".storefront-settings input[type=tel]"))',
  );
  await fill(".storefront-settings input[type=tel]", "+249 900000001");
  await click("Save shop settings");
  await until(
    'document.querySelector(".storefront-settings [role=status]")?.textContent.includes("Shop published")',
  );
  await send("Network.deleteCookies", { name: "stocrant_session", url: base });
  await send("Page.navigate", { url: base + "/shop/amal" });
  await until('document.querySelectorAll(".product-card").length===4');
  // Personal likes stay separate from product navigation and the shopping bag.
  const likedId = await evaluate('document.querySelector(".product-card").dataset.productId');
  await evaluate('document.querySelector(".product-like").click()');
  await until('document.querySelectorAll(".product-like[aria-pressed=true]").length===1');
  assert.equal(await evaluate('document.querySelector(".bag-count").textContent'), "0");
  assert.equal(await evaluate('document.querySelector(".liked-products-link span").textContent'), "1");
  assert.equal(await evaluate('window.location.pathname'), "/shop/amal");
  await send("Page.reload");
  await until('document.querySelectorAll(".product-card").length===4 && document.querySelectorAll(".product-like[aria-pressed=true]").length===1');
  assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("amal.likes.amal"))'), [likedId]);
  await evaluate('document.querySelector(".liked-products-link").click()');
  await until('document.querySelectorAll(".product-card").length===1');
  assert.equal(await evaluate('document.querySelector(".product-card").dataset.productId'), likedId);
  const likesDirectory = resolve(".local-preview/qa/amal"); mkdirSync(likesDirectory, {recursive:true});
  await evaluate('document.querySelector(".product-card").scrollIntoView({block:"center",behavior:"instant"})');
  writeFileSync(join(likesDirectory,"liked-product-desktop.png"), Buffer.from((await send("Page.captureScreenshot",{format:"png"})).data,"base64"));
  await evaluate('document.querySelector(".product-like").click()');
  await until('document.querySelectorAll(".product-card").length===0');
  await click("Clear filters", ".store-results-line button");
  await until('document.querySelectorAll(".product-card").length===4');
  await evaluate('document.querySelector(".product-image").click()');
  await until('Boolean(document.querySelector(".product-like-detail"))');
  const openedProductPath = await evaluate('location.pathname');
  const relatedIds = await evaluate('[...document.querySelectorAll(".related-products .product-card")].map(card => card.dataset.productId)');
  assert.equal(relatedIds.length, 3);
  assert.equal(new Set(relatedIds).size, relatedIds.length);
  assert.ok(!relatedIds.includes(openedProductPath.split("/").pop()));
  const relatedName = await evaluate('document.querySelector(".related-products .product-card h3").textContent');
  await evaluate('document.querySelector(".related-products .product-image").click()');
  await until('document.querySelector(".detail-copy h1")?.textContent === ' + JSON.stringify(relatedName));
  assert.equal(await evaluate('location.pathname.split("/").pop()'), relatedIds[0]);
  await evaluate('history.back()');
  await until('location.pathname === ' + JSON.stringify(openedProductPath));
  await evaluate('document.querySelector(".product-like-detail").click()');
  await until('document.querySelector(".product-like-detail").getAttribute("aria-pressed")==="true"');
  await evaluate('document.querySelector(".wordmark").click()');
  await until('document.querySelectorAll(".product-card").length===4 && document.querySelectorAll(".product-like[aria-pressed=true]").length===1');
  await evaluate('document.querySelector(".product-like[aria-pressed=true]").click()');
  await until('document.querySelectorAll(".product-like[aria-pressed=true]").length===0');
  await verifyStorefrontDesign(browser, base);
  assert.ok(await evaluate('!document.querySelector(".topbar")'));
  assert.equal(
    await evaluate('document.querySelector(".wordmark").textContent.trim()'),
    "Amal•",
  );
  await fill("input[type=search]", "notebook");
  await until('document.querySelectorAll(".product-card").length===1');
  assert.ok(
    await evaluate(
      'document.querySelector(".product-card").textContent.includes("notebook")',
    ),
  );
  await fill("input[type=search]", "");
  await until('document.querySelectorAll(".product-card").length===4');
  await click("Tea & pantry", ".categories button");
  await until('document.querySelectorAll(".product-card").length===2');
  await click("All", ".categories button");
  await fill(".sort select", "low");
  assert.ok(
    await evaluate(
      'document.querySelector(".product-card").textContent.includes("Everyday tea")',
    ),
  );
  await evaluate('document.querySelector(".product-image").click()');
  await until('Boolean(document.querySelector(".product-detail"))');
  await fill(".detail-copy input[type=number]", "2");
  await click("Add to bag +", ".detail-copy button");
  await until('document.querySelector(".bag-count").textContent==="2"');
  await evaluate('document.querySelector(".bag-link").click()');
  await until('Boolean(document.querySelector(".bag-lines"))');
  assert.ok(
    await evaluate(
      'document.querySelector(".order-summary").textContent.includes("37.00")',
    ),
  );
  await click("Checkout ↗", ".order-summary a");
  await until('Boolean(document.querySelector(".checkout-fields"))');
  await evaluate('document.querySelectorAll("input[name=method]")[1].click()');
  await fill("input[name=customer]", "Amal Guest");
  await fill("input[name=email]", "guest@amal-browser.test");
  await fill("input[name=phone]", "+249 912345678");
  await fill("input[name=address]", "12 Example Road, Example City");
  await fill(".checkout-fields select", "Example City");
  await fill("input[name=notes]", "Browser test only");
  await evaluate('document.querySelector(".consent input").click()');
  await until(
    'document.querySelector(".summary-total").textContent.includes("42.00")',
  );
  // Lose the first successful response; the customer retry must return one existing order.
  await evaluate(
    `(()=>{const original=window.fetch;let lost=false;window.fetch=(url,options)=>{if(String(url).endsWith('/checkout')&&!lost){lost=true;return original(url,options).then(()=>{throw new TypeError('Simulated lost checkout response')});}return original(url,options);};})()`,
  );
  await click("Place order ↗", "button[type=submit]");
  await until(
    'document.querySelector(".error-banner")?.textContent.includes("could not confirm")',
  );
  let orders = (await fixture.req(`/workspace/shops/${fixture.company.id}`))
    .data.orders;
  assert.equal(orders.length, 1);
  assert.equal(orders[0].customer, "Amal Guest");
  assert.equal(orders[0].total, "42.00");
  await click("Place order ↗", "button[type=submit]");
  await until('Boolean(document.querySelector(".order-journey"))');
  const tracking = await evaluate(
    "window.location.pathname+window.location.hash",
  );
  assert.match(tracking, /\/order\/.+#[a-f0-9]{64}$/);
  assert.equal(
    (await fixture.req(`/workspace/shops/${fixture.company.id}`)).data.orders
      .length,
    1,
  );
  assert.ok(
    await evaluate(
      '!document.querySelector(".receipt-page").textContent.includes("guest@amal-browser.test")',
    ),
  );
  assert.equal(
    await evaluate('document.querySelector(".bag-count").textContent'),
    "0",
  );
  const statusPath = `/workspace/shops/${fixture.company.id}/orders/${orders[0].id}/status`;
  let current = (
    await fixture.req(statusPath, "POST", {
      version: orders[0].version,
      status: "preparing",
    })
  ).data;
  current = (
    await fixture.req(statusPath, "POST", {
      version: current.version,
      status: "dispatched",
      tracking: "AMAL-BROWSER-001",
    })
  ).data;
  await fixture.req(statusPath, "POST", {
    version: current.version,
    status: "delivered",
  });
  await click("Refresh status");
  await until(
    'document.querySelector(".status-badge")?.textContent==="delivered"',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".receipt-page").textContent.includes("AMAL-BROWSER-001")',
    ),
  );
  await send("Page.navigate", { url: base + tracking });
  await until(
    'document.querySelector(".status-badge")?.textContent==="delivered"',
  );
  const directory = resolve(".local-preview/qa/amal");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "order-delivered.png"),
    Buffer.from(
      (await send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  for (const [language, theme, width] of [
    ["en", "light", 1440],
    ["en", "dark", 1440],
    ["ar", "light", 768],
    ["ar", "dark", 390],
    ["en", "light", 320],
  ]) {
    await evaluate(
      `localStorage.setItem('amal.language',JSON.stringify(${JSON.stringify(language)}));localStorage.setItem('amal.theme',JSON.stringify(${JSON.stringify(theme)}));`,
    );
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1050,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
    await send("Page.navigate", { url: base + "/shop/amal" });
    await until('document.querySelectorAll(".product-card").length===4');
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),
      `Catalog fits ${language}/${width}`,
    );
    assert.equal(
      await evaluate("document.documentElement.dir"),
      language === "ar" ? "rtl" : "ltr",
    );
    writeFileSync(
      join(directory, `amal-${language}-${theme}-${width}.png`),
      Buffer.from(
        (await send("Page.captureScreenshot", { format: "png" })).data,
        "base64",
      ),
    );
    await evaluate('document.querySelector(".product-image").click()');
    await until('Boolean(document.querySelector(".product-detail"))');
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),
      `Product fits ${width}`,
    );
    await evaluate(
      'document.querySelector(".detail-copy .primary").click();document.querySelector(".bag-link").click()',
    );
    await until('Boolean(document.querySelector(".bag-lines"))');
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),
      `Bag fits ${width}`,
    );
    await evaluate('document.querySelector(".order-summary .primary").click()');
    await until('Boolean(document.querySelector(".checkout-fields"))');
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),
      `Checkout fits ${width}`,
    );
    await send("Page.navigate", { url: base + "/shop/amal/policies/privacy" });
    await until('Boolean(document.querySelector(".policy-page"))');
    assert.ok(
      await evaluate(
        'document.querySelector(".policy-page").textContent.includes("Preview policy only")',
      ),
    );
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),
      `Policies fit ${width}`,
    );
  }
  const result = (await fixture.req(`/workspace/shops/${fixture.company.id}`))
    .data;
  assert.equal(
    result.products.find((p) => p.id === fixture.products[0].id).onHand,
    10,
  );
  assert.equal(result.orders[0].settlement.paid, "0.00");
  const alerts = (await fixture.req("/notifications")).data.items.filter(n => n.target === `shop-order:${result.orders[0].id}`);
  assert.equal(alerts.length, 1, "A retried checkout creates one administrator alert");
  const alert = (await fixture.req(`/notifications/${alerts[0].id}`)).data;
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  await send("Network.setCookie", { name: "stocrant_session", value: fixture.cookie.split("=").slice(1).join("="), url: base, path: "/" });
  await send("Page.navigate", { url: base + alert.link.to });
  await until('Boolean(document.querySelector(".app-lock-screen input[type=password]"))');
  await fill('.app-lock-screen input', fixture.password); await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');
  await until('document.querySelector(".shop-orders .selected")?.textContent.includes("Amal Guest")');
  assert.equal(await evaluate('document.querySelector(".shop-tabs button[aria-current=page]").textContent'), "Orders");
  assert.ok(await evaluate('document.querySelector(".shop-workspace").textContent.includes("AMAL-BROWSER-001")'));
  console.log(
    "Amal browser checks passed: manager shop settings, anonymous catalog/search/categories/sort, product quantities, bag, delivery quote, lost-response retry without duplicates, private receipt reload, workspace fulfilment, unpaid sale, and responsive EN/AR light/dark catalog/product/bag/checkout/policy pages.",
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  assert.ok(
    resolve(root).startsWith(resolve(tmpdir()) + sep) &&
      root.includes("stocrant-test-data-amal-browser-"),
  );
  rmSync(root, {
    recursive: true,
    force: true,
    maxRetries: 4,
    retryDelay: 250,
  });
}
