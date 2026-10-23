import { getCollection } from "./storage.js";
type Row = Record<string, unknown>;
export function protectOrganizationAdmin(account: Row, next?: Row) {
  for (const org of getCollection("organizations") as Row[]) {
    if (org.status !== "active" || org.mainAdminAccountId !== account.id) continue;
    if (!next || next.status !== "active" || next.roleId !== "role-organization-admin" || !Array.isArray(next.tenantOrganizationIds) || !next.tenantOrganizationIds.includes(org.id)) {
      throw Object.assign(new Error("Assign another organization main admin before changing this account."), { statusCode: 409 });
    }
  }
}
