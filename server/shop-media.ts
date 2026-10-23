import { z } from "zod";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { getCollection, getDataDirectory } from "./storage.js";

export const PHOTO_LIMIT = 5 * 1024 * 1024;
export const photoUrl = z.union([z.literal(""), z.string().url().max(2000).refine(v => v.startsWith("https://")), z.string().regex(/^\/api\/shop-images\/[a-f0-9-]{36}$/)]);
export const photoList = z.array(photoUrl.refine(v => Boolean(v))).max(6).refine(v => new Set(v).size === v.length);
export const mediaRows = () => getCollection("shopProductImages") as Record<string, any>[];
export function photoPath(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid photo reference.");
  return join(getDataDirectory(), "shop-images", `${id}.bin`);
}
export function productPhotos(product: Record<string, any>): string[] {
  return Array.isArray(product.images) ? product.images : product.image ? [product.image] : [];
}
export function validatePhotos(companyId: string, image: string, images?: string[]) {
  const list = images ?? (image ? [image] : []);
  if (list.length > 6 || (images && (image || "") !== (list[0] || ""))) throw new Error("Choose up to six photos with the cover photo first.");
  for (const url of list) if (url.startsWith("/api/shop-images/")) {
    const file = mediaRows().find(row => url === `/api/shop-images/${row.id}` && row.organizationId === companyId);
    if (!file || !existsSync(photoPath(file.id))) throw new Error("Choose photos uploaded for this company.");
  }
  return list;
}
export function photoLinked(id: string) {
  return (getCollection("shopProducts") as Record<string, any>[]).some(p => productPhotos(p).includes(`/api/shop-images/${id}`));
}
export function photoType(bytes: Buffer): string {
  if (!bytes.length || bytes.length > PHOTO_LIMIT) throw Object.assign(new Error("Choose a photo up to 5 MB."), { statusCode: 413 });
  if (bytes.length >= 45 && bytes.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a", "hex")) && bytes.subarray(12,16).toString() === "IHDR" && bytes.subarray(-8,-4).toString() === "IEND") {
    const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
    if (w && h && w * h <= 40000000) return "image/png";
  }
  if (bytes.length >= 20 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) return "image/jpeg";
  if (bytes.length >= 30 && bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP" && bytes.readUInt32LE(4) === bytes.length - 8 && ["VP8 ","VP8L","VP8X"].includes(bytes.toString("ascii",12,16))) return "image/webp";
  throw new Error("Choose a valid JPEG, PNG or WebP photo.");
}
