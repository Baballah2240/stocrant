import { canManageAccount } from "../organization-policy.js";
import { Router } from "express";
import { can, isWithinScope, ownRecordsRequired, redactRecord, isMainManager } from "../permissions.js";
import { getCollection } from "../storage.js";
import { payrollCan } from "../payroll.js";
type Row = Record<string, unknown> & { id: string };
const rows = (name: string) => getCollection(name) as Row[];
const router = Router();
router.get("/:id", (req, res) => {
  const user = req.auth!;
  if (!can(user, "organizations", "view") && !(can(user, "hr", "view") && !ownRecordsRequired(user))) return res.status(403).json({ error: "You do not have permission to view company profiles." });
  const company = rows("companies").find(row => row.id === req.params.id);
  if (!company || !isWithinScope(user, { ...company, organizationId: company.id })) return res.status(404).json({ error: "Company not found." });
  const parent = rows("organizations").find(row => row.id === company.parentOrganizationId);
  const readEmployees = can(user,"hr","view");
  const manageAccounts = can(user,"access","view");
  const hrAccountSummary = can(user,"hr","edit") && !ownRecordsRequired(user);
  const employees = readEmployees ? rows("employees").filter(row => (row.organizationId ?? row.companyId) === company.id && isWithinScope(user,row)).map(row => {
    const safe = redactRecord("employees",row,user);
    const account = rows("accessUsers").find(account => account.employeeId === row.id);
    return { ...safe, ...((hrAccountSummary || manageAccounts || user.employeeId === row.id) ? { account: account ? { id: account.id, username: account.username, status: account.status, roleId: account.roleId, avatar: typeof account.avatar === "string" && /^(https:\/\/|data:image\/(?:png|jpeg|webp);base64,)/.test(account.avatar) ? account.avatar : undefined, roleName: rows("accessRoles").find(role=>role.id===account.roleId)?.name || "Employee", activationRequired: account.activationRequired === true } : null } : {}) };
  }) : [];
  const users = manageAccounts ? rows("accessUsers").filter(account => ((Array.isArray(account.organizationIds) && account.organizationIds.includes(company.id)) || (account.roleId === "role-organization-admin" && Array.isArray(account.tenantOrganizationIds) && account.tenantOrganizationIds.includes(company.parentOrganizationId))) && canManageAccount(user,account)).map(account => ({ id:account.id,name:account.name,username:account.username,status:account.status,roleName:rows("accessRoles").find(role=>role.id===account.roleId)?.name || "Employee" })) : [];
  const scoped = (name: string) => rows(name).filter(row => (row.organizationId ?? row.companyId) === company.id && isWithinScope(user,row));
  const records = readEmployees ? Object.fromEntries(["shifts","attendance","leaveRequests"].map(name => [name,scoped(name).map(row=>redactRecord(name,row,user))])) : {};
  const payroll = payrollCan(user,"view") ? scoped("payrollRuns").map(row=>({id:row.id,start:row.start,end:row.end,status:row.status,currency:row.currency,createdAt:row.createdAt})) : [];
  const companies = rows("companies").filter(row=>isWithinScope(user,{...row,organizationId:row.id})).map(row=>({id:row.id,name:row.name}));
  res.json({ company: redactRecord("companies",company,user), organization: parent ? { name: parent.name, ...(can(user,"organizations","view") ? { id:parent.id } : {}) } : null,
    companies, records, payroll,
    employees, users,
    permissions: { viewUsers:manageAccounts, viewPayroll:payrollCan(user,"view"), sendNotification:readEmployees && hrAccountSummary, editCompany:can(user,"organizations","edit"), viewEmployees:readEmployees, addEmployee:can(user,"hr","create") && !ownRecordsRequired(user) && company.status !== "inactive" && parent?.status !== "inactive", editEmployee:can(user,"hr","edit") && !ownRecordsRequired(user), manageAccount:can(user,"access","edit"), hrAccountSetup:hrAccountSummary, viewOrganization:can(user,"organizations","view"), main:isMainManager(user) } });
});
export default router;
