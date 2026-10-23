import { applySmartTaskApproval, applyTaskManagementApproval, prepareTaskMutation } from "./operations.js";
import { appendFinancialHistory, ledgerSummary, validateFinancialMutation } from "./finance-ledger.js";
import { protectCommerceStock } from "./commerce-stock.js";
import { generateEmployeeCode } from "./employee-identity.js";
import { eligibleSelfApproval } from "./admin-policy.js";
import { syncEmployeeAccount } from "./employee-accounts.js";
import type { AuthenticatedUser } from "./auth.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "./storage.js";
import { validateHierarchyMutation } from "./organization-policy.js";
import { can, canViewSalaryData, canManageHr, isMainManager, isWithinScope, sectionForCollection, type PermissionAction, type WorkspaceSection } from "./permissions.js";
import { createNotification } from "./notifications.js";
import { newProductAwb } from "./product-awb.js";
import { applyDocumentApproval, managesDocuments, documentCompanyScope } from "./documents.js";

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
  const subject = details.collection && details.targetId ? rows(String(details.collection)).find(row => row.id === details.targetId) : undefined;
  const companyId = subject?.organizationId ?? subject?.companyId ?? (details.collection === "companies" ? details.targetId : undefined) ?? user?.organizationIds[0];
  const entry: Row = {
    id: rowId("auditLog"),
    action,
    actorId: user?.id ?? "system",
    actorName: user?.name ?? "System",
    occurredAt: timestamp(),
    ...(companyId ? { organizationId: companyId } : {}),
    ...(subject?.parentOrganizationId ? { parentOrganizationId: subject.parentOrganizationId } : {}),
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
    organizationId: employee.organizationId,
    locationId: employee.locationId,
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

function updateWorkActivity(user: AuthenticatedUser, item: Row, event: string, previous?: Row) {
  const activity: Row = {
    id: rowId("workActivity"),
    workItemId: item.id,
    organizationId: item.organizationId,
    locationId: item.locationId,
    message: event,
    progress: item.progress ?? 0,
    status: item.status ?? "Planned",
    completionTransition: item.status === "Completed" && previous?.status !== "Completed",
    previousStatus: previous?.status,
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
  const shopCurrent = targetId ? rows(collection).find(row => row.id === targetId) : undefined;
  protectCommerceStock(collection, action, payload, shopCurrent);
  if (collection === "sales" && shopCurrent?.shopOrderId) throw new Error("Shop sales are immutable. Record settlement or a controlled financial reversal instead.");
  if (collection === "workActivity") payload = { ...payload, completionTransition: false };
  if(collection==="workItems")payload=prepareTaskMutation(user,action,payload,targetId?rows(collection).find(row=>row.id===targetId):undefined);
  if(["workFiles","taskNotificationEvents"].includes(collection)||collection==="workActivity"&&targetId&&rows(collection).some(e=>e.id===targetId&&e.taskVersion===2))throw new Error("Use the secure task workflow. Task history and files are immutable.");
  protectPayrollMutation(collection, action, payload, targetId);
  payload = validateFinancialMutation(user, collection, action, payload, targetId ? rows(collection).find(row => row.id === targetId) : undefined);
  if (collection === "documents") throw new Error("Use the secure Documents workspace to manage HR documents.");
  if (sectionForCollection(collection) === "hr" && !canManageHr(user, action)) throw new Error("You do not have permission to manage HR records.");
  const data = getStore();
  const list = rows(collection);
  const now = timestamp();
  if (action === "delete") {
    if (!targetId) throw new Error("A record id is required.");
    const existing = list.find((row) => row.id === targetId);
    if (!existing) throw new Error("Record not found.");
    // Own-records roles must not reach records outside their scope by id.
    if (!isWithinScope(user, existing)) throw new Error("Record not found.");
    data.collections[collection] = list.filter((row) => row.id !== targetId);
    saveStore(data);
    audit(user, `${collection}.deleted`, { collection, targetId, organizationId:existing.organizationId??existing.companyId, locationId:existing.locationId, section: sectionForCollection(collection) });
    return existing;
  }

  const existing = targetId ? list.find((row) => row.id === targetId) : undefined;
  if (targetId && !existing) throw new Error("Record not found.");
  if (existing && !isWithinScope(user, existing)) throw new Error("Record not found.");
  if (collection === "employees" && !existing && !String(payload.employeeCode || "").trim()) payload = { ...payload, employeeCode: generateEmployeeCode([...rows("employees"),...rows("employeeIdentities")]) };
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
  if(collection==="employees"&&!existing){data.collections.employeeIdentities=[...rows("employeeIdentities"),{id:rowId("employeeIdentities"),employeeCode:item.employeeCode,organizationId:item.organizationId,employeeId:item.id,issuedAt:now}];}
  if (["products", "inventoryItems"].includes(collection)) {
    const used = new Set([...rows("products"), ...rows("inventoryItems")].map(row => String(row.awb ?? "")));
    item.awb = existing?.awb || newProductAwb(used);
  }
  if (collection === "inventoryItems") {
    const changedFields = Object.keys(payload).filter((key) => JSON.stringify(existing?.[key]) !== JSON.stringify(item[key]));
    data.collections.inventoryHistory = [...rows("inventoryHistory"), { id: rowId("inventoryHistory"), inventoryItemId: item.id, organizationId: item.organizationId, actor: user.name, actorId: user.id, occurredAt: now, action, changedFields }];
  }
  saveStore(data);
  revokeTenantSessions(collection, action, payload, existing, targetId);
  if (collection === "employees") { syncEmployeeAccount(user, item, existing); updateEmployeeHistory(user, item, existing ? "updated" : "hired"); }
  if (collection === "workItems") updateWorkActivity(user, item, String(payload.comments || (existing ? "Work item updated." : "Work item created.")), existing);
  if (["financeTransactions", "financeAccounts"].includes(collection)) appendFinancialHistory(user, `${collection}.${action}`, item, String(item.description || "Financial record saved"));
  audit(user, `${collection}.${action}`, { collection, targetId: item.id, section: sectionForCollection(collection) });
  return item;
}

export function mutateCollection(
  user: AuthenticatedUser,
  collection: string,
  action: MutationAction,
  payload: Record<string, unknown> = {},
  targetId?: string,
  permissionAction: PermissionAction = action,
): { pending: boolean; item?: Row; request?: ApprovalRequest } {
  return transaction(() => performMutation(user, collection, action, payload, targetId, permissionAction));
}

function currentPayrollTransaction(id?: string) { return id && rows("financeTransactions").some(row => row.id === id && row.payrollRunId); }

function protectPayrollMutation(collection: string, action: MutationAction, payload: Record<string, unknown>, targetId?: string) {
  if (["payroll", "payrollEntries", "payrollRuns", "payrollSources", "payrollSettings", "payrollSalaries", "payrollHistory"].includes(collection)) throw new Error("Use the secure Payroll workspace to manage payroll records.");
  if (collection === "financeTransactions" && action === "create" && payload.type === "payroll" && rows("payrollSettings").some(setting => setting.configured && setting.organizationId === payload.organizationId)) throw new Error("Use Payroll runs to record confirmed salary payments and prevent double counting.");
  if (collection === "financeTransactions" && (payload.payrollRunId || (currentPayrollTransaction(targetId)))) throw new Error("Confirmed payroll ledger entries are immutable. Use an approved later-period payroll adjustment.");
}

function performMutation(user: AuthenticatedUser, collection: string, action: MutationAction, payload: Record<string, unknown>, targetId: string | undefined, permissionAction: PermissionAction): { pending: boolean; item?: Row; request?: ApprovalRequest } {
  if (collection === "documents") throw new Error("Use the secure Documents workspace to manage HR documents.");
  const section = sectionForCollection(collection);
  if (!can(user, section, permissionAction)) throw new Error(`You do not have permission to ${action} ${section}.`);
  const current = targetId ? rows(collection).find(row => row.id === targetId) : undefined;
  // HR creates receive server IDs. Main Admin legacy imports may retain existing formats.
  if (collection === "employees" && action === "create" && !isMainManager(user)) { payload = { ...payload }; delete payload.employeeCode; }
  if (targetId && (!current || !isWithinScope(user, current))) throw new Error("Record not found.");
  // Client IDs must never impersonate organization/company rows during scope resolution.
  if (payload.id !== undefined && (!current || payload.id !== current.id)) throw Object.assign(new Error("Record identifiers are assigned by the server and cannot be changed."), { statusCode: 400 });
  if (["organizations", "companies"].includes(collection)) payload = validateHierarchyMutation(user, collection, action, payload, current);
  if (action === "create" && !isMainManager(user) && !payload.organizationId && !payload.companyId && user.organizationIds.length === 1) payload = { ...payload, organizationId: user.organizationIds[0] };
  protectPayrollMutation(collection, action, payload, targetId);
  if (["products", "inventoryItems"].includes(collection) && action !== "delete" && !rows("companies").some(company => company.id === (payload.organizationId ?? current?.organizationId))) throw new Error("Choose an existing company for this product.");
  if (action !== "delete" && !(collection === "organizations" && isMainManager(user)) && !isWithinScope(user, { ...current, ...payload, createdBy: current?.createdBy ?? user.id })) throw new Error("You do not have permission to use this record scope.");
  if (!["organizations", "companies"].includes(collection)) payload = validateHierarchyMutation(user, collection, action, payload, current);
  if (action === "create" && payload.id && rows(collection).some(row => row.id === payload.id)) throw new Error("A record with this id already exists.");
  payload = { ...payload };
  for (const field of ["createdAt", "createdBy", "createdByName", "updatedAt", "updatedBy", "updatedByName", "__proto__", "constructor", "prototype"]) delete payload[field];
  if (collection === "financeTransactions" && action === "create" && payload.idempotencyKey) {
    const fingerprint = JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([key]) => !["financialFingerprint", "idempotencyKey", "transferGroupId"].includes(key)).sort(([a], [b]) => a.localeCompare(b))));
    payload.financialFingerprint = fingerprint;
    const prior = rows(collection).find(row => (row.submittedBy ?? row.createdBy) === user.id && row.idempotencyKey === payload.idempotencyKey);
    const pending = rows("approvalRequests").find(row => row.collection === collection && row.requestedBy === user.id && row.payload && (row.payload as Record<string,unknown>).idempotencyKey === payload.idempotencyKey);
    const original = prior ?? (pending?.payload as Record<string,unknown> | undefined);
    if (original) {
      if (original.financialFingerprint !== fingerprint) throw Object.assign(new Error("This payment key was used with different details."), {statusCode:409});
      if (prior) return { pending:false, item:prior };
      if (pending?.status !== "pending") throw Object.assign(new Error("This submission was already reviewed. Start a new payment."), {statusCode:409});
      return {pending:true, request:pending as ApprovalRequest};
    }
  }
  if (collection === "financeTransactions" && action === "create") payload.submittedBy = user.id;
  payload = validateFinancialMutation(user, collection, action, payload, current);
  if (collection === "employees") for (const key of ["accountId", "passwordHash", "roleId", "permissions", "activationRequired", "username", "employeeRequestKey"]) delete payload[key];
  if (collection === "employees" && !canViewSalaryData(user)) delete payload.salary;
  if (collection === "employees" && action === "create" && payload.clientRequestId !== undefined) {
    const key = String(payload.clientRequestId);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new Error("Use a valid employee submission identifier.");
    delete payload.clientRequestId;
    const duplicate = rows("employees").find(row => row.createdBy === user.id && row.employeeRequestKey === key);
    if (duplicate) {
      if (!isWithinScope(user, duplicate)) throw new Error("Record not found.");
      if (Object.entries(payload).some(([name,value]) => !(name === "employeeCode" && !value) && JSON.stringify(duplicate[name]) !== JSON.stringify(value))) throw Object.assign(new Error("This submission was already used. Open the existing employee or start a new form."), {statusCode:409});
      return { pending:false, item:duplicate };
    }
    const pending = (rows("approvalRequests") as ApprovalRequest[]).find(row => row.collection === "employees" && row.requestedBy === user.id && row.status === "pending" && row.payload?.employeeRequestKey === key);
    if (pending) return { pending:true, request:pending };
    payload.employeeRequestKey = key;
  }
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
      organizationId: payload.organizationId ?? current?.organizationId ?? user.organizationIds[0],
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

