import { isNativeApp, mobileSession, request, serverUrl } from "./api";
export interface DocumentAttachment { id: string; name: string; size: number; mime: string; extension: string }
export interface HrDocument {
  id: string; category: "employee" | "company"; organizationId: string; companyName?: string; employeeId: string; employee: string;
  type: string; title: string; documentNumber: string; issuedOn: string; expiresOn: string; issuingAuthority: string;
  notes: string; tags: string[]; fileId?: string; fileUrl: string; visibility: "hr" | "employee" | "company";
  warningDays: number; lifecycle: "active" | "archived"; expiryStatus: string; createdAt: string; updatedAt: string; updatedByName?: string;
  version: number; attachment?: DocumentAttachment; revisions?: { version: number; fileId?: string; replacedAt: string; replacedBy: string }[];
}
export interface DocumentsResponse {
  pendingChanges: { id: string; title: string; requestedByName: string; action: string }[];
  drafts: (DocumentAttachment & { organizationId: string })[];
  organizations: { id: string; name: string }[];
  items: HrDocument[]; summary: { total: number; expiring: number; expired: number }; permissions: { create: boolean; edit: boolean; archive: boolean };
  companies: { id: string; name: string; parentOrganizationId: string; status: string }[];
  employees: { id: string; name: string; employeeCode: string; organizationId: string }[];
}
export interface DocumentConfig { extensions: string[]; maxBytes: number; warningDays: number; employeeTypes: string[]; companyTypes: string[] }
export interface DocumentReview { request: { id: string; status: string; action: string; requestedByName: string; requestedAt: string }; metadata: Partial<HrDocument> & { documentArchive?: boolean }; attachment?: DocumentAttachment; canDecide: boolean; documentId?: string }
const base = "/workspace/documents";
export const documentApi = {
  review: (id: string) => request<DocumentReview>(`${base}/requests/${encodeURIComponent(id)}`),
  decide: (id: string, decision: "approve" | "reject", note: string) => request(`/workspace/approvals/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ decision, note }) }),
  async reviewFile(id: string) {
    const headers = new Headers(); if (isNativeApp()) { const token = mobileSession.current(); if (token) headers.set("Authorization", `Bearer ${token}`); }
    const response = await fetch(`${serverUrl.current()}/api${base}/requests/${encodeURIComponent(id)}/file`, { headers, credentials: "include" });
    if (!response.ok) throw new Error("Could not download the attachment."); return response.blob();
  },
  list: (employee?: string) => request<DocumentsResponse>(base + (employee ? `?employee=${encodeURIComponent(employee)}` : "")),
  config: () => request<DocumentConfig>(base + "/config"),
  get: (id: string) => request<{ item: HrDocument; permissions: { edit: boolean; archive: boolean } }>(base + "/" + encodeURIComponent(id)),
  save: (input: unknown, id?: string) => request<{ pending: boolean; item?: HrDocument }>(base + (id ? "/" + encodeURIComponent(id) : ""), { method: id ? "PATCH" : "POST", body: JSON.stringify(input) }),
  archive: (item: HrDocument, archived: boolean) => request<{ pending: boolean; item?: HrDocument }>(`${base}/${encodeURIComponent(item.id)}/archive`, { method: "POST", body: JSON.stringify({ archived, version: item.version }) }),
  removeUpload: (id: string) => request<{ ok: boolean }>(`${base}/uploads/${encodeURIComponent(id)}`, { method: "DELETE" }),
  upload(file: File, companyId: string, progress: (value: number) => void, signal: AbortSignal): Promise<DocumentAttachment> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${serverUrl.current()}/api${base}/uploads`); xhr.withCredentials = true;
      xhr.setRequestHeader("Content-Type", "application/octet-stream"); xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name)); xhr.setRequestHeader("X-Document-Company", companyId);
      if (isNativeApp()) { xhr.setRequestHeader("X-STOCRANT-NATIVE", "1"); const token = mobileSession.current(); if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`); }
      const abort = () => xhr.abort(); signal.addEventListener("abort", abort, { once: true });
      const finish = () => signal.removeEventListener("abort", abort);
      xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.min(95, Math.round(event.loaded / event.total * 95))); };
      xhr.onload = () => { finish(); try { const result = JSON.parse(xhr.responseText); if (xhr.status < 200 || xhr.status >= 300) throw new Error(result.error || "Upload failed."); progress(100); resolve(result.file); } catch (error) { reject(error); } };
      xhr.onerror = () => { finish(); reject(new Error("Upload failed. Check your connection and try again.")); };
      xhr.onabort = () => { finish(); reject(new DOMException("Upload cancelled.", "AbortError")); };
      if (signal.aborted) { finish(); reject(new DOMException("Upload cancelled.", "AbortError")); return; }
      xhr.send(file);
    });
  },
  async file(item: HrDocument, preview = false, versionFile?: string) {
    const headers = new Headers();
    if (isNativeApp()) { const token = mobileSession.current(); if (token) headers.set("Authorization", `Bearer ${token}`); }
    const params = new URLSearchParams({ preview: preview ? "1" : "0", ...(versionFile ? { versionFile } : {}) });
    const response = await fetch(`${serverUrl.current()}/api${base}/${encodeURIComponent(item.id)}/file?${params}`, { headers, credentials: "include" });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Could not download the attachment."); }
    return response.blob();
  },
};
export const DOCUMENT_TYPES: Record<string, string> = { passport: "Passport", "national-id": "Qatar ID / National ID", "residence-permit": "Residence permit", "employment-contract": "Employment contract", "work-permit": "Work permit", "driving-license": "Driving license", "education-certificate": "Educational certificate", "training-certificate": "Training certificate", "medical-insurance": "Medical / insurance", "warning-letter": "Warning letter", "leave-document": "Leave document", policy: "Company policy", procedure: "HR procedure", form: "Internal form", license: "Company license", template: "Template", manual: "Manual", "official-letter": "Official letter", other: "Other", id: "National ID", visa: "Visa", certificate: "Certificate" };
export const DOCUMENT_STATUSES: Record<string, string> = { active: "Active", expiring: "Expiring soon", expired: "Expired", "no-expiry": "No expiry", archived: "Archived", unknown: "Date unavailable" };
