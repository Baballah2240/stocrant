import { readableCompanyTasks, readableCompanyNotes } from "./company-work.js";
import type { AuthenticatedUser } from "./auth.js";
import { can, isWithinScope, redactRecord, canViewSalaryData } from "./permissions.js";
import { getCollection } from "./storage.js";
type Row = Record<string, unknown> & { id:string };
export const workspaceRows = (name:string) => getCollection(name) as Row[];
export const companyRows = (user:AuthenticatedUser, name:string, companyId:string) => workspaceRows(name).filter(row=>(row.organizationId??row.companyId)===companyId&&isWithinScope(user,row));
export const linkedEmployeeRows = (user:AuthenticatedUser,name:string,employee:Row) => companyRows(user,name,String(employee.organizationId??employee.companyId)).filter(row=>row.employeeId===employee.id || (!row.employeeId&&row.employee===employee.name&&workspaceRows("employees").filter(e=>(e.organizationId??e.companyId)===(employee.organizationId??employee.companyId)&&e.name===employee.name).length===1));
export function employeeShiftRows(user:AuthenticatedUser,employee:Row){
 const ids=new Set([employee.shiftId,...linkedEmployeeRows(user,"payrollSalaries",employee).map(row=>row.shiftId)]);
 return companyRows(user,"shifts",String(employee.organizationId??employee.companyId)).filter(row=>ids.has(row.id)||row.employeeId===employee.id||Array.isArray(row.employeeIds)&&row.employeeIds.includes(employee.id));
}
const configs:Record<string,{title:string;collection:string;columns:[string,string][]}>={
 employees:{title:"Employee directory",collection:"employees",columns:[["employeeCode","Employee ID"],["name","Full name"],["jobTitle","Job title"],["department","Department"],["status","Employment status"],["hireDate","Joining date"]]},
 contacts:{title:"Employee contact directory",collection:"employees",columns:[["employeeCode","Employee ID"],["name","Full name"],["email","Email"],["phone","Phone"],["address","Address"]]},
 attendance:{title:"Attendance report",collection:"attendance",columns:[["employee","Employee"],["date","Date"],["checkIn","Clock in"],["checkOut","Clock out"],["hours","Hours"],["status","Status"]]},
 shifts:{title:"Shift report",collection:"shifts",columns:[["name","Name"],["start","Start"],["end","End"],["days","Days"],["status","Status"]]},
 leave:{title:"Leave records",collection:"leaveRequests",columns:[["employee","Employee"],["type","Type"],["from","From"],["to","To"],["days","Days"],["status","Status"]]},
};
export function companyReport(user:AuthenticatedUser,company:Row,kind:string){
 if(kind==="tasks"||kind==="notes"){
  if(!can(user,"operations","view")||!can(user,"operations","export"))return {error:"You do not have permission to export this report.",status:403};
  const columns=kind==="tasks"?[["title","Title"],["assignee","Assignee"],["priority","Priority"],["status","Status"],["dueDate","Due"],["progress","Progress"]]:[["title","Title"],["body","Note"],["category","Category"],["createdByName","Author"],["createdAt","Created"],["followUpDate","Follow-up date"]];
  const items=kind==="tasks"?readableCompanyTasks(user,company.id):readableCompanyNotes(user,company.id);
  return {report:{title:kind==="tasks"?"Task progress report":"Company notes report",company:{id:company.id,name:company.name},generatedAt:new Date().toISOString(),columns:columns.map(([key,label])=>({key,label})),rows:items.map(item=>Object.fromEntries(columns.map(([key])=>[key,item[key]??""])))}};
 }
 const hr=Object.hasOwn(configs,kind);
 if(kind!=="company"&&!hr)return {error:"Unknown company report.",status:400};
 if(!can(user,hr?"hr":"organizations","view")||!can(user,hr?"hr":"organizations","export"))return {error:"You do not have permission to export this report.",status:403};
 if(kind==="company"){
  const safe=redactRecord("companies",company,user),parent=workspaceRows("organizations").find(row=>row.id===company.parentOrganizationId);
  const fields=[["name","Company name"],["tradeName","Trading name"],["organizationType","Organization type"],["status","Status"],["contactName","Primary contact"],["contactEmail","Email"],["contactPhone","Phone"],["country","Country"],["industry","Business category"],["taxId","Tax / registration ID"],["currency","Primary currency"],["notes","Notes"],["createdAt","Company creation date"]];
  return {report:{title:"Company information",company:{name:company.name,id:company.id,logo:typeof company.logo==="string"&&company.logo.startsWith("https://")?company.logo:undefined},generatedAt:new Date().toISOString(),columns:[{key:"label",label:"Field"},{key:"value",label:"Value"}],rows:[{label:"Organization",value:parent?.name??""},...fields.map(([key,label])=>({label,value:safe[key]??""}))]}};
 }
 const config=configs[kind];
 const items=config?companyRows(user,config.collection,company.id).map(row=>redactRecord(config.collection,row,user)):[redactRecord("companies",company,user)];
 const columns=config?.columns??[["name","Company name"],["tradeName","Trading name"],["status","Status"],["contactName","Primary contact"],["contactEmail","Email"],["contactPhone","Phone"],["country","Country"],["taxId","Tax / registration ID"]];
 return {report:{title:config?.title??"Company information",company:{name:company.name,id:company.id,logo:typeof company.logo==="string"&&company.logo.startsWith("https://")?company.logo:undefined},generatedAt:new Date().toISOString(),columns:columns.map(([key,label])=>({key,label})),rows:items.map(row=>Object.fromEntries(columns.map(([key])=>[key,row[key]??""])))}};
}
export function employeeReport(user:AuthenticatedUser,employee:Row,company:Row,kind="profile"){
 if(kind==="tasks"||kind==="notes"){
  if(!can(user,"operations","view")||!can(user,"operations","export"))return {error:"You do not have permission to export this report.",status:403};
  const assigned=readableCompanyTasks(user,company.id).filter(task=>task.assigneeId===employee.id||Array.isArray(task.assigneeIds)&&task.assigneeIds.includes(employee.id));
  const ids=new Set(assigned.map(task=>task.id));
  const items=kind==="tasks"?assigned:readableCompanyNotes(user,company.id).filter(note=>note.employeeId===employee.id||ids.has(String(note.workItemId)));
  const columns=kind==="tasks"?[["title","Title"],["assignee","Assignee"],["status","Status"],["priority","Priority"],["dueDate","Due"],["progress","Progress"]]:[["title","Title"],["body","Note"],["category","Category"],["createdByName","Author"],["createdAt","Created"]];
  return {report:{title:kind==="tasks"?"Task progress report":"Employee notes report",company:{id:company.id,name:company.name},generatedAt:new Date().toISOString(),columns:columns.map(([key,label])=>({key,label})),rows:items.map(item=>Object.fromEntries(columns.map(([key])=>[key,item[key]??""])))}};
 }
 if(!can(user,"hr","export"))return {error:"You do not have permission to export this report.",status:403};
 if(kind!=="profile"){
  const config=configs[kind];
  if(!config||!["attendance","shifts","leave"].includes(kind))return {error:"Unknown company report.",status:400};
  const items=kind==="shifts"?employeeShiftRows(user,employee):linkedEmployeeRows(user,config.collection,employee);
  return {report:{title:config.title,company:{name:company.name,id:company.id},generatedAt:new Date().toISOString(),columns:config.columns.map(([key,label])=>({key,label})),rows:items.map(row=>Object.fromEntries(config.columns.map(([key])=>[key,row[key]??""])))}};
 }
 const safe=redactRecord("employees",employee,user);
 const fields=[["employeeCode","Employee ID"],["name","Full name"],["birthday","Birthday"],["jobTitle","Job title"],["department","Department"],["employmentType","Employment"],["status","Employment status"],["hireDate","Joining date"],["email","Email"],["phone","Phone"],["address","Address"],["manager","Manager"],["location","Location"],["notes","Notes"],...(canViewSalaryData(user)?[["salary","Base salary"]]:[])];
 return {report:{title:"Employee profile",company:{name:company.name,id:company.id,logo:typeof company.logo==="string"&&company.logo.startsWith("https://")?company.logo:undefined},generatedAt:new Date().toISOString(),columns:[{key:"label",label:"Field"},{key:"value",label:"Value"}],rows:fields.filter(([key])=>Object.hasOwn(safe,key)).map(([key,label])=>({label,value:safe[key]}))}};
}