function revokeTenantSessions(collection: string, action: MutationAction, payload: Record<string, unknown>, current: Row | undefined, targetId?: string) {
  if ((collection === "organizations" || collection === "companies") && action === "edit" && (payload.status === "inactive" || (current?.parentOrganizationId && payload.parentOrganizationId && current.parentOrganizationId !== payload.parentOrganizationId))) {
    const companies = collection === "organizations" ? rows("companies").filter(company => company.parentOrganizationId === targetId).map(company => company.id) : [targetId];
    const accounts = rows("accessUsers").filter(account => account.roleId !== "role-main-manager" && ((Array.isArray(account.organizationIds) && account.organizationIds.some(id => companies.includes(String(id)))) || (collection === "organizations" && Array.isArray(account.tenantOrganizationIds) && account.tenantOrganizationIds.includes(targetId)))).map(account => account.id);
    const data = getStore(); data.collections.sessions = rows("sessions").filter(session => !accounts.includes(String(session.accountId))); saveStore(data);
  }
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
        target: item?.id ?? dueDate,
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
        target: String(item?.id ?? payload.id ?? ""),
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
  for (const manager of rows("accessUsers").filter(row => row.roleId === "role-main-manager" && row.status === "active" && row.id !== user.id)) {
    createNotification({ userId: manager.id, user: String(manager.name), type: "pending_approval", severity: "info", message: `${user.name} requested ${request.action} in ${request.section}.`, target: request.id });
  }
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
  return transaction(() => decideRequest(user, requestId, approve, note));
}

