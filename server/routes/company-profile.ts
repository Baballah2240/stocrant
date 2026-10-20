import { readableCompanyTasks } from "../company-work.js";
import { onboardingStatus } from "../onboarding.js";
import { canManageAccount } from "../organization-policy.js";
import { Router } from "express";
import { can, isWithinScope, ownRecordsRequired, redactRecord, isMainManager } from "../permissions.js";
import { getCollection } from "../storage.js";
import { payrollCan, payrollList } from "../payroll.js";
import { companyReport, employeeReport, linkedEmployeeRows, employeeShiftRows } from "../company-reports.js";
import { canViewSalaryData } from "../permissions.js";
type Row = Record<string, unknown> & { id: string };
const rows = (name: string) => getCollection(name) as Row[];
const router = Router();
router.get("/employees/:id",(req,res)=>{
 const user=req.auth!;
 if(!can(user,"hr","view"))return res.status(403).json({error:"You do not have permission to view employees."});
 const employee=rows("employees").find(row=>row.id===req.params.id&&isWithinScope(user,row));
 const company=employee&&rows("companies").find(row=>row.id===(employee.organizationId??employee.companyId));
 if(!employee||!company)return res.status(404).json({error:"Employee not found."});
 if(req.query.report){const result=employeeReport(user,employee,company,String(req.query.report));return "error" in result?res.status(result.status!).json({error:result.error}):res.json(result.report);}
 const account=rows("accessUsers").find(row=>row.employeeId===employee.id);
 const accountVisible=can(user,"access","view")||(can(user,"hr","edit")&&!ownRecordsRequired(user))||user.employeeId===employee.id||(employee.createdBy===user.id&&can(user,"hr","create"));
 const payrollData=payrollCan(user,"view")?payrollList(user):null;
 const payroll=payrollData?payrollData.entries.filter(row=>row.employeeId===employee.id).map(row=>{const run=payrollData.runs.find(run=>run.id===row.runId);return {...row,start:run?.start,end:run?.end};}):[];
 const records=Object.fromEntries(["attendance","leaveRequests","employeeHistory"].map(name=>[name,linkedEmployeeRows(user,name,employee).map(row=>redactRecord(name,row,user))]));
 records.shifts=employeeShiftRows(user,employee);
 return res.json({...(accountVisible?{delivery:onboardingStatus(employee.id)}:{}),employee:redactRecord("employees",employee,user),company:{id:company.id,name:company.name,parentOrganizationId:company.parentOrganizationId},records,payroll,account:accountVisible&&account?{id:account.id,username:account.username,status:account.status,avatar:typeof account.avatar==="string"&&/^(https:\/\/|data:image\/(?:png|jpeg|webp);base64,)/.test(account.avatar)?account.avatar:undefined,roleName:rows("accessRoles").find(role=>role.id===account.roleId)?.name}:null,permissions:{notes:can(user,"operations","view"),edit:can(user,"hr","edit"),delete:can(user,"hr","delete"),export:can(user,"hr","export"),salary:canViewSalaryData(user),payroll:payrollCan(user,"view")}});
});
router.get("/:id/reports/:kind",(req,res)=>{
 const user=req.auth!,company=rows("companies").find(row=>row.id===req.params.id&&isWithinScope(user,{...row,organizationId:row.id}));
 if(!company)return res.status(404).json({error:"Company not found."});
 const result=companyReport(user,company,String(req.params.kind));
 return "error" in result?res.status(result.status!).json({error:result.error}):res.json(result.report);
});
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
  const records = readEmployees ? Object.fromEntries(["departments","shifts","attendance","leaveRequests","employeeHistory"].map(name => [name,scoped(name).map(row=>redactRecord(name,row,user))])) : {};
  const payroll = payrollCan(user,"view") ? scoped("payrollRuns").map(row=>({id:row.id,start:row.start,end:row.end,status:row.status,currency:row.currency,createdAt:row.createdAt})) : [];
  const companies = rows("companies").filter(row=>isWithinScope(user,{...row,organizationId:row.id})).map(row=>({id:row.id,name:row.name}));
  res.json({ company: redactRecord("companies",company,user), organization: parent ? { name: parent.name, ...(can(user,"organizations","view") ? { id:parent.id } : {}) } : null,
    companies, records, payroll, tasks:readableCompanyTasks(user,company.id),
    employees, users,
    permissions: { viewWork:can(user,"operations","view"), exportCompany:can(user,"organizations","export")&&can(user,"organizations","view"), exportHr:can(user,"hr","export")&&readEmployees, viewUsers:manageAccounts, viewPayroll:payrollCan(user,"view"), sendNotification:readEmployees && hrAccountSummary, editCompany:can(user,"organizations","edit"), viewEmployees:readEmployees, addEmployee:can(user,"hr","create") && !ownRecordsRequired(user) && company.status !== "inactive" && parent?.status !== "inactive", editEmployee:can(user,"hr","edit") && !ownRecordsRequired(user), manageAccount:can(user,"access","edit"), hrAccountSetup:hrAccountSummary, viewOrganization:can(user,"organizations","view"), main:isMainManager(user) } });
});
export default router;
