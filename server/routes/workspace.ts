import { Router } from "express";
import { z } from "zod";
import { hashPassword, publicUser } from "../auth.js";
import { can, isWithinScope, redactRecord, requirePermission, sectionForCollection } from "../permissions.js";
import { registry } from "../registry.js";
import { getCollection, getStore, nextCollectionId, saveStore } from "../storage.js";
import { approveRequest, audit, financeSummary, inventorySummary, mutateCollection, type Row } from "../workspace.js";

const router = Router();

function sendError(res: import("express").Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed.";
  const status = message.includes("permission") ? 403 : message.includes("not found") ? 404 : 400;
  return res.status(status).json({ error: message });
}

function rows(name: string) {
  return getCollection(name) as Row[];
}

function scoped(req: import("express").Request, list: Row[], collection: string) {
  return list.filter((row) => isWithinScope(req.auth!, row)).map((row) => redactRecord(collection, row, req.auth!));
}

function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.map(String).join("; ") : value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

router.get("/overview", (req, res) => {
  const data = getStore();
  const work = can(req.auth, "operations", "view") ? scoped(req, rows("workItems"), "workItems") : [];
  const inventory = can(req.auth, "inventory", "view") ? inventorySummary() : { items: [], lowStockCount: 0 };
  const finance = can(req.auth, "finance", "view") ? financeSummary() : { accounts: [], income: 0, expenses: 0, salaries: 0, net: 0 };
  const pendingApprovals = can(req.auth, "approvals", "view") ? rows("approvalRequests").filter((row) => row.status === "pending").length : 0;
  res.json({
    organizations: can(req.auth, "organizations", "view") ? scoped(req, rows("companies"), "companies").length : 0,
    locations: can(req.auth, "locations", "view") ? data.stores.filter((store) => isWithinScope(req.auth!, store as unknown as Row)).length : 0,
    activeEmployees: can(req.auth, "hr", "view") ? scoped(req, rows("employees"), "employees").filter((employee) => employee.status === "active").length : 0,
    work: { total: work.length, overdue: work.filter((item) => String(item.dueDate) < new Date().toISOString().slice(0, 10) && !["Completed", "Cancelled"].includes(String(item.status))).length },
    inventory: { lowStockCount: inventory.lowStockCount },
    finance: { net: finance.net },
    pendingApprovals,
  });
});

router.get("/export/:collection", (req, res) => {
  const collection = req.params.collection as string;
  const known = registry.some((spec) => spec.collection === collection) || ["workItems", "inventoryItems", "inventoryMovements", "financeAccounts", "financeTransactions", "locationUpdates"].includes(collection);
  if (!known) return res.status(404).json({ error: "Unknown export collection." });
  const section = sectionForCollection(collection);
  if (!can(req.auth, section, "export")) return res.status(403).json({ error: `You do not have permission to export ${section}.` });
  const items = scoped(req, rows(collection), collection).map((item) => {
    const safe = { ...item };
    delete safe.passwordHash;
    return safe;
  });
  const keys = [...new Set(items.flatMap((item) => Object.keys(item)))].filter((key) => !["id", "createdAt", "updatedAt"].includes(key));
  const csv = [keys.join(","), ...items.map((item) => keys.map((key) => csvCell(item[key])).join(","))].join("\n");
  audit(req.auth, "data.exported", { collection, section, count: items.length });
  res.json({ filename: `stocrant-${collection}.csv`, csv });
});

router.get("/locations", requirePermission("locations", "view"), (req, res) => {
  const data = getStore();
  const employees = rows("employees");
  const updates = rows("locationUpdates");
  const items = data.stores.filter((store) => isWithinScope(req.auth!, store as unknown as Row)).map((store) => ({
    ...store,
    linkedEmployees: employees.filter((employee) => employee.locationId === store.id || employee.storeId === store.id).length,
    updates: updates.filter((update) => update.locationId === store.id).sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))),
  }));
  res.json({ items });
});

