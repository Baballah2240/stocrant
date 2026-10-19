import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { browserQa } from "./browser-qa.mjs";

const root = mkdtempSync(join(tmpdir(), "stocrant-test-public-website-"));
const app = express(); app.use(express.static(resolve("public-website/dist")));
const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await browserQa(root);
  const { send, evaluate, until } = browser;
  for (const [width, height] of [[1440, 1000], [1024, 900], [390, 844]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    await send("Page.navigate", { url: base }); await until('Boolean(document.querySelector(".public-theme-toggle"))');
    for (const theme of ["light", "dark"]) {
      if (await evaluate('document.documentElement.dataset.theme') !== theme) await evaluate('document.querySelector(".public-theme-toggle").click()');
      await until(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'), `${theme}/${width}: overflow`);
      for (let index = 0; index < 4; index++) {
        await evaluate(`document.getElementById('tour-tab-${index}').click()`);
        assert.equal(await evaluate(`document.getElementById('tour-tab-${index}').getAttribute('aria-selected')`), "true");
        assert.ok(await evaluate('document.querySelector("#tour-panel h3").textContent.length>10'));
      }
      const contact = await evaluate('({label:document.querySelector(".public-contact form button").textContent,email:document.querySelector(".public-contact a[href^=mailto]")?.getAttribute("href"),disabled:document.querySelector(".public-contact form button").disabled,body:document.querySelector(".public-contact").textContent})');
      assert.equal(contact.label, "Open email draft");
      if (!contact.email) { assert.equal(contact.disabled, true); assert.ok(contact.body.includes("Contact is currently unavailable")); }
      assert.ok(await evaluate('document.querySelector(".public-faq").textContent.includes("three attendance sessions")'));
      if (process.env.STOCRANT_QA_SCREENSHOTS === "1") {
        const directory = resolve(".local-preview/qa/audit"); mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, `public-${theme}-${width}.png`), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
      }
    }
    if (width < 700) {
      await evaluate('document.querySelector(".public-menu-toggle").click()');
      assert.equal(await evaluate('document.querySelector(".public-menu-toggle").getAttribute("aria-expanded")'), "true");
      await evaluate('document.querySelector("#website-navigation a").click()');
      assert.equal(await evaluate('document.querySelector(".public-menu-toggle").getAttribute("aria-expanded")'), "false");
    }
  }
  console.log("Public website browser checks passed: light/dark desktop/tablet/mobile fit, product-tour tabs, honest contact availability/action labels, updated attendance copy and mobile menu. No inquiry or external email was sent.");
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep) && root.includes("stocrant-test-public-website-"));
  rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
