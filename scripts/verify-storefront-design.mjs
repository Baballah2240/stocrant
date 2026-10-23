import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

export async function verifyStorefrontDesign(browser, base) {
  const { send, evaluate, until } = browser;
  const directory = resolve(".local-preview/qa/amal");
  mkdirSync(directory, { recursive: true });
  const veilVisible =
    'Number(getComputedStyle(document.querySelector(".product-focus-veil")).opacity)>.98';
  const veilHidden =
    'Number(getComputedStyle(document.querySelector(".product-focus-veil")).opacity)<.01';
  async function point(selector) {
    return evaluate(
      `(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.scrollIntoView({block:'center',behavior:'instant'});const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
    );
  }
  const move = async (selector) =>
    send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...(await point(selector)),
    });
  const screenshot = async (name) =>
    writeFileSync(
      join(directory, name),
      Buffer.from(
        (await send("Page.captureScreenshot", { format: "png" })).data,
        "base64",
      ),
    );
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  assert.ok(
    await evaluate('matchMedia("(hover:hover) and (pointer:fine)").matches'),
    "Desktop pointer supports hover",
  );
  for (const theme of ["light", "dark"]) {
    if ((await evaluate("document.documentElement.dataset.theme")) !== theme)
      await evaluate(
        `document.querySelector('button[aria-label="Switch theme"]').click()`,
      );
    await move(".product-card:first-child .product-image");
    await until(veilVisible);
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector(".product-card:first-child")).zIndex',
      ),
      "41",
    );
    assert.ok(
      await evaluate(
        '(()=>{const r=document.querySelector(".product-card:first-child .product-image").getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest(".product-card")===document.querySelector(".product-card:first-child");})()',
      ),
      "Focused product remains clickable above the veil",
    );
    assert.ok(
      await evaluate(
        'Array.from(document.querySelectorAll(".product-card")).slice(1).every(card=>getComputedStyle(card).zIndex!=="41")',
      ),
      "Only the active product is lifted above the blur",
    );
    await screenshot(`product-focus-${theme}.png`);
    await move(".product-card:nth-child(2) .product-image");
    await until(
      'document.querySelector(".product-card:nth-child(2)").matches(":hover")',
    );
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector(".product-card:first-child")).zIndex',
      ),
      "auto",
    );
    await move(".catalog-tools");
    await until(veilHidden);
  }
  // Keyboard navigation has the same emphasis, without blocking Tab or navigation.
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await evaluate('document.querySelector(".product-image").focus()');
  await until(veilVisible);
  assert.ok(
    await evaluate(
      'document.querySelector(".product-image").matches(":focus-visible")',
    ),
  );
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  assert.ok(
    await evaluate('Boolean(document.activeElement.closest(".product-card"))'),
    "Keyboard focus can move inside the card",
  );
  await evaluate("document.activeElement.blur()");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
  await until(veilHidden);
  // Reduced-motion browsing keeps the focus treatment and stops decoration/lift.
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await move(".product-card:first-child .product-image");
  await until(veilVisible);
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector(".hero-art>svg")).animationName',
    ),
    "none",
  );
  assert.equal(
    await evaluate(
      'getComputedStyle(document.querySelector(".product-card:first-child")).transform',
    ),
    "none",
  );
  await move(".catalog-tools");
  await until(veilHidden);
  await send("Emulation.setEmulatedMedia", { features: [] });
  // Touch users see the full collection clearly and can open a product with one tap.
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  await send("Page.navigate", { url: base + "/shop/amal" });
  await until('document.querySelectorAll(".product-card").length===4');
  assert.ok(await evaluate('matchMedia("(pointer:coarse)").matches'));
  const touchPoint = await point(".product-card:first-child .product-image");
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint],
  });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await until('Boolean(document.querySelector(".product-detail"))');
  await until(veilHidden);
  assert.ok(
    await evaluate("document.documentElement.scrollWidth<=innerWidth+2"),
  );
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1050,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate('localStorage.setItem("amal.theme",JSON.stringify("light"))');
  await send("Page.navigate", { url: base + "/shop/amal" });
  await until('document.querySelectorAll(".product-card").length===4');
  console.log(
    "Amal design checks passed: light/dark hover focus, one clear product, clickable cards, automatic blur dismissal, keyboard navigation, reduced motion and direct touch navigation.",
  );
}
