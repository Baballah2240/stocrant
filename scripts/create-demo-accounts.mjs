import { randomBytes } from "node:crypto";

if (process.env.NODE_ENV === "production") {
  throw new Error("Demo accounts are disabled in production.");
}

const [{ hashPassword }, { getStore, saveStore }] = await Promise.all([
  import("../dist/auth.js"),
  import("../dist/storage.js"),
]);

const data = getStore();
const users = data.collections.accessUsers ?? [];
const companies = data.collections.companies ?? [];
const company = companies.find(item => item.status !== "inactive") ?? companies[0];
if (!company) throw new Error("Create a company before generating demonstration accounts.");

const definitions = [
  { key: "main-admin", name: "STOCRANT Demo Main Admin", email: "demo.mainadmin@stocrant.local", roleId: "role-main-manager", permissions: ["*"], ownRecordsOnly: false, organizationIds: [] },
  { key: "customer-service", name: "STOCRANT Demo Customer Service", email: "demo.customerservice@stocrant.local", roleId: "role-customer-service", permissions: ["organizations.view", "locations.view", "customerService.view", "customerService.create", "customerService.edit", "customerService.reply"], ownRecordsOnly: false, organizationIds: [company.id] },
  { key: "manager", name: "STOCRANT Demo Manager", email: "demo.manager@stocrant.local", roleId: "role-manager", permissions: null, ownRecordsOnly: false, organizationIds: [company.id] },
  { key: "employee", name: "STOCRANT Demo Employee", email: "demo.employee@stocrant.local", roleId: "role-employee", permissions: null, ownRecordsOnly: true, organizationIds: [company.id] },
];

const created = [];
const skipped = [];
for (const definition of definitions) {
  if (users.some(user => String(user.email).toLowerCase() === definition.email)) { skipped.push(definition.email); continue; }
  const password = `Lx!${randomBytes(15).toString("base64url")}`;
  const account = {
    id: `demo-${definition.key}-${randomBytes(6).toString("hex")}`,
    name: definition.name,
    email: definition.email,
    passwordHash: await hashPassword(password),
    roleId: definition.roleId,
    status: "active",
    ...(definition.permissions ? { permissions: definition.permissions } : {}),
    ownRecordsOnly: definition.ownRecordsOnly,
    organizationIds: definition.organizationIds,
    locationIds: [],
    mustChangePassword: true,
    dataClassification: "local-demo",
    createdAt: new Date().toISOString(),
  };
  users.push(account);
  created.push({ role: definition.roleId, username: definition.email, temporaryPassword: password });
}
data.collections.accessUsers = users;
data.collections.auditLog = [...(data.collections.auditLog ?? []), ...created.map(item => ({ id: `audit-demo-${randomBytes(6).toString("hex")}`, action: "access.local-demo-created", actorId: "local-demo-script", actorName: "Local development", targetName: item.username, occurredAt: new Date().toISOString() }))];
saveStore(data);
console.log(JSON.stringify({ created, skipped }, null, 2));
