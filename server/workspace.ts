import type { AuthenticatedUser } from "./auth.js";
import { getCollection, getStore, nextCollectionId, saveStore } from "./storage.js";
import { can, sectionForCollection, type PermissionAction, type WorkspaceSection } from "./permissions.js";
import { createNotification, listNotifications } from "./notifications.js";

export type Row = Record<string, unknown> & { id: string };
export type MutationAction = "create" | "edit" | "delete";

interface ApprovalRule extends Row {
  section: WorkspaceSection;
  action: MutationAction | "approve";
  active: boolean;
}

interface ApprovalRequest extends Row {
  status: "pending" | "approved" | "rejected" | "cancelled";
  section: WorkspaceSection;
  action: MutationAction;
  collection: string;
  targetId?: string;
  payload?: Record<string, unknown>;
  requestedBy: string;
}

function timestamp() {
  return new Date().toISOString();
}

function rows(name: string): Row[] {
  return getCollection(name) as Row[];
}

function rowId(name: string) {
  return nextCollectionId(name);
}

export function audit(user: AuthenticatedUser | undefined, action: string, details: Record<string, unknown> = {}) {
  const entry: Row = {
    id: rowId("auditLog"),
    action,
    actorId: user?.id ?? "system",
    actorName: user?.name ?? "System",
    occurredAt: timestamp(),
    ...details,
  };
  const data = getStore();
  data.collections.auditLog = [...rows("auditLog"), entry];
  saveStore(data);
  return entry;
}

export function requiresApproval(section: WorkspaceSection, action: MutationAction): boolean {
  return (rows("approvalRules") as ApprovalRule[]).some(
    (rule) => rule.active === true && rule.section === section && rule.action === action,
  );
}

function updateEmployeeHistory(user: AuthenticatedUser, employee: Row, event: string) {
  const history: Row = {
    id: rowId("employeeHistory"),
    employee: employee.name ?? employee.id,
    employeeId: employee.id,
    date: new Date().toISOString().slice(0, 10),
    event,
    details: `Employee record ${event}.`,
    changedBy: user.name,
    changedById: user.id,
    dataClassification: "company",
  };
  const data = getStore();
  data.collections.employeeHistory = [...rows("employeeHistory"), history];
  saveStore(data);
}

function updateWorkActivity(user: AuthenticatedUser, item: Row, event: string) {
  const activity: Row = {
    id: rowId("workActivity"),
    workItemId: item.id,
    message: event,
    progress: item.progress ?? 0,
    status: item.status ?? "Planned",
    createdBy: user.name,
    createdById: user.id,
    occurredAt: timestamp(),
    dataClassification: "company",
  };
  const data = getStore();
  data.collections.workActivity = [...rows("workActivity"), activity];
  saveStore(data);
}

function applyMutation(user: AuthenticatedUser, collection: string, action: MutationAction, payload: Record<string, unknown>, targetId?: string): Row | undefined {
  const data = getStore();
  const list = rows(collection);
  const now = timestamp();
  if (action === "delete") {
    if (!targetId) throw new Error("A record id is required.");
    const existing = list.find((row) => row.id === targetId);
    if (!existing) throw new Error("Record not found.");
    data.collections[collection] = list.filter((row) => row.id !== targetId);
    saveStore(data);
    audit(user, `${collection}.deleted`, { collection, targetId, section: sectionForCollection(collection) });
    return existing;
  }

  const existing = targetId ? list.find((row) => row.id === targetId) : undefined;
  if (targetId && !existing) throw new Error("Record not found.");
  const item: Row = existing
    ? { ...existing, ...payload, id: existing.id, updatedAt: now, updatedBy: user.id, updatedByName: user.name }
    : {
      ...payload,
      id: typeof payload.id === "string" && payload.id ? payload.id : rowId(collection),
      createdAt: now,
      createdBy: user.id,
      createdByName: user.name,
      updatedAt: now,
      updatedBy: user.id,
      updatedByName: user.name,
      dataClassification: payload.dataClassification ?? "company",
    };
  data.collections[collection] = existing ? list.map((row) => row.id === item.id ? item : row) : [...list, item];
  saveStore(data);
  if (collection === "employees") updateEmployeeHistory(user, item, existing ? "updated" : "hired");
  if (collection === "workItems") updateWorkActivity(user, item, existing ? "Work item updated." : "Work item created.");
  audit(user, `${collection}.${action}`, { collection, targetId: item.id, section: sectionForCollection(collection) });
  return item;
}

export function mutateCollection(
  user: AuthenticatedUser,
  collection: string,
  action: MutationAction,
  payload: Record<string, unknown> = {},
  targetId?: string,
): { pending: boolean; item?: Row; request?: ApprovalRequest } {
  const section = sectionForCollection(collection);
  const permissionAction: PermissionAction = action;
  if (!can(user, section, permissionAction)) throw new Error(`You do not have permission to ${action} ${section}.`);
  if (requiresApproval(section, action)) {
    const request: ApprovalRequest = {
      id: rowId("approvalRequests"),
      status: "pending",
      section,
      action,
      collection,
      targetId,
      payload,
      requestedBy: user.id,
      requestedByName: user.name,
      requestedAt: timestamp(),
      dataClassification: "company",
    };
    const data = getStore();
    data.collections.approvalRequests = [...rows("approvalRequests"), request];
    saveStore(data);
    audit(user, "approval.requested", { approvalRequestId: request.id, section, action, collection, targetId });
    notifyPendingApproval(user, request);
    return { pending: true, request };
  }
  const item = applyMutation(user, collection, action, payload, targetId);
  fireMutationAlerts(user, collection, action, payload, item);
  return { pending: false, item };
}