router.post("/locations/:id/updates", requirePermission("locations", "edit"), (req, res) => {
  const parsed = z.object({ note: z.string().trim().min(1).max(2000), status: z.string().trim().max(80).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A location update note is required." });
  const location = getStore().stores.find((store) => store.id === req.params.id);
  if (!location || !isWithinScope(req.auth!, location as unknown as Row)) return res.status(404).json({ error: "Location not found." });
  const result = mutateCollection(req.auth!, "locationUpdates", "create", {
    locationId: location.id,
    organizationId: location.companyId,
    note: parsed.data.note,
    status: parsed.data.status ?? location.status,
    occurredAt: new Date().toISOString(),
    madeBy: req.auth!.name,
    madeById: req.auth!.id,
  });
  res.status(result.pending ? 202 : 201).json(result);
});

router.get("/hr/birthdays", requirePermission("hr", "view"), (req, res) => {
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(today.getDate() + 60);
  const upcoming = scoped(req, rows("employees"), "employees").filter((employee) => {
    if (typeof employee.birthday !== "string") return false;
    const [, month, day] = employee.birthday.split("-").map(Number);
    const occurrence = new Date(today.getFullYear(), month - 1, day);
    if (occurrence < today) occurrence.setFullYear(today.getFullYear() + 1);
    return occurrence <= horizon;
  }).sort((a, b) => String(a.birthday).slice(5).localeCompare(String(b.birthday).slice(5)));
  res.json({ items: upcoming });
});

router.get("/work", requirePermission("operations", "view"), (req, res) => {
  const view = String(req.query.view ?? "all");
  const today = new Date().toISOString().slice(0, 10);
  let items = scoped(req, rows("workItems"), "workItems");
  if (view === "mine") items = items.filter((item) => item.assigneeId === req.auth!.employeeId || item.assignee === req.auth!.name || item.assignee === req.auth!.email);
  if (view === "upcoming") items = items.filter((item) => String(item.dueDate) >= today && !["Completed", "Cancelled"].includes(String(item.status)));
  if (view === "overdue") items = items.filter((item) => String(item.dueDate) < today && !["Completed", "Cancelled"].includes(String(item.status)));
  res.json({ items: items.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))), activity: scoped(req, rows("workActivity"), "workActivity") });
});

router.post("/work", requirePermission("operations", "create"), (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(1).max(180), organizationId: z.string().optional(), locationId: z.string().optional(),
    assignee: z.string().trim().max(120).optional(), assigneeId: z.string().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    priority: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium"), status: z.enum(["Planned", "Assigned", "In Progress", "Awaiting Approval", "Completed", "Cancelled"]).default("Planned"),
    workflow: z.string().trim().max(120).optional(), progress: z.coerce.number().min(0).max(100).default(0), comments: z.string().max(4000).optional(), attachments: z.string().max(2000).optional(), inventoryUsage: z.string().max(1000).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  try {
    const result = mutateCollection(req.auth!, "workItems", "create", parsed.data);
    res.status(result.pending ? 202 : 201).json(result);
  } catch (error) { sendError(res, error); }
});

router.patch("/work/:id", requirePermission("operations", "edit"), (req, res) => {
  const existing = rows("workItems").find((item) => item.id === req.params.id);
  if (!existing || !isWithinScope(req.auth!, existing)) return res.status(404).json({ error: "Work item not found." });
  try {
    const result = mutateCollection(req.auth!, "workItems", "edit", req.body as Record<string, unknown>, existing.id);
    res.status(result.pending ? 202 : 200).json(result);
  } catch (error) { sendError(res, error); }
});

