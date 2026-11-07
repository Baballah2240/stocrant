import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../shared/calculator.js";
import { advanceTimer, defaults, insideRoundedRect, timerAction, validateStore } from "../shared/model.js";
test("calculator precedence, parentheses, percent, power", () => {
  assert.equal(calculate("2+3*4"), "14"); assert.equal(calculate("(2+3)*4"), "20");
  assert.equal(calculate("50%*200"), "100"); assert.equal(calculate("2^3^2"), "512"); assert.equal(calculate("-3+1"), "-2"); assert.equal(calculate("0.1+0.2"), "0.3");
  assert.throws(() => calculate("1/0")); assert.throws(() => calculate("(1+2")); assert.throws(() => calculate("alert(1)"));
});
test("timer runs, completes, and moves to break", () => {
  const s = defaults(); timerAction(s, "toggle", 0); assert.equal(s.timer.running, true);
  assert.equal(advanceTimer(s, 25 * 60000 - 1), false); assert.equal(advanceTimer(s, 25 * 60000), true);
  assert.equal(s.timer.phase, "break"); assert.equal(s.timer.completed, 1);
});
test("backup validation round-trips and rejects junk", () => {
  const s = defaults(); s.notes.push({ id: "a", title: "t", body: "b", pinned: true, checklist: false, updatedAt: 1 });
  assert.deepEqual(validateStore(JSON.parse(JSON.stringify(s))), s);
  assert.throws(() => validateStore({ version: 2 })); assert.throws(() => validateStore({ ...s, notes: [{ id: 1 }] }));
});
test("rounded-rect hit test excludes transparent corners", () => {
  const r = { x: 0, y: 0, width: 200, height: 40, radius: 20 };
  assert.equal(insideRoundedRect(100, 20, r), true); assert.equal(insideRoundedRect(1, 1, r), false); assert.equal(insideRoundedRect(300, 20, r), false);
});
