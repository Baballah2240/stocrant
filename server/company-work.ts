import type { AuthenticatedUser } from "./auth.js";
import { can, isWithinScope, ownRecordsRequired } from "./permissions.js";
import { getCollection } from "./storage.js";
export type WorkRow=Record<string,unknown>&{id:string};
export const workRows=(name:string)=>getCollection(name) as WorkRow[];
export const managesCompanyWork=(user:AuthenticatedUser)=>can(user,"operations","edit")&&!ownRecordsRequired(user);
export function assignedTo(user:AuthenticatedUser,task:WorkRow){return [task.assigneeId,...(Array.isArray(task.assigneeIds)?task.assigneeIds:[])].includes(user.employeeId??"");}
export function readableCompanyTasks(user:AuthenticatedUser,companyId:string){return can(user,"operations","view")?workRows("workItems").filter(row=>row.organizationId===companyId&&isWithinScope(user,row)):[];}
export function readableCompanyNotes(user:AuthenticatedUser,companyId:string){
 if(!can(user,"operations","view"))return [];
 return workRows("companyNotes").filter(row=>{
  if(row.organizationId!==companyId)return false;
  const task=workRows("workItems").find(task=>task.id===row.workItemId&&task.organizationId===companyId);
  const employee=workRows("employees").find(employee=>employee.id===row.employeeId&&employee.organizationId===companyId);
  const scoped={...row,locationId:employee?.locationId??task?.locationId??row.locationId,assigneeId:task?.assigneeId,assigneeIds:task?.assigneeIds};
  return isWithinScope(user,scoped)&&(managesCompanyWork(user)||row.visibility==="employee"&&(row.employeeId===user.employeeId||task&&isWithinScope(user,task)&&assignedTo(user,task)));
 });
}
