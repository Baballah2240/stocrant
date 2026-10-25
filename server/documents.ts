import { z } from "zod";
import type { AuthenticatedUser } from "./auth.js";
import { accountScopeActive, publicUser } from "./auth.js";
import { can, companyIdsFor, effectiveLocationIds, hasLocationRestriction, isMainManager, ownRecordsRequired, permissionsFor } from "./permissions.js";
import { getCollection, getStore, nextCollectionId, saveStore, transaction } from "./storage.js";
import { audit, requiresApproval } from "./workspace.js";
import { createNotification } from "./notifications.js";
import { COMPANY_DOCUMENT_TYPES, documentExpiry, EMPLOYEE_DOCUMENT_TYPES, validDate } from "./document-model.js";
import { storedFileExists } from "./document-files.js";
export type DocRow = Record<string, unknown> & { id: string };
export const documentRows = (name = "documents") => getCollection(name) as DocRow[];
export interface DocumentMutation { pending: boolean; item?: DocRow; request?: DocRow }
interface ApprovalContext { approver: AuthenticatedUser; requestId: string }
function queueDocumentChange(user: AuthenticatedUser, action: "create" | "edit" | "delete", payload: Record<string, unknown>, organizationId: unknown, targetId?: string): DocumentMutation {
  const existing = documentRows("approvalRequests").find(request => request.collection === "documents" && request.requestedBy === user.id && request.status === "pending" && ((payload.clientRequestId && (request.payload as Record<string, unknown>)?.clientRequestId === payload.clientRequestId) || (request.targetId === targetId && request.action === action && JSON.stringify(request.payload) === JSON.stringify(payload))));
  if (existing) return { pending: true, request: existing };
  const employee = documentRows("employees").find(employee => employee.id === payload.employeeId);
  const current = targetId ? documentRows().find(document => document.id === targetId) : undefined;
  const request: DocRow = { id: nextCollectionId("approvalRequests"), collection: "documents", section: "hr", action, status: "pending", targetId, organizationId, employeeId: payload.employeeId || current?.employeeId, locationId: employee?.locationId || current?.locationId, payload, requestedBy: user.id, requestedByName: user.name, requestedAt: new Date().toISOString() };
  const data = getStore(); data.collections.approvalRequests = [...documentRows("approvalRequests"), request];
  if (payload.fileId) data.collections.documentFiles = documentRows("documentFiles").map(file => file.id === payload.fileId ? { ...file, approvalId: request.id } : file);
  saveStore(data); audit(user, "documents.approval-requested", { collection: "documents", targetId, organizationId, approvalRequestId: request.id });
  for (const account of documentRows("accessUsers").filter(account => account.roleId === "role-main-manager" && account.status === "active" && account.id !== user.id)) createNotification({ userId: account.id, user: String(account.name), type: "pending_approval", severity: "info", message: "An HR document change requires approval.", target: request.id });
  return { pending: true, request };
}
export function canReviewDocumentRequest(user: AuthenticatedUser, request: DocRow) {
  return request.collection === "documents" && managesDocuments(user) && documentCompanyScope(user, request.organizationId, request.employeeId) && (request.requestedBy === user.id || can(user, "approvals", "view"));
}
export function documentError(message: string, statusCode = 400): never { throw Object.assign(new Error(message), { statusCode }); }
export function managesDocuments(user: AuthenticatedUser, action: "view" | "create" | "edit" | "delete" = "view") {
  if (isMainManager(user)) return true;
  if (ownRecordsRequired(user)) return false;
  if (action !== "view") return can(user, "hr", action);
  return can(user, "hr", "view") && ((["create", "edit", "delete"] as const).some(action => can(user, "hr", action)) || permissionsFor(user).includes("hr.personal.view"));
}
export function documentCompanyScope(user: AuthenticatedUser, companyId: unknown, employeeId?: unknown) {
  if (isMainManager(user)) return true;
  if (!companyIdsFor(user).includes(String(companyId))) return false;
  const company = documentRows("companies").find(row => row.id === companyId);
  if (!company || company.status === "inactive" || !documentRows("organizations").some(org => org.id === company.parentOrganizationId && org.status === "active")) return false;
  const locations = effectiveLocationIds(user);
  if (hasLocationRestriction(user) && !locations.length) return false;
  if (employeeId && locations.length) { const employee = documentRows("employees").find(row => row.id === employeeId); if (!employee || !locations.includes(String(employee.locationId ?? employee.storeId))) return false; }
  return true;
}
export function canReadDocument(user: AuthenticatedUser, row: Record<string, unknown>) {
  if (isMainManager(user)) return true;
  if(row.contractId&&user.employeeId!==row.employeeId&&!["role-hr-manager","role-company-manager","role-organization-admin"].includes(user.roleId))return false;
  if (!can(user, "hr", "view") || !documentCompanyScope(user, row.organizationId ?? row.companyId, row.category === "employee" ? row.employeeId : undefined)) return false;
  if (managesDocuments(user)) return true;
  if (row.lifecycle === "archived") return false;
  if (row.category === "company") return row.visibility === "company";
  if (row.visibility !== "employee" || !row.employeeId) return false;
  const employee = documentRows("employees").find(employee => employee.id === row.employeeId);
  return Boolean(employee && (employee.id === user.employeeId || (typeof employee.email === "string" && employee.email.toLowerCase() === user.email.toLowerCase())));
}
export function safeDocument(user: AuthenticatedUser, row: DocRow): DocRow {
  const file = documentRows("documentFiles").find(file => file.id === row.fileId);
  const employee = documentRows("employees").find(employee => employee.id === row.employeeId);
  const company = documentRows("companies").find(company => company.id === row.organizationId);
  const { revisions: _revisions, clientRequestId: _key, approvedRequestId: _approvedId, approvalRequestIds: _approvalIds, ...safe } = row;
  return { ...safe, employee: employee?.name ?? row.employee ?? "", companyName: company?.name ?? "", expiryStatus: documentExpiry(row), version: Number(row.version || 1), ...(file ? { attachment: { id: file.id, name: file.name, mime: file.mime, size: file.size, extension: file.extension } } : {}), ...(managesDocuments(user) ? { revisions: Array.isArray(row.revisions) ? row.revisions : [] } : {}) };
}
const optionalDate = z.string().refine(value => !value || validDate(value), "Choose a valid date.").default("");
const documentSchema = z.object({
  category: z.enum(["employee", "company"]), organizationId: z.string().min(1), employeeId: z.string().default(""),
  type: z.string().min(1).max(80), title: z.string().trim().min(2, "Enter a document title.").max(200),
  documentNumber: z.string().trim().max(120).default(""), issuedOn: optionalDate, expiresOn: optionalDate,
  issuingAuthority: z.string().trim().max(200).default(""), notes: z.string().trim().max(4000).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  fileId: z.string().uuid().optional().or(z.literal("")), fileUrl: z.string().max(2000).default(""),
  visibility: z.enum(["hr", "employee", "company"]).default("hr"), warningDays: z.coerce.number().int().min(1).max(365).default(30),
  version: z.number().int().positive().optional(), clientRequestId: z.string().uuid().optional(),
}).strict();

