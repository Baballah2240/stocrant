import test from "node:test";
import assert from "node:assert/strict";
import { pendingPatch } from "../shared/pending-patch.js";
import { applyPhoneTimer, drainQueue, RequestError, type QueuedAction } from "../shared/sync.js";
import { defaults, validateStore } from "../shared/model.js";
import { fitSticky } from "../shared/bounds.js";

test("pending note edits merge fields and flush exactly once", () => {
  const sent: object[] = [];
  const pending = pendingPatch<{ title: string; body: string }>(patch => sent.push(patch), 100);
  pending.push({ title: "New title" });
  pending.push({ body: "New body" });
  pending.flush();
  pending.flush();
  assert.deepEqual(sent, [{ title: "New title", body: "New body" }]);
});

test("deleting a note cancels autosave even after its deadline", async () => {
  const sent: object[] = [];
  const pending = pendingPatch<{ body: string }>(patch => sent.push(patch), 10);
  pending.push({ body: "Do not resurrect this note" });
  pending.cancel();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(sent, []);
});

test("timer retries remain deduplicated after saving and restarting", () => {
  const store = defaults();
  assert.equal(applyPhoneTimer(store, "toggle", "request-123", 1000), true);
  const restored = validateStore(JSON.parse(JSON.stringify(store)));
  assert.equal(applyPhoneTimer(restored, "toggle", "request-123", 2000), false);
  assert.deepEqual(restored.timer, store.timer);
  assert.equal(applyPhoneTimer(restored, "toggle", "request-456", 3000), true);
  assert.equal(restored.timer.running, false);
});

test("a rejected edit is preserved and later queued edits still sync", async () => {
  const queue: QueuedAction[] = [{ type: "note-delete", id: "invalid" }, { type: "note-delete", id: "valid" }];
  const sent: string[] = [], rejected: QueuedAction[] = [];
  let saves = 0;
  await drainQueue(queue, async action => {
    if (action.type !== "note-delete") throw Error("Unexpected action");
    if (action.id === "invalid") throw new RequestError("Invalid edit", 400);
    sent.push(action.id);
  }, () => saves++, action => rejected.push(action));
  assert.equal(rejected.length, 1);
  assert.deepEqual(sent, ["valid"]);
  assert.equal(saves, 2);
  assert.deepEqual(queue, []);
});

test("network and authentication failures keep actions queued for retry", async () => {
  for (const error of [Error("Connection lost"), new RequestError("Signed out", 401), new RequestError("Busy", 503)]) {
    const queue: QueuedAction[] = [{ type: "timer", action: "toggle", requestId: "request-123" }];
    await assert.rejects(drainQueue(queue, async () => { throw error; }, () => assert.fail("Must retain queue"), () => assert.fail("Must not reject edit")));
    assert.equal(queue.length, 1);
  }
});

test("failed recovery storage retains the rejected action", async () => {
  const queue: QueuedAction[] = [{ type: "note-delete", id: "invalid" }];
  await assert.rejects(drainQueue(queue, async () => { throw new RequestError("Invalid", 400); }, () => {}, () => { throw Error("Storage full"); }));
  assert.equal(queue.length, 1);
});

test("notes on a removed monitor move fully inside the remaining work area", () => {
  assert.deepEqual(fitSticky({ x: 2200, y: 900, width: 260, height: 240 }, { x: 0, y: 40, width: 1280, height: 680 }), { x: 1020, y: 480, width: 260, height: 240 });
  assert.deepEqual(fitSticky({ x: -3000, y: -100, width: 2000, height: 2000 }, { x: -1280, y: 0, width: 1280, height: 720 }), { x: -1280, y: 0, width: 1280, height: 720 });
});
