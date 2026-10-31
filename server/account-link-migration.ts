type Row = Record<string, unknown>;
const MARKER = "account-employee-links-v1";

/**
 * Access once followed a matching email; it now follows `employeeId` only. Link
 * existing accounts once so legitimate employees keep their records. An account
 * that changed its own email is skipped because that address may have been
 * claimed from a colleague; an administrator can link it after checking.
 */
export function migrateAccountEmployeeLinks(data: { collections: Record<string, unknown[]> }): boolean {
  const collections = data.collections;
  const applied = (collections.storeMigrations ?? []) as Row[];
  if (applied.some(row => row.id === MARKER)) return false;
  const accounts = (collections.accessUsers ?? []) as Row[], employees = (collections.employees ?? []) as Row[], audit = (collections.auditLog ?? []) as Row[];
  const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const selfChanged = new Set(audit.filter(row => row.action === "profile.updated" && Array.isArray(row.changedFields) && row.changedFields.includes("email")).map(row => row.actorId));
  for (const account of accounts) {
    if (account.employeeId || account.roleId === "role-main-manager" || !normalized(account.email)) continue;
    const matches = employees.filter(employee => normalized(employee.email) === normalized(account.email));
    if (matches.length !== 1) continue;
    const employee = matches[0];
    if (selfChanged.has(account.id)) { console.warn(`STOCRANT left account ${String(account.id)} unlinked: it changed its own email to one on an employee record. Review it before linking.`); continue; }
    if (accounts.some(other => other.employeeId === employee.id)) continue;
    if (Array.isArray(account.organizationIds) && !account.organizationIds.includes(employee.organizationId ?? employee.companyId)) continue;
    account.employeeId = employee.id;
    employee.accountId = account.id;
  }
  collections.storeMigrations = [...applied, { id: MARKER, appliedAt: new Date().toISOString() }];
  return true;
}
