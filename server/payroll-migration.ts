import type { StoreData } from "./storage.js";
/** Add new collections/roles only. No historical payslip, salary or grant is rewritten. */
export function migratePayroll(data:StoreData) {
  let changed=false;const roles=data.collections.accessRoles as Record<string,unknown>[];
  // Additive payroll roles: existing custom roles and account grants remain untouched.
  for (const [id,name,permissions] of [
    ["role-payroll-hr", "Payroll HR Manager", ["hr.view","hr.edit","payroll.view","payroll.create","payroll.edit","payroll.configure","payroll.export"]],
    ["role-payroll-approver", "Payroll Approver", ["payroll.view","payroll.approve","payroll.export"]],
    ["role-payroll-finance", "Payroll Finance", ["payroll.view","payroll.pay","payroll.export","finance.view","finance.create","finance.approve"]],
  ] as const) if (!roles.some(role=>role.id===id)) { roles.push({id,name,permissions:[...permissions],isSystem:true,dataClassification:"system"}); changed=true; }
  for(const name of ["payrollSettings","payrollSalaries","payrollRuns","payrollEntries","payrollSources","payrollHistory"]) if(!Array.isArray(data.collections[name])) { data.collections[name]=[]; changed=true; }
  return changed;
}