function fireMutationAlerts(
  user: AuthenticatedUser,
  collection: string,
  action: MutationAction,
  payload: Record<string, unknown>,
  item?: Row,
): void {
  if (collection === "workItems" && action === "create") {
    const dueDate = String(payload.dueDate ?? "");
    if (!dueDate) return;
    const overdueKey = new Date().toISOString().slice(0, 10);
    if (dueDate < overdueKey && !["Completed", "Cancelled"].includes(String(payload.status ?? ""))) {
      createNotification({
        userId: user.id,
        user: user.name,
        type: "overdue_work",
        severity: "warning",
        message: `Work item "${String(payload.title ?? "Untitled")}" is overdue.`,
        target: dueDate,
      });
    }
  }

  if (collection === "inventoryItems" && action === "create") {
    const openingStock = Number(payload.openingStock ?? 0);
    const reorderPoint = Number(payload.reorderPoint ?? 0);
    if (openingStock <= reorderPoint) {
      createNotification({
        userId: user.id,
        user: user.name,
        type: "low_stock",
        severity: "warning",
        message: `New inventory item "${String(payload.name ?? "Untitled")}" is at or below its reorder point.`,
        target: String(payload.id ?? ""),
      });
    }
  }

  if (collection === "inventoryMovements" && action === "create") {
    const summary = inventorySummary();
    const inventoryItemId = String(payload.inventoryItemId ?? "");
    const item = summary.items.find((candidate) => candidate.id === inventoryItemId);
    if (item?.lowStock) {
      const itemName = (item as { name?: string }).name ?? "inventory item";
      createNotification({
        userId: user.id,
        user: user.name,
        type: "low_stock",
        severity: "warning",
        message: `Stock for "${itemName}" is at or below its reorder point.`,
        target: inventoryItemId,
      });
    }
  }
}

function notifyPendingApproval(user: AuthenticatedUser, request: ApprovalRequest): void {
  createNotification({
    userId: request.requestedBy,
    user: user.name,
    type: "pending_approval",
    severity: "info",
    message: `Your ${request.action} in ${request.section} is awaiting approval.`,
    target: request.id,
  });
}

export function approveRequest(user: AuthenticatedUser, requestId: string, approve: boolean, note?: string): ApprovalRequest {
  if (!can(user, "approvals", "approve")) throw new Error("You do not have permission to approve requests.");
  const data = getStore();
  const list = rows("approvalRequests") as ApprovalRequest[];
  const request = list.find((row) => row.id === requestId);
  if (!request) throw new Error("Approval request not found.");
  if (request.status !== "pending") throw new Error("This approval request has already been processed.");
  if (request.requestedBy === user.id) throw new Error("A requester cannot approve their own request.");
  if (approve) applyMutation(user, request.collection, request.action, request.payload ?? {}, request.targetId);
  const updated: ApprovalRequest = {
    ...request,
    status: approve ? "approved" : "rejected",
    decidedAt: timestamp(),
    decidedBy: user.id,
    decidedByName: user.name,
    decisionNote: note ?? "",
  };
  data.collections.approvalRequests = list.map((row) => row.id === requestId ? updated : row);
  saveStore(data);
  audit(user, approve ? "approval.approved" : "approval.rejected", { approvalRequestId: requestId, section: request.section, action: request.action });
  return updated;
}

export function financeSummary() {
  const accounts = rows("financeAccounts");
  const transactions = rows("financeTransactions");
  const balances = accounts.map((account) => {
    const opening = Number(account.openingBalance ?? 0);
    const movement = transactions
      .filter((transaction) => transaction.accountId === account.id && transaction.status !== "cancelled")
      .reduce((sum, transaction) => {
        const amount = Number(transaction.amount ?? 0);
        return sum + (transaction.direction === "in" ? amount : transaction.direction === "out" ? -amount : 0);
      }, 0);
    return { ...account, balance: opening + movement };
  });
  const income = transactions.filter((row) => row.type === "income" && row.status !== "cancelled").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const expenses = transactions.filter((row) => row.type === "expense" && row.status !== "cancelled").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const salaries = transactions.filter((row) => row.type === "payroll" && row.status !== "cancelled").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  return { accounts: balances, income, expenses, salaries, net: income - expenses - salaries, transactions };
}

export function inventorySummary() {
  const items = rows("inventoryItems");
  const movements = rows("inventoryMovements");
  const stock = items.map((item) => {
    const opening = Number(item.openingStock ?? 0);
    const totals = movements.filter((movement) => movement.inventoryItemId === item.id).reduce(
      (sum, movement) => {
        const quantity = Number(movement.quantity ?? 0);
        if (movement.type === "incoming") sum.incoming += quantity;
        if (movement.type === "return") sum.returns += quantity;
        if (movement.type === "outgoing") sum.outgoing += quantity;
        if (movement.type === "adjustment") sum.adjustments += quantity;
        return sum;
      },
      { incoming: 0, returns: 0, outgoing: 0, adjustments: 0 },
    );
    const available = opening + totals.incoming + totals.returns - totals.outgoing + totals.adjustments;
    return { ...item, ...totals, available, consumed: totals.outgoing, lowStock: available <= Number(item.reorderPoint ?? 0) };
  });
  return { items: stock, movements, lowStockCount: stock.filter((item) => item.lowStock).length };
}