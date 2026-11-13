import test from "node:test";
import assert from "node:assert/strict";
import { translateText, translationSegments, validTranslation } from "../shared/translation.js";

const controller = () => new AbortController();
test("translation validates languages, blank text and maximum length before any network request", async () => {
  assert.equal(validTranslation({ text: "مرحبا", from: "ar", to: "en" }), true);
  assert.equal(validTranslation({ text: "Hello", from: "en", to: "ar" }), true);
  assert.equal(validTranslation({ text: "Bonjour", from: "fr", to: "ar" }), false);
  for (const request of [null, {}, { text: " ", from: "en", to: "ar" }, { text: "Hi", from: "en", to: "en" }, { text: "Hi", from: "file:///", to: "ar" }, { text: "x".repeat(3001), from: "en", to: "ar" }]) {
    assert.equal(validTranslation(request), false);
    assert.deepEqual(await translateText(request, controller().signal, async () => { throw Error("Must not request"); }), { ok: false, error: "invalid" });
  }
});
test("UTF-8 segmentation preserves Arabic, emoji and paragraph boundaries within provider limits", () => {
  for (const text of ["A long sentence with words. ".repeat(120), "مرحبا بالعالم 🌍 ".repeat(100), "x".repeat(3000), "one\n\ntwo\n三".repeat(90)]) {
    const segments = translationSegments(text);
    assert.equal(segments.join(""), text);
    assert.ok(segments.every(s => Buffer.byteLength(s, "utf8") <= 500));
    assert.ok(segments.every(s => !/[\uD800-\uDBFF]$/.test(s)));
  }
});
test("translation uses only the fixed HTTPS provider and returns plain provider output", async () => {
  let calls = 0;
  const result = await translateText({ text: "Hello", from: "en", to: "ar" }, controller().signal, async (input, options) => {
    calls++; const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://api.mymemory.translated.net/get");
    assert.equal(url.searchParams.get("q"), "Hello");assert.equal(url.searchParams.get("langpair"), "en|ar");
    assert.equal(options?.redirect, "error");assert.ok(options?.signal);
    return Response.json({ responseStatus: 200, responseData: { translatedText: "مرحبا" } });
  });
  assert.equal(calls, 1);assert.deepEqual(result, { ok: true, text: "مرحبا" });
});
test("quota, malformed replies and offline requests produce recoverable errors", async () => {
  const input = { text: "Hello", from: "en", to: "ar" };
  for (const response of [new Response("", { status: 429 }), Response.json({ quotaFinished: true, responseStatus: 200 })]) {
    assert.deepEqual(await translateText(input, controller().signal, async () => response), { ok: false, error: "limit" });
  }
  for (const data of [{}, { responseStatus: 200, responseData: { translatedText: "" } }, { responseStatus: 500, responseData: { translatedText: "SERVICE ERROR" } }]) {
    assert.deepEqual(await translateText(input, controller().signal, async () => Response.json(data)), { ok: false, error: "unavailable" });
  }
  assert.deepEqual(await translateText(input, controller().signal, async () => { throw Error("network"); }), { ok: false, error: "offline" });
});
test("cancellation stops all remaining segments and never returns a partial translation", async () => {
  const control = controller();let calls = 0;
  const result = await translateText({ text: "word ".repeat(160), from: "en", to: "ar" }, control.signal, async () => {
    calls++;control.abort();return Response.json({ responseStatus: 200, responseData: { translatedText: "partial" } });
  });
  assert.equal(calls, 1);assert.deepEqual(result, { ok: false, error: "canceled" });
});