export function saveDocument(user: AuthenticatedUser, input: unknown, id?: string, approval?: ApprovalContext): DocumentMutation {
  return transaction(() => {
    const action = id ? "edit" : "create";
    if (!managesDocuments(user, action)) documentError("You do not have permission to manage documents.", 403);
    if (approval && (!can(approval.approver, "approvals", "approve") || !managesDocuments(approval.approver, action))) documentError("You do not have permission to approve this document change.", 403);
    const current = id ? documentRows().find(row => row.id === id) : undefined;
    if (id && (!current || !canReadDocument(user, current))) documentError("Document not found.", 404);
    if (current?.lifecycle === "archived") documentError("Restore the document before editing it.", 409);
    const parsed = documentSchema.safeParse(input);
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] || "");
      const messages: Record<string, string> = { title: "Enter a document title between 2 and 200 characters.", organizationId: "Choose a company.", employeeId: "Choose an employee from the selected company.", issuedOn: "Choose a valid document date.", expiresOn: "Choose a valid document date.", warningDays: "Choose a warning period between 1 and 365 days.", documentNumber: "Document references must not exceed 120 characters.", tags: "Use up to 20 tags with no more than 40 characters each.", fileId: "Upload a valid attachment.", fileUrl: "Use a valid HTTPS external document link without credentials." };
      documentError(messages[field] || "Review the document fields and try again.");
    }
    const values = parsed.data;
    if(values.type==="employment-contract"||current?.type==="employment-contract")documentError("Use HR contract management to prepare and approve contracts.",403);
    if(values.fileId&&documentRows("documentFiles").some(file=>file.id===values.fileId&&file.contractOnly))documentError("Contract PDFs must be managed through HR contract management.",403);
    if (current && values.version !== Number(current.version || 1)) documentError("This document changed. Reload it before saving.", 409);
    const company = documentRows("companies").find(company => company.id === values.organizationId);
    if (!company || company.status === "inactive" || !documentRows("organizations").some(org => org.id === company.parentOrganizationId && org.status === "active") || !documentCompanyScope(user, company.id, values.employeeId)) documentError("Choose an active company within your access.", 403);
    const employee = values.category === "employee" ? documentRows("employees").find(row => row.id === values.employeeId && (row.organizationId ?? row.companyId) === company.id) : undefined;
    if (values.category === "employee" && !employee) documentError("Choose an employee from the selected company.");
    if (values.category === "employee" && values.visibility === "company") documentError("Employee documents cannot be shared with the whole company.");
    if (values.category === "company" && values.visibility === "employee") documentError("Choose company-wide or HR-only visibility for company files.");
    const types: readonly string[] = values.category === "employee" ? EMPLOYEE_DOCUMENT_TYPES : COMPANY_DOCUMENT_TYPES;
    if (!types.includes(values.type) && values.type !== current?.type) documentError("Choose a valid document type.");
    if (values.issuedOn && values.expiresOn && values.expiresOn < values.issuedOn) documentError("Expiry date must be on or after issue date.");
    if (values.fileUrl) { try { const url = new URL(values.fileUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); } catch { documentError("Use a valid HTTPS external document link without credentials."); } }
    if (current && (current.organizationId !== values.organizationId || String(current.employeeId || "") !== String(employee?.id || "")) && (current.fileId || (Array.isArray(current.revisions) && current.revisions.length))) documentError("A document with attachment history cannot be reassigned. Archive it and upload a new document.");
    const retry = !id && values.clientRequestId ? documentRows().find(row => row.createdBy === user.id && row.clientRequestId === values.clientRequestId) : undefined;
    if (retry) { if (!canReadDocument(user, retry)) documentError("Document not found.", 404); return { pending: false, item: retry }; }
    const pendingRetry = !id && values.clientRequestId && !approval ? documentRows("approvalRequests").find(request => request.collection === "documents" && request.status === "pending" && request.requestedBy === user.id && (request.payload as Record<string, unknown>)?.clientRequestId === values.clientRequestId) : undefined;
    if (pendingRetry) return { pending: true, request: pendingRetry };
    if (!current && !values.fileId && !values.fileUrl) documentError("Upload a document or provide an authorized external link.");
    if (values.documentNumber && documentRows().some(row => row.id !== id && row.lifecycle !== "archived" && row.organizationId === company.id && String(row.employeeId || "") === String(employee?.id || "") && row.type === values.type && String(row.documentNumber ?? "").toLowerCase() === values.documentNumber.toLowerCase())) documentError("This document reference already exists for the selected employee or company.", 409);
    const file = values.fileId ? documentRows("documentFiles").find(file => file.id === values.fileId) : undefined;
    if (file?.approvalId && file.approvalId !== approval?.requestId && documentRows("approvalRequests").some(request => request.id === file.approvalId && request.status === "pending")) documentError("This upload is awaiting approval and cannot be reused.", 409);
    if (values.fileId && (!file || !storedFileExists(file.id) || (file.id !== current?.fileId && (file.createdBy !== user.id || file.organizationId !== company.id || file.documentId)))) documentError("Upload a new attachment for this document.");
    if (!approval && requiresApproval("hr", action, user)) return queueDocumentChange(user, action, values, company.id, id);
    const now = new Date().toISOString();
    const { clientRequestId: _requestKey, ...metadata } = values;
    const item: DocRow = { ...current, ...metadata, id: id || nextCollectionId("documents"), employeeId: employee?.id || "", employee: employee?.name || "", locationId: employee?.locationId || "", lifecycle: "active", documentSchemaVersion: 1, version: current ? Number(current.version || 1) + 1 : 1, createdAt: current?.createdAt || now, createdBy: current?.createdBy || user.id, updatedAt: now, updatedBy: user.id, updatedByName: user.name, ...(values.clientRequestId && !current ? { clientRequestId: values.clientRequestId } : {}), revisions: [...(Array.isArray(current?.revisions) ? current.revisions : []), ...(current ? [{ version: Number(current.version || 1), fileId: current.fileId || "", updatedAt: current.updatedAt || current.createdAt, replacedAt: now, replacedBy: user.id }] : [])] };
    const data = getStore();
    if (approval) { item.approvedRequestId = approval.requestId; item.approvalRequestIds = [...new Set([...(Array.isArray(current?.approvalRequestIds) ? current.approvalRequestIds : []), ...(current?.approvedRequestId ? [current.approvedRequestId] : []), approval.requestId])]; }
    data.collections.documents = current ? documentRows().map(row => row.id === id ? item : row) : [...documentRows(), item];
    if (file) data.collections.documentFiles = documentRows("documentFiles").map(row => row.id === file.id ? { ...row, documentId: item.id, approvalId: undefined, linkedAt: now } : row);
    saveStore(data);
    audit(user, current ? current.fileId !== values.fileId ? "documents.attachment-replaced" : "documents.updated" : "documents.created", { collection: "documents", targetId: item.id, organizationId: company.id, changedFields: Object.keys(metadata).filter(key => JSON.stringify(current?.[key]) !== JSON.stringify(item[key])) });
    if (current && current.visibility !== values.visibility) audit(user, "documents.visibility-changed", { collection: "documents", targetId: item.id, organizationId: company.id });
    generateDocumentExpiryAlerts();
    return { pending: false, item };
  });
}
export function setDocumentArchive(user: AuthenticatedUser, id: string, archive: boolean, version: number, approval?: ApprovalContext): DocumentMutation {
  return transaction(() => {
    if (!managesDocuments(user, archive ? "delete" : "edit")) documentError("You do not have permission to archive or restore documents.", 403);
    const current = documentRows().find(row => row.id === id);
    if (!current || !canReadDocument(user, current)) documentError("Document not found.", 404);
    if(current.type==="employment-contract")documentError("Use HR contract management to prepare and approve contracts.",403);
    if (Number(current.version || 1) !== version) documentError("This document changed. Reload it before saving.", 409);
    const action = archive ? "delete" : "edit";
    if (approval && (!can(approval.approver, "approvals", "approve") || !managesDocuments(approval.approver, action))) documentError("You do not have permission to approve this document change.", 403);
    if (!approval && requiresApproval("hr", action, user)) return queueDocumentChange(user, action, { documentArchive: archive, version }, current.organizationId, id);
    const item = { ...current, lifecycle: archive ? "archived" : "active", version: version + 1, updatedAt: new Date().toISOString(), updatedBy: user.id, updatedByName: user.name };
    const data = getStore(); data.collections.documents = documentRows().map(row => row.id === id ? item : row); saveStore(data);
    audit(user, archive ? "documents.archived" : "documents.restored", { collection: "documents", targetId: id });
    return { pending: false, item };
  });
}

