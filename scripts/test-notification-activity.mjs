import assert from "node:assert/strict";
import { test } from "node:test";
import { isImportantActivity, notifyAction } from "../src/action-feedback.ts";

test("minor preferences and notification housekeeping stay out of history", () => {
  for (const message of ["Dark mode enabled.", "Light mode enabled.", "Print dialog closed.", "Signed in successfully.", "Notification deleted.", "All notifications marked as read.", "Language changed."]) {
    assert.equal(isImportantActivity(message), false, message);
  }
  for (const message of ["Request approved.", "Stock movement saved.", "Employee updated.", "Submitted for approval."]) assert.equal(isImportantActivity(message), true, message);
});

test("feedback must explicitly opt in to notification history", () => {
  const events = [];
  globalThis.window = { dispatchEvent: event => events.push(event.detail) };
  notifyAction("Small preference saved.");
  notifyAction("Employee updated.", "success", true);
  assert.equal(events[0].recordActivity, false);
  assert.equal(events[1].recordActivity, true);
  delete globalThis.window;
});
