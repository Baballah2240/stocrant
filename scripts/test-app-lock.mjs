import assert from "node:assert/strict";
import { test } from "node:test";
import { inactivityExpired } from "../src/app-lock-timer.ts";
test("idle lock triggers at the selected deadline, including suspended tabs", () => {
  const start = 1000000;
  for (const minutes of [1, 2, 5, 10, 15, 30, 60]) {
    assert.equal(inactivityExpired(start, start + minutes * 60000 - 1, minutes), false);
    assert.equal(inactivityExpired(start, start + minutes * 60000, minutes), true);
    assert.equal(inactivityExpired(start, start + minutes * 60000 + 900000, minutes), true);
  }
});
test("clock rollback or invalid timing cannot extend an unlocked workspace", () => {
  assert.equal(inactivityExpired(100, 99, 5), true);
  assert.equal(inactivityExpired(NaN, 100, 5), true);
  assert.equal(inactivityExpired(100, 100, 0), true);
});