export function applyDocumentApproval(approver: AuthenticatedUser, request: DocRow) {
  const account = documentRows("accessUsers").find(account => account.id === request.requestedBy && account.status === "active" && accountScopeActive(account));
  if (!account) documentError("The requester no longer has active document access.", 403);
  const requester = publicUser(account as Parameters<typeof publicUser>[0]);
  if (!documentCompanyScope(approver, request.organizationId)) documentError("You do not have permission to approve this company.", 403);
  const payload = request.payload as Record<string, unknown>, context = { approver, requestId: request.id };
  return typeof payload.documentArchive === "boolean" ? setDocumentArchive(requester, String(request.targetId), payload.documentArchive, Number(payload.version), context) : saveDocument(requester, payload, request.targetId ? String(request.targetId) : undefined, context);
}

export function generateDocumentExpiryAlerts(now = new Date()) {
  return transaction(() => {
    let count = 0;
    const accounts = documentRows("accessUsers").filter(account => account.status === "active" && accountScopeActive(account));
    const events = documentRows("documentExpiryEvents"), keys = new Set(events.map(event => event.key));
    for (const document of documentRows()) {
      const status = documentExpiry(document, new Intl.DateTimeFormat("en-CA", { timeZone: process.env.STOCRANT_TIME_ZONE || "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(now));
      if (!["expired", "expiring"].includes(status)) continue;
      for (const account of accounts) {
        const user = publicUser(account as Parameters<typeof publicUser>[0]);
        if (!canReadDocument(user, document)) continue;
        const key = `${document.id}:${document.expiresOn}:${status}:${account.id}`;
        if (keys.has(key)) continue;
        // Keep sensitive titles, document numbers and employee names out of notification lists.
        createNotification({ userId: user.id, user: user.name, type: "document_expiry", severity: status === "expired" ? "warning" : "info", message: status === "expired" ? "An HR document has expired. Open Documents to review." : "An HR document is approaching its expiry date. Open Documents to review.", target: `document:${document.id}` });
        events.push({ id: nextCollectionId("documentExpiryEvents"), key, documentId: document.id, userId: user.id, createdAt: now.toISOString() }); keys.add(key); count++;
      }
    }
    if (count) { const data = getStore(); data.collections.documentExpiryEvents = events; saveStore(data); }
    return count;
  });
}