/** Resolve legacy requests through their target/payload without broadening scope. */
function approvalWithinScope(user: AuthenticatedUser, request: Row): boolean {
  const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
  const current = request.targetId ? rows(String(request.collection)).find(row => row.id === request.targetId) : undefined;
  const scope: Row = { ...current, ...payload, ...request,
    locationId: request.locationId ?? payload.locationId ?? current?.locationId,
    storeId: request.storeId ?? payload.storeId ?? current?.storeId,
    employeeId: request.employeeId ?? payload.employeeId ?? current?.employeeId,
  };
  return isWithinScope(user, scope);
}

export function canReadApproval(user: AuthenticatedUser, request: Row): boolean {
  return approvalWithinScope(user, request) && (request.collection !== "documents" || (managesDocuments(user) && documentCompanyScope(user, request.organizationId)));
}

function decideRequest(user: AuthenticatedUser, requestId: string, approve: boolean, note?: string, pairedTransfer = false): ApprovalRequest {
  if (!can(user, "approvals", "approve")) throw new Error("You do not have permission to approve requests.");
  let data = getStore();
  const list = rows("approvalRequests") as ApprovalRequest[];
  const request = list.find((row) => row.id === requestId);
  if (!request) throw new Error("Approval request not found.");
  if (!approvalWithinScope(user, request)) throw new Error("Approval request not found.");
  if (request.collection === "documents" && !managesDocuments(user, request.action)) throw new Error("You do not have permission to decide HR document requests.");
  if (request.status !== "pending") throw new Error("This approval request has already been processed.");
  const selfApproved=request.requestedBy===user.id;
  if(selfApproved&&(!isMainManager(user)||!eligibleSelfApproval(request)))throw new Error("A requester cannot approve their own request.");
  if(selfApproved&&String(note||"").trim().length<8)throw new Error("Enter a reason of at least 8 characters for Main Administrator self-approval.");
  if (!pairedTransfer && request.collection === "financeTransactions" && request.payload?.type === "transfer" && request.payload.transferGroupId) {
    const pair = list.filter(row => row.collection === "financeTransactions" && row.payload?.type === "transfer" && row.payload.transferGroupId === request.payload!.transferGroupId);
    if (pair.length !== 2 || pair.some(row => row.status !== "pending")) throw new Error("Both sides of a transfer must be pending for joint review.");
    const [first, second] = pair;
    if (first.payload?.direction === second.payload?.direction || first.payload?.amount !== second.payload?.amount
      || first.payload?.accountId !== second.payload?.destinationAccountId || second.payload?.accountId !== first.payload?.destinationAccountId) throw new Error("The transfer approval pair is inconsistent.");
    const decisions = pair.map(row => decideRequest(user, row.id, approve, note, true));
    return decisions.find(row => row.id === requestId)!;
  }
  if (approve) {
    if(request.collection==="workItems"&&request.payload?.smartTaskManagement)applyTaskManagementApproval(user,request);
    else if(request.collection==="workItems"&&request.payload?.smartTaskInput)applySmartTaskApproval(user,request);
    else if (request.collection === "documents") applyDocumentApproval(user, request);
    else {
    validateHierarchyMutation(user, request.collection, request.action, request.payload ?? {}, request.targetId ? rows(request.collection).find(row => row.id === request.targetId) : undefined);
    applyMutation(user, request.collection, request.action, {...request.payload,...(request.section==="finance"?{approvedBy:user.id,approvedAt:timestamp()}:{})}, request.targetId);
    }
    data = getStore();
  }
  const updated: ApprovalRequest = {
    ...request,
    status: approve ? "approved" : "rejected",
    decidedAt: timestamp(),
    decidedBy: user.id,
    decidedByName: user.name,
    decisionNote: note ?? "",
    selfApproved,
  };
  data.collections.approvalRequests = list.map((row) => row.id === requestId ? updated : row);
  saveStore(data);
  audit(user, approve ? "approval.approved" : "approval.rejected", { approvalRequestId: requestId, section: request.section, action: request.action,collection:request.collection,targetId:request.targetId,organizationId:request.organizationId,requesterId:request.requestedBy,approverId:user.id,decidedAt:updated.decidedAt,selfApproved,reason:note||"",outcome:updated.status });
  const requester = rows("accessUsers").find(row => row.id === request.requestedBy);
  if (requester) createNotification({ userId: requester.id, user: String(requester.name), type: "message", severity: "info", message: `${user.name} ${approve ? "approved" : "rejected"} your ${request.action} request in ${request.section}.${note ? `\n${note}` : ""}`, target: request.id });
  return updated;
}

