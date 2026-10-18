import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDirectory } from "./storage.js";

const MIME: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
export function documentUploadConfig() {
  const requested = Number(process.env.STOCRANT_DOCUMENT_MAX_BYTES || 10 * 1024 * 1024);
  const maxBytes = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 25 * 1024 * 1024) : 10 * 1024 * 1024;
  const extensions = (process.env.STOCRANT_DOCUMENT_TYPES || Object.keys(MIME).join(",")).split(",").map(type => type.trim().toLowerCase().replace(/^\./, "")).filter(type => type in MIME);
  return { maxBytes, extensions, warningDays: Math.max(1, Math.min(365, Number(process.env.STOCRANT_DOCUMENT_WARNING_DAYS) || 30)) };
}
export function filePath(id: string): string {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid file reference.");
  return join(getDataDirectory(), "private-documents", `${id}.bin`);
}
function officeZip(buffer: Buffer, extension: string) {
  // Read the central directory only. Never extract or execute uploaded archives.
  let end = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65557); index--) if (buffer.readUInt32LE(index) === 0x06054b50) { end = index; break; }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) return false;
  const count = buffer.readUInt16LE(end + 10); let offset = buffer.readUInt32LE(end + 16), total = 0; const names = new Set<string>();
  if (!count || count > 1500) return false;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) return false;
    const flags = buffer.readUInt16LE(offset + 8), compressed = buffer.readUInt32LE(offset + 20), size = buffer.readUInt32LE(offset + 24), length = buffer.readUInt16LE(offset + 28), extra = buffer.readUInt16LE(offset + 30), comment = buffer.readUInt16LE(offset + 32), local = buffer.readUInt32LE(offset + 42);
    if (offset + 46 + length + extra + comment > end || local + 30 > offset || buffer.readUInt32LE(local) !== 0x04034b50 || flags & 1) return false;
    const name = buffer.subarray(offset + 46, offset + 46 + length).toString("utf8");
    if (name.includes("\\") || name.startsWith("/") || name.split("/").includes("..") || /vbaProject|\.(exe|js|html?|svg|bat|cmd|ps1)$/i.test(name) || names.has(name)) return false;
    names.add(name); total += size;
    if (total > 60 * 1024 * 1024 || (size > 1024 * 1024 && size > Math.max(1, compressed) * 200)) return false;
    offset += 46 + length + extra + comment;
  }
  return names.has("[Content_Types].xml") && names.has(extension === "docx" ? "word/document.xml" : "xl/workbook.xml");
}
export function validateDocumentFile(name: string, buffer: Buffer) {
  if (!name || name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(name) || name.includes("..")) throw new Error("Choose a safe filename without paths or control characters.");
  const extension = name.split(".").at(-1)?.toLowerCase() || "";
  const config = documentUploadConfig();
  if (!config.extensions.includes(extension)) throw new Error("This file type is not allowed.");
  if (!buffer.length || buffer.length > config.maxBytes) throw Object.assign(new Error("The file is empty or exceeds the upload size limit."), { statusCode: 413 });
  let valid = false;
  if (extension === "pdf") valid = buffer.subarray(0, 5).toString() === "%PDF-" && buffer.subarray(-2048).includes(Buffer.from("%%EOF"));
  if (extension === "png") valid = buffer.length >= 33 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.subarray(12, 16).toString() === "IHDR" && buffer.readUInt32BE(16) > 0 && buffer.readUInt32BE(20) > 0 && buffer.readUInt32BE(16) * buffer.readUInt32BE(20) <= 40000000;
  if (["jpg", "jpeg"].includes(extension)) valid = buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 && buffer.at(-2) === 255 && buffer.at(-1) === 217;
  if (["doc", "xls"].includes(extension)) valid = buffer.length >= 512 && buffer.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex")) && buffer.includes(Buffer.from(extension === "doc" ? "WordDocument" : "Workbook", "utf16le"));
  if (["docx", "xlsx"].includes(extension)) valid = officeZip(buffer, extension);
  if (!valid) throw new Error("File contents do not match the selected document format.");
  return { name, extension, mime: MIME[extension], size: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") };
}
export function persistDocumentFile(buffer: Buffer) {
  const id = randomUUID(), path = filePath(id);
  mkdirSync(join(getDataDirectory(), "private-documents"), { recursive: true, mode: 0o700 });
  writeFileSync(path + ".tmp", buffer, { flag: "wx", mode: 0o600 });
  try { renameSync(path + ".tmp", path); } catch (error) { rmSync(path + ".tmp", { force: true }); throw error; }
  return id;
}
export function removeDraftFile(id: string) { rmSync(filePath(id), { force: true }); }
export function discardDraftFile(id: string, commit: () => void) {
  const path = filePath(id), staged = path + ".pending-delete";
  const present = existsSync(path);
  if (present) renameSync(path, staged);
  try { commit(); } catch (error) { if (present) renameSync(staged, path); throw error; }
  if (present) rmSync(staged, { force: true });
}
export function storedFileExists(id: string) { return existsSync(filePath(id)); }
