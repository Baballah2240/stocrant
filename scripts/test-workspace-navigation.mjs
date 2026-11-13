import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceNavigationFor, workspaceEntryActive, workspaceNavGroups } from "../src/workspace-navigation.ts";
import { translate } from "../src/translations.ts";
const main = { roleId: "role-main-manager", permissions: [] };
const staff = permissions => ({ roleId: "role-company-manager", permissions });
test("sidebar hides unauthorized tools and requires both shop permissions", () => {
  const inventory = workspaceNavigationFor(staff(["inventory.view"])).map(item => item.to);
  assert.ok(inventory.includes("/warehouse") && inventory.includes("/me/attendance"));
  for (const path of ["/shops", "/admin", "/finance", "/hr/payroll", "/hr", "/customer-service"]) assert.ok(!inventory.includes(path), path);
  assert.ok(workspaceNavigationFor(staff(["inventory.view", "operations.view"])).some(item => item.to === "/shops"));
  assert.ok(workspaceNavigationFor(main).some(item => item.to === "/admin"));
  assert.ok(!workspaceNavigationFor(main).some(item => item.personalOnly));
});
test("aliases and nested routes select exactly the right workspace page", () => {
  const items = workspaceNavigationFor(main);
  for (const [route, expected] of [["/workspace", "/"], ["/", "/"], ["/inventory", "/warehouse"], ["/warehouse/items/new", "/warehouse"], ["/hr/payroll", "/hr/payroll"], ["/hr/employees/new", "/hr"], ["/organization/companies/example", "/organizations"], ["/stores", "/locations"], ["/stores/products", "/operations"], ["/access", "/admin"]]) assert.deepEqual(items.filter(item => workspaceEntryActive(item, route)).map(item => item.to), [expected], route);
});
test("navigation has unique routes, translated sections and distinct tool icons", () => {
  const items = workspaceNavigationFor(main); assert.equal(new Set(items.map(item => item.to)).size, items.length);
  for (const item of items) { assert.ok(workspaceNavGroups.some(group => group.id === item.group)); assert.notEqual(translate(item.label, "ar"), item.label); }
  for (const group of workspaceNavGroups) assert.notEqual(translate(group.label, "ar"), group.label);
  const icon = path => items.find(item => item.to === path).icon;
  assert.notEqual(icon("/shops"), icon("/warehouse")); assert.notEqual(icon("/customer-service"), icon("/operations")); assert.notEqual(icon("/hr/payroll"), icon("/me/payroll")); assert.notEqual(icon("/security"), icon("/admin"));
});
