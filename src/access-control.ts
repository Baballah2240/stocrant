import type { AuthUser } from "./types";
export function hasPermission(user: AuthUser | null | undefined, section: string, action = "view") {
  return Boolean(user && (user.permissions.includes("*") || user.permissions.includes(`${section}.*`) || user.permissions.includes(`${section}.${action}`)));
}
export function sectionForModule(module: string | undefined) { return module === "organization" ? "organizations" : module === "stores" ? "operations" : module === "warehouse" ? "inventory" : module === "admin" ? "access" : "hr"; }
