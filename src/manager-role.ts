export const managerDashboardRoles = ["role-main-manager", "role-manager", "role-organization-admin", "role-company-manager", "role-hr-manager", "role-general-manager", "role-finance-manager"];
export const hasManagerDashboard = (roleId?: string) => Boolean(roleId && managerDashboardRoles.includes(roleId));