export function financeSummary(user?: AuthenticatedUser) { return ledgerSummary(user); }

export function inventorySummary(user?: AuthenticatedUser) {
  const items = rows("inventoryItems").filter(row => !user || isWithinScope(user, row));
  const movements = rows("inventoryMovements").filter(row => !user || isWithinScope(user, row));
  const totalsByItem = new Map<unknown, { incoming: number; returns: number; outgoing: number; adjustments: number }>();
  for (const movement of movements) {
    const totals = totalsByItem.get(movement.inventoryItemId) ?? { incoming: 0, returns: 0, outgoing: 0, adjustments: 0 };
    const quantity = Number(movement.quantity ?? 0);
    if (movement.type === "incoming") totals.incoming += quantity;
    if (movement.type === "return") totals.returns += quantity;
    if (movement.type === "outgoing") totals.outgoing += quantity;
    if (movement.type === "adjustment") totals.adjustments += quantity;
    totalsByItem.set(movement.inventoryItemId, totals);
  }
  const stock = items.map((item) => {
    const opening = Number(item.openingStock ?? 0);
    const totals = totalsByItem.get(item.id) ?? { incoming: 0, returns: 0, outgoing: 0, adjustments: 0 };
    const available = opening + totals.incoming + totals.returns - totals.outgoing + totals.adjustments;
    return { ...item, ...totals, available, consumed: totals.outgoing, lowStock: available <= Number(item.reorderPoint ?? 0) };
  });
  return { items: stock, movements, lowStockCount: stock.filter((item) => item.lowStock).length };
}
