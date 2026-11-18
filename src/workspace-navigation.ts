import type { AuthUser } from "./types";
import type { MobileIconName } from "./components/MobileIcon";

export interface WorkspaceNavEntry { to: string; label: string; section?: string; icon: MobileIconName; group: string; personalOnly?: boolean }
export const workspaceNavGroups: { id: string; label: string; icon: MobileIconName }[] = [
  { id: "workspace", label: "Workspace", icon: "home" },
  { id: "people", label: "People & HR", icon: "people" },
  { id: "operations", label: "Operations", icon: "work" },
  { id: "finance", label: "Finance", icon: "finance" },
  { id: "administration", label: "Administration", icon: "shield" },
];
const entries: WorkspaceNavEntry[] = [
  { to: "/", label: "Dashboard", icon: "home", group: "workspace" },
  { to: "/organizations", label: "Organizations", icon: "companies", section: "organizations", group: "workspace" },
  { to: "/locations", label: "Locations", icon: "locations", section: "locations", group: "workspace" },
  { to: "/hr", label: "Workforce & HR", icon: "people", section: "hr", group: "people" },
  { to: "/hr/custody", label: "Financial custody", icon: "payslip", section: "hr", group: "people" },
  { to: "/me/attendance", label: "My attendance", icon: "attendance", group: "people", personalOnly: true },
  { to: "/me/leave", label: "My leave requests", icon: "leave", group: "people", personalOnly: true },
  { to: "/operations", label: "Operations", icon: "work", section: "operations", group: "operations" },
  { to: "/warehouse", label: "Inventory", icon: "inventory", section: "inventory", group: "operations" },
  { to: "/shops", label: "Shops & orders", icon: "shop", section: "inventory", group: "operations" },
  { to: "/customer-service", label: "Customer Service", icon: "support", section: "customerService", group: "operations" },
  { to: "/finance", label: "Finance", icon: "finance", section: "finance", group: "finance" },
  { to: "/hr/payroll", label: "Payroll", icon: "payroll", section: "payroll", group: "finance" },
  { to: "/me/payroll", label: "My payslips", icon: "payslip", group: "finance" },
  { to: "/admin", label: "Access & Settings", icon: "settings", section: "access", group: "administration" },
  { to: "/security", label: "App lock", icon: "lock", group: "administration" },
];
export const aboutNavItem: WorkspaceNavEntry = { to: "/about", label: "About", icon: "info", group: "about" };
export function workspaceNavigationFor(user: Pick<AuthUser, "roleId" | "permissions"> | null | undefined) {
  const main = user?.roleId === "role-main-manager";
  const can = (section?: string) => !section || main || Boolean(user?.permissions.some(permission => ["*", section + ".*", section + ".view"].includes(permission)));
  return entries.filter(item => (!item.personalOnly || !main) && can(item.section) && (item.to !== "/shops" || can("operations")));
}
export function workspaceEntryActive(item: WorkspaceNavEntry, path: string): boolean {
  if (item.to === "/") return path === "/" || path === "/workspace";
  if (item.to === "/hr") return (path === "/hr" || path.startsWith("/hr/")) && !path.startsWith("/hr/payroll") && !path.startsWith("/hr/custody") && !path.startsWith("/hr/employeeCustody");
  if (item.to === "/hr/custody") return path.startsWith("/hr/custody") || path.startsWith("/hr/employeeCustody");
  if (item.to === "/organizations") return path === "/organizations" || path.startsWith("/organizations/") || path.startsWith("/organization/");
  if (item.to === "/warehouse") return ["/inventory", "/warehouse"].some(prefix => path === prefix || path.startsWith(prefix + "/"));
  if (item.to === "/locations") return ["/locations", "/stores", "/places", "/people"].includes(path) || path.startsWith("/locations/");
  if (item.to === "/operations") return path === "/store" || path.startsWith("/stores/") || path === "/operations" || path.startsWith("/operations/");
  if (item.to === "/admin") return path === "/access" || path === "/admin" || path.startsWith("/admin/");
  return path === item.to || path.startsWith(item.to + "/");
}
