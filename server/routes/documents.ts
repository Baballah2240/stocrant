import express, { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticatedUser } from "../auth.js";
import { can, isWithinScope } from "../permissions.js";
import { getStore, saveStore, transaction } from "../storage.js";
import { audit } from "../workspace.js";
import { COMPANY_DOCUMENT_TYPES, EMPLOYEE_DOCUMENT_TYPES } from "../document-model.js";
import { discardDraftFile, documentUploadConfig, filePath, persistDocumentFile, removeDraftFile, storedFileExists, validateDocumentFile } from "../document-files.js";
import { canReadDocument, canReviewDocumentRequest, documentCompanyScope, documentError, documentRows, generateDocumentExpiryAlerts, managesDocuments, safeDocument, saveDocument, setDocumentArchive, type DocumentMutation } from "../documents.js";
const router = Router();
function mutationResponse(req: Request, result: DocumentMutation) { return { ...result, ...(result.item ? { item: safeDocument(req.auth!, result.item) } : {}) }; }
function failure(res: Response, error: unknown) {
  if (typeof (error as { code?: string })?.code === "string" && /^(EACCES|EPERM|ENOSPC|EIO|ENOENT|EROFS)$/.test((error as { code: string }).code)) return res.status(503).json({ error: "Document storage is temporarily unavailable. Contact the Main Admin." });
  return res.status((error as { statusCode?: number })?.statusCode || 400).json({ error: error instanceof Error ? error.message : "Document operation failed." });
}
router.get("/config", (req, res) => {
  if (!can(req.auth, "hr", "view")) return res.status(403).json({ error: "You do not have permission to view documents." });
  res.json({ ...documentUploadConfig(), employeeTypes: EMPLOYEE_DOCUMENT_TYPES, companyTypes: COMPANY_DOCUMENT_TYPES });
});
router.get("/requests/:id", (req, res) => {
  const request = documentRows("approvalRequests").find(request => request.id === req.params.id);
  if (!request || !canReviewDocumentRequest(req.auth!, request)) return res.status(404).json({ error: "Document request not found." });
  const current = documentRows().find(document => document.id === request.targetId || document.approvedRequestId === request.id || (Array.isArray(document.approvalRequestIds) && document.approvalRequestIds.includes(request.id)));
  const metadata = { ...current, ...(request.payload as Record<string, unknown>) };
  const employee = documentRows("employees").find(employee => employee.id === metadata.employeeId);
  const file = documentRows("documentFiles").find(file => file.id === metadata.fileId);
  res.json({ request: { id: request.id, action: request.action, status: request.status, requestedByName: request.requestedByName, requestedAt: request.requestedAt }, metadata: { ...metadata, employee: employee?.name || "", companyName: documentRows("companies").find(company => company.id === request.organizationId)?.name || "" }, ...(file ? { attachment: { id: file.id, name: file.name, mime: file.mime, size: file.size, extension: file.extension } } : {}), documentId: current?.id || file?.documentId, canDecide: isWithinScope(req.auth!, request) && request.status === "pending" && request.requestedBy !== req.auth!.id && can(req.auth, "approvals", "approve") && managesDocuments(req.auth!, request.action as "create") });
});
router.get("/requests/:id/file", (req, res) => {
  try {
    const request = documentRows("approvalRequests").find(request => request.id === req.params.id);
    if (!request || !canReviewDocumentRequest(req.auth!, request)) documentError("Document request not found.", 404);
    const current = documentRows().find(document => document.id === request.targetId || document.approvedRequestId === request.id || (Array.isArray(document.approvalRequestIds) && document.approvalRequestIds.includes(request.id)));
    const metadata = { ...current, ...(request.payload as Record<string, unknown>) };
    const file = documentRows("documentFiles").find(file => file.id === metadata.fileId && file.organizationId === request.organizationId);
    if (!file || !storedFileExists(file.id)) documentError("Attachment not found.", 404);
    res.setHeader("Content-Type", String(file.mime)); res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(String(file.name))}`); res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    audit(req.auth, "documents.approval-attachment-downloaded", { collection: "approvalRequests", targetId: request.id, organizationId: request.organizationId });
    res.sendFile(filePath(file.id), error => { if (error && !res.headersSent) res.status(404).json({ error: "Attachment could not be read." }); });
  } catch (error) { failure(res, error); }
});
function uploadAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || (!managesDocuments(req.auth, "create") && !managesDocuments(req.auth, "edit")) || !documentCompanyScope(req.auth, req.get("X-Document-Company"))) return res.status(403).json({ error: "You do not have permission to upload documents for this company." });
  const company = documentRows("companies").find(company => company.id === req.get("X-Document-Company"));
  if (!company || company.status === "inactive" || !documentRows("organizations").some(org => org.id === company.parentOrganizationId && org.status === "active")) return res.status(400).json({ error: "Choose an active company before uploading." });
  if (documentRows("documentFiles").filter(file => file.createdBy === req.auth!.id && !file.documentId).length >= 20) return res.status(429).json({ error: "Too many unattached uploads. Remove unused uploads before adding another file." });
  next();
}
router.post("/uploads", uploadAccess, (req, res, next) => express.raw({ type: "application/octet-stream", limit: documentUploadConfig().maxBytes })(req, res, next), (req, res) => {
  let fileId: string | undefined;
  try {
    req.auth = authenticatedUser(req);
    if (!req.auth || (!managesDocuments(req.auth, "create") && !managesDocuments(req.auth, "edit")) || !documentCompanyScope(req.auth, req.get("X-Document-Company"))) documentError("Your document permissions changed. Sign in again.", 403);
    if (!Buffer.isBuffer(req.body)) documentError("Send file bytes as application/octet-stream.");
    const name = decodeURIComponent(req.get("X-File-Name") || "");
    const metadata = validateDocumentFile(name, req.body);
    fileId = persistDocumentFile(req.body);
    const item = { id: fileId, ...metadata, organizationId: req.get("X-Document-Company"), createdBy: req.auth.id, createdAt: new Date().toISOString() };
    transaction(() => { const data = getStore(); data.collections.documentFiles = [...documentRows("documentFiles"), item]; saveStore(data); audit(req.auth, "documents.uploaded", { targetId: fileId, organizationId: item.organizationId, size: item.size }); });
    res.status(201).json({ file: { id: item.id, name: item.name, size: item.size, mime: item.mime, extension: item.extension } });
  } catch (error) { if (fileId) removeDraftFile(fileId); failure(res, error); }
});
router.delete("/uploads/:id", (req, res) => {
  try {
    const file = documentRows("documentFiles").find(file => file.id === req.params.id && file.createdBy === req.auth!.id);
    if (!file || !documentCompanyScope(req.auth!, file.organizationId)) documentError("Upload not found.", 404);
    if (!managesDocuments(req.auth!, "create") && !managesDocuments(req.auth!, "edit")) documentError("You do not have permission to remove uploads.", 403);
    if (file.documentId || (file.approvalId && documentRows("approvalRequests").some(request => request.id === file.approvalId && request.status === "pending")) || documentRows().some(doc => doc.fileId === file.id || (Array.isArray(doc.revisions) && doc.revisions.some(revision => revision.fileId === file.id)))) documentError("This attachment is retained with a document and cannot be deleted.", 409);
    discardDraftFile(file.id, () => transaction(() => {
      const data = getStore(); data.collections.documentFiles = documentRows("documentFiles").filter(row => row.id !== file.id); saveStore(data);
      audit(req.auth, "documents.draft-removed", { organizationId: file.organizationId, targetId: file.id });
    }));
    res.json({ ok: true });
  } catch (error) { failure(res, error); }
});
router.get("/", (req, res) => {
  if (!can(req.auth, "hr", "view")) return res.status(403).json({ error: "You do not have permission to view documents." });
  generateDocumentExpiryAlerts();
  let items = documentRows().filter(row => canReadDocument(req.auth!, row));
  if (req.query.employee) items = items.filter(row => row.employeeId === req.query.employee);
  if (req.query.company) items = items.filter(row => row.organizationId === req.query.company);
  const summary = { total: items.filter(row => row.lifecycle !== "archived").length, expired: 0, expiring: 0 };
  const safe = items.map(row => safeDocument(req.auth!, row));
  summary.expired = safe.filter(row => row.expiryStatus === "expired").length;
  summary.expiring = safe.filter(row => row.expiryStatus === "expiring").length;
  res.json({ items: safe, summary, pendingChanges: documentRows("approvalRequests").filter(request => request.status === "pending" && canReviewDocumentRequest(req.auth!, request)).map(request => ({ id: request.id, title: (request.payload as Record<string, unknown>)?.title || documentRows().find(document => document.id === request.targetId)?.title || "Document", requestedByName: request.requestedByName, action: request.action })), drafts: documentRows("documentFiles").filter(file => !file.documentId && !(file.approvalId && documentRows("approvalRequests").some(request => request.id === file.approvalId && request.status === "pending")) && file.createdBy === req.auth!.id && documentCompanyScope(req.auth!, file.organizationId)).map(file => ({ id: file.id, name: file.name, mime: file.mime, size: file.size, extension: file.extension, organizationId: file.organizationId })), organizations: documentRows("organizations").filter(org => documentRows("companies").some(company => company.parentOrganizationId === org.id && documentCompanyScope(req.auth!, company.id))).map(org => ({ id: org.id, name: org.name })), permissions: { create: managesDocuments(req.auth!, "create"), edit: managesDocuments(req.auth!, "edit"), archive: managesDocuments(req.auth!, "delete") }, companies: documentRows("companies").filter(company => documentCompanyScope(req.auth!, company.id)).map(company => ({ id: company.id, name: company.name, parentOrganizationId: company.parentOrganizationId, status: company.status })), employees: managesDocuments(req.auth!) ? documentRows("employees").filter(employee => documentCompanyScope(req.auth!, employee.organizationId ?? employee.companyId, employee.id)).map(employee => ({ id: employee.id, name: employee.name, employeeCode: employee.employeeCode, organizationId: employee.organizationId ?? employee.companyId })) : [] });
});
router.post("/", (req, res) => { try { const result = saveDocument(req.auth!, req.body); res.status(result.pending ? 202 : 201).json(mutationResponse(req, result)); } catch (error) { failure(res, error); } });
router.get("/:id/file", (req, res) => {
  try {
    const document = documentRows().find(row => row.id === req.params.id);
    if (!document || !canReadDocument(req.auth!, document)) documentError("Document not found.", 404);
    const id = typeof req.query.versionFile === "string" ? req.query.versionFile : String(document.fileId || "");
    if (id !== document.fileId && (!managesDocuments(req.auth!) || !Array.isArray(document.revisions) || !document.revisions.some(revision => revision.fileId === id))) documentError("Attachment not found.", 404);
    const file = documentRows("documentFiles").find(row => row.id === id && row.documentId === document.id);
    if (!file || !storedFileExists(file.id)) documentError("Attachment not found.", 404);
    res.setHeader("Content-Type", String(file.mime));
    const inline = req.query.preview === "1" && ["application/pdf", "image/jpeg", "image/png"].includes(String(file.mime));
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(String(file.name)).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; frame-ancestors 'self'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    audit(req.auth, inline ? "documents.previewed" : "documents.downloaded", { collection: "documents", targetId: document.id, fileId: file.id });
    res.sendFile(filePath(file.id), error => { if (error && !res.headersSent) res.status(404).json({ error: "Attachment could not be read." }); });
  } catch (error) { failure(res, error); }
});
router.get("/:id", (req, res) => {
  const item = documentRows().find(row => row.id === req.params.id);
  if (!item || !canReadDocument(req.auth!, item)) return res.status(404).json({ error: "Document not found." });
  res.json({ item: safeDocument(req.auth!, item), permissions: { edit: managesDocuments(req.auth!, "edit"), archive: managesDocuments(req.auth!, "delete") } });
});
router.patch("/:id", (req, res) => { try { const result = saveDocument(req.auth!, req.body, String(req.params.id)); res.status(result.pending ? 202 : 200).json(mutationResponse(req, result)); } catch (error) { failure(res, error); } });
router.post("/:id/archive", (req, res) => {
  const parsed = z.object({ archived: z.boolean(), version: z.number().int().positive() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose an archive action and document version." });
  try { const result = setDocumentArchive(req.auth!, String(req.params.id), parsed.data.archived, parsed.data.version); res.status(result.pending ? 202 : 200).json(mutationResponse(req, result)); } catch (error) { failure(res, error); }
});
router.delete("/:id", (_req, res) => res.status(409).json({ error: "Documents must be archived to preserve HR history. Use the archive action." }));
router.use((_req, res) => res.status(404).json({ error: "Document operation not found." }));
export default router;