router.post("/work/:id/activity", requirePermission("operations", "edit"), (req, res) => {
  const parsed = z.object({ message: z.string().trim().min(1).max(2000), progress: z.coerce.number().min(0).max(100).optional(), status: z.enum(["Planned", "Assigned", "In Progress", "Awaiting Approval", "Completed", "Cancelled"]).optional(), attachments: z.string().max(2000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter an activity update." });
  const existing = rows("workItems").find((item) => item.id === req.params.id);
  if (!existing || !isWithinScope(req.auth!, existing)) return res.status(404).json({ error: "Work item not found." });
  try {
    const result = mutateCollection(req.auth!, "workItems", "edit", { ...parsed.data, comments: parsed.data.message }, existing.id);
    if (!result.pending) mutateCollection(req.auth!, "workActivity", "create", { workItemId: existing.id, message: parsed.data.message, progress: parsed.data.progress ?? existing.progress, status: parsed.data.status ?? existing.status, occurredAt: new Date().toISOString() });
    res.status(result.pending ? 202 : 201).json(result);
  } catch (error) { sendError(res, error); }
});

router.get("/inventory", requirePermission("inventory", "view"), (req, res) => {
  const summary = inventorySummary();
  res.json({ ...summary, items: scoped(req, summary.items, "inventoryItems"), movements: scoped(req, summary.movements, "inventoryMovements") });
});

router.post("/inventory/items", requirePermission("inventory", "create"), (req, res) => {
  const parsed = z.object({ sku: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(180), unit: z.string().trim().min(1).max(40), stockLocation: z.string().trim().min(1).max(140), organizationId: z.string().optional(), locationId: z.string().optional(), openingStock: z.coerce.number().min(0).default(0), reorderPoint: z.coerce.number().min(0).default(0), allowNegative: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  try { const result = mutateCollection(req.auth!, "inventoryItems", "create", parsed.data); res.status(result.pending ? 202 : 201).json(result); } catch (error) { sendError(res, error); }
});

router.post("/inventory/movements", requirePermission("inventory", "create"), (req, res) => {
  const parsed = z.object({ inventoryItemId: z.string().min(1), type: z.enum(["incoming", "outgoing", "return", "adjustment"]), quantity: z.coerce.number().refine((value) => value !== 0, "Quantity cannot be zero."), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().min(1).max(500), relatedOperationId: z.string().optional(), reference: z.string().trim().max(160).optional(), permitNegative: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  const item = rows("inventoryItems").find((candidate) => candidate.id === parsed.data.inventoryItemId);
  if (!item || !isWithinScope(req.auth!, item)) return res.status(404).json({ error: "Inventory item not found." });
  const duplicateKey = [parsed.data.inventoryItemId, parsed.data.type, parsed.data.quantity, parsed.data.date, parsed.data.reason, parsed.data.reference ?? ""].join("|");
  if (rows("inventoryMovements").some((movement) => movement.duplicateKey === duplicateKey)) return res.status(409).json({ error: "An identical stock movement already exists. Review it before entering another." });
  const summary = inventorySummary().items.find((candidate) => candidate.id === item.id);
  const effect = parsed.data.type === "outgoing" ? -Math.abs(parsed.data.quantity) : parsed.data.type === "adjustment" ? parsed.data.quantity : Math.abs(parsed.data.quantity);
  const nextQuantity = Number(summary?.available ?? item.openingStock ?? 0) + effect;
  if (nextQuantity < 0 && !(item.allowNegative === true && parsed.data.permitNegative === true && can(req.auth, "inventory", "approve"))) return res.status(400).json({ error: "This movement would make stock negative. Enable and approve negative stock explicitly first." });
  try {
    const result = mutateCollection(req.auth!, "inventoryMovements", "create", { ...parsed.data, quantity: Math.abs(parsed.data.quantity), duplicateKey, responsibleUserId: req.auth!.id, responsibleUser: req.auth!.name, organizationId: item.organizationId, locationId: item.locationId });
    res.status(result.pending ? 202 : 201).json(result);
  } catch (error) { sendError(res, error); }
});

router.get("/finance", requirePermission("finance", "view"), (req, res) => {
  const summary = financeSummary();
  res.json({ ...summary, accounts: scoped(req, summary.accounts, "financeAccounts"), transactions: scoped(req, summary.transactions, "financeTransactions") });
});

router.post("/finance/accounts", requirePermission("finance", "create"), (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(140), type: z.enum(["bank", "cash", "wallet", "other"]), currency: z.string().trim().min(3).max(8), openingBalance: z.coerce.number().default(0), organizationId: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide a valid account." });
  try { const result = mutateCollection(req.auth!, "financeAccounts", "create", parsed.data); res.status(result.pending ? 202 : 201).json(result); } catch (error) { sendError(res, error); }
});

router.post("/finance/transactions", requirePermission("finance", "create"), (req, res) => {
  const parsed = z.object({ type: z.enum(["income", "expense", "payroll", "transfer"]), accountId: z.string().min(1), destinationAccountId: z.string().optional(), amount: z.coerce.number().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(["draft", "pending", "paid", "cancelled"]).default("pending"), reference: z.string().trim().max(160).optional(), description: z.string().trim().max(1000).optional(), supportingDocument: z.string().trim().max(2000).optional(), employeeId: z.string().optional(), organizationId: z.string().optional(), locationId: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  const account = rows("financeAccounts").find((candidate) => candidate.id === parsed.data.accountId);
  if (!account || !isWithinScope(req.auth!, account)) return res.status(404).json({ error: "Source account not found." });
  if (parsed.data.type === "transfer") {
    if (!parsed.data.destinationAccountId || parsed.data.destinationAccountId === parsed.data.accountId) return res.status(400).json({ error: "Choose a different destination account for an internal transfer." });
    const destination = rows("financeAccounts").find((candidate) => candidate.id === parsed.data.destinationAccountId);
    if (!destination || !isWithinScope(req.auth!, destination)) return res.status(404).json({ error: "Destination account not found." });
  }
  try {
    if (parsed.data.type === "transfer") {
      const group = `transfer-${Date.now().toString(36)}`;
      const outgoing = mutateCollection(req.auth!, "financeTransactions", "create", { ...parsed.data, direction: "out", transferGroupId: group });
      const incoming = mutateCollection(req.auth!, "financeTransactions", "create", { ...parsed.data, accountId: parsed.data.destinationAccountId, destinationAccountId: parsed.data.accountId, direction: "in", transferGroupId: group });
      return res.status(outgoing.pending || incoming.pending ? 202 : 201).json({ pending: outgoing.pending || incoming.pending, items: [outgoing.item, incoming.item].filter(Boolean) });
    }
    const direction = parsed.data.type === "income" ? "in" : "out";
    const result = mutateCollection(req.auth!, "financeTransactions", "create", { ...parsed.data, direction });
    return res.status(result.pending ? 202 : 201).json(result);
  } catch (error) { return sendError(res, error); }
});

router.get("/access/roles", requirePermission("access", "view"), (_req, res) => res.json({ items: rows("accessRoles") }));
router.get("/access/users", requirePermission("access", "view"), (_req, res) => res.json({ items: rows("accessUsers").map(({ passwordHash: _passwordHash, ...user }) => user) }));
router.patch("/access/roles/:id", requirePermission("access", "edit"), (req, res) => {
  const role = rows("accessRoles").find((item) => item.id === req.params.id);
  if (!role) return res.status(404).json({ error: "Role not found." });
  if (role.id === "role-main-manager" && Array.isArray(req.body.permissions) && !req.body.permissions.includes("*")) return res.status(400).json({ error: "The Main Manager role must retain full permissions." });
  const parsed = z.object({ permissions: z.array(z.string()).optional(), organizationIds: z.array(z.string()).optional(), locationIds: z.array(z.string()).optional(), ownRecordsOnly: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid role permissions or access scope." });
  try { res.json(mutateCollection(req.auth!, "accessRoles", "edit", parsed.data, role.id)); } catch (error) { sendError(res, error); }
});
router.get("/access/approval-rules", requirePermission("access", "view"), (_req, res) => res.json({ items: rows("approvalRules") }));
router.post("/access/approval-rules", requirePermission("access", "create"), (req, res) => {
  const parsed = z.object({ section: z.enum(["organizations", "locations", "hr", "operations", "inventory", "finance", "access"]), action: z.enum(["create", "edit", "delete"]), active: z.boolean().default(true) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a section and sensitive action." });
  try {
    const existing = rows("approvalRules").find((rule) => rule.section === parsed.data.section && rule.action === parsed.data.action);
    const result = mutateCollection(req.auth!, "approvalRules", existing ? "edit" : "create", parsed.data, existing?.id);
    res.status(result.pending ? 202 : existing ? 200 : 201).json(result);
  } catch (error) { sendError(res, error); }
});
router.patch("/access/approval-rules/:id", requirePermission("access", "edit"), (req, res) => {
  const rule = rows("approvalRules").find((item) => item.id === req.params.id);
  if (!rule) return res.status(404).json({ error: "Approval rule not found." });
  try { res.json(mutateCollection(req.auth!, "approvalRules", "edit", req.body as Record<string, unknown>, rule.id)); } catch (error) { sendError(res, error); }
});

router.post("/access/users", requirePermission("access", "create"), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160), password: z.string().min(12).max(256), roleId: z.string().min(1), employeeId: z.string().optional(), organizationIds: z.array(z.string()).default([]), locationIds: z.array(z.string()).default([]), ownRecordsOnly: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
  if (rows("accessUsers").some((user) => String(user.email).toLowerCase() === parsed.data.email.toLowerCase())) return res.status(409).json({ error: "An account with that email already exists." });
  if (!rows("accessRoles").some((role) => role.id === parsed.data.roleId)) return res.status(400).json({ error: "Choose a valid role." });
  const account = { id: nextCollectionId("accessUsers"), ...parsed.data, email: parsed.data.email.toLowerCase(), passwordHash: await hashPassword(parsed.data.password), status: "active", createdAt: new Date().toISOString(), dataClassification: "company" };
  const data = getStore();
  data.collections.accessUsers = [...rows("accessUsers"), account];
  saveStore(data);
  audit(req.auth, "access.user-created", { targetId: account.id, email: account.email, roleId: account.roleId });
  res.status(201).json({ item: publicUser(account) });
});

router.patch("/access/users/:id", requirePermission("access", "edit"), async (req, res) => {
  const users = rows("accessUsers");
  const existing = users.find((user) => user.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found." });
  const next: Row = { ...existing, ...req.body as Record<string, unknown>, id: existing.id, updatedAt: new Date().toISOString() };
  if (typeof req.body.password === "string" && req.body.password) {
    if (req.body.password.length < 12) return res.status(400).json({ error: "Use at least 12 characters for passwords." });
    next.passwordHash = await hashPassword(req.body.password);
    delete next.password;
  }
  const wasManager = existing.roleId === "role-main-manager" && existing.status === "active";
  const remainsManager = next.roleId === "role-main-manager" && next.status === "active";
  if (wasManager && !remainsManager && users.filter((user) => user.roleId === "role-main-manager" && user.status === "active").length <= 1) return res.status(400).json({ error: "The last Main Manager cannot be removed or deactivated." });
  const data = getStore();
  data.collections.accessUsers = users.map((user) => user.id === existing.id ? next : user);
  saveStore(data);
  audit(req.auth, "access.user-updated", { targetId: existing.id, status: next.status, roleId: next.roleId });
  const { passwordHash: _passwordHash, ...safe } = next;
  res.json({ item: safe });
});

router.get("/approvals", requirePermission("approvals", "view"), (_req, res) => res.json({ items: rows("approvalRequests") }));
router.post("/approvals/:id", requirePermission("approvals", "approve"), (req, res) => {
  const parsed = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(2000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose approve or reject." });
  try { res.json({ item: approveRequest(req.auth!, req.params.id as string, parsed.data.decision === "approve", parsed.data.note) }); } catch (error) { sendError(res, error); }
});

router.get("/audit", requirePermission("audit", "view"), (_req, res) => res.json({ items: rows("auditLog").sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))) }));

export default router;