import { Router } from "express";
import { z } from "zod";
import { can, isWithinScope } from "../permissions.js";
import { getCollection } from "../storage.js";
import { listNotifications } from "../notifications.js";
import { readableCompanyTasks } from "../company-work.js";
import { canReadApproval } from "../workspace.js";
import { attendanceDate } from "../attendance.js";
const router=Router();
type Row=Record<string,unknown>&{id:string};
const rows=(name:string)=>getCollection(name) as Row[];
const query=z.object({metric:z.enum(["workforce","hires","attendance","leave","tasks","notifications","companies"]).default("workforce"),company:z.string().default(""),department:z.string().default(""),section:z.string().default(""),manager:z.string().default(""),status:z.string().default(""),group:z.enum(["company","department","section","manager","status","day","week","month"]).default("status"),start:z.string().date().optional(),end:z.string().date().optional(),timezone:z.string().refine(value=>{try{new Intl.DateTimeFormat("en",{timeZone:value});return true;}catch{return false;}}).default(process.env.STOCRANT_TIME_ZONE||"Asia/Qatar")});
router.get("/",(req,res)=>{
 const parsed=query.safeParse(req.query);if(!parsed.success)return res.status(400).json({error:"Choose valid analytics filters."});
 const q=parsed.data,user=req.auth!;
 if(q.start&&q.end&&(q.start>q.end||Date.parse(q.end)-Date.parse(q.start)>366*86400000))return res.status(400).json({error:"Choose a date range of up to one year."});
 const permitted=(name:string)=>rows(name).filter(row=>isWithinScope(user,row));
 const companies=rows("companies").filter(row=>isWithinScope(user,{...row,organizationId:row.id}));
 const employees=can(user,"hr","view")?permitted("employees"):[];
 const departments=can(user,"hr","view")?permitted("departments"):[];
 const tasks=can(user,"operations","view")?companies.flatMap(company=>readableCompanyTasks(user,company.id)) as Row[]:[];
 const notifications:Row[]=(listNotifications(user.id) as unknown as Row[]).map(row=>{
  const collection=({hr_message:"hrMessages",document_expiry:"documents",overdue_work:"workItems",leave_request:"leaveRequests",pending_approval:"approvalRequests"} as Record<string,string>)[String(row.type)];
  const target=String(row.target||"").replace(/^document:/,"");
  const related=collection?rows(collection).find(item=>item.id===target):undefined;
  const company=related?.organizationId??related?.companyId;
  return {...row,...(companies.some(item=>item.id===company)?{organizationId:company}:{})};
 });
 const metrics=[...(can(user,"hr","view")?["workforce","hires","attendance","leave"]:[]),...(can(user,"operations","view")?["tasks"]:[]),"notifications",...(can(user,"organizations","view")?["companies"]:[])];
 if(!metrics.includes(q.metric))return res.status(403).json({error:"You do not have permission to view this metric."});
 if(q.company&&!companies.some(row=>row.id===q.company)||q.department&&!departments.some(row=>row.id===q.department&&(!q.company||row.organizationId===q.company))||q.section&&!departments.some(row=>row.id===q.section&&row.kind==="section"&&(!q.department||row.parentDepartmentId===q.department))||q.manager&&!employees.some(row=>row.id===q.manager))return res.status(404).json({error:"Analytics scope not found."});
 const employeeById=new Map(employees.map(row=>[row.id,row]));
 const employeeFor=(row:Row)=>employeeById.get(String(row.employeeId??row.assigneeId))??(employees.filter(employee=>employee.organizationId===row.organizationId&&employee.name===row.employee).length===1?employees.find(employee=>employee.organizationId===row.organizationId&&employee.name===row.employee):undefined);
 const inFilters=(row:Row,employee?:Row)=>{
  const company=row.organizationId??row.companyId??employee?.organizationId;
  if(q.company&&company!==q.company)return false;
  const matches=(person:Row|undefined)=>Boolean(person&&(!q.department||person.departmentId===q.department)&&(!q.section||person.sectionId===q.section)&&(!q.manager||person.managerId===q.manager));
  if((q.department||q.section||q.manager)&&!(Array.isArray(row.assigneeIds)?row.assigneeIds.some(id=>matches(employeeById.get(String(id)))):matches(employee)))return false;
  return !q.status||String(row.status??(row.read?"Read":"Unread"))===q.status;
 };
 let source:Row[]=q.metric==="companies"?companies.map(row=>({...row,organizationId:row.id})):q.metric==="workforce"||q.metric==="hires"?employees:q.metric==="tasks"?tasks:q.metric==="notifications"?notifications:q.metric==="attendance"?permitted("attendance"):permitted("leaveRequests");
 const snapshot=["companies","workforce"].includes(q.metric);
 const localDate=(value:unknown)=>{const text=String(value||"");return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:Number.isFinite(Date.parse(text))?attendanceDate(new Date(text),q.timezone):"";};
 const dateFor=(row:Row)=>localDate(q.metric==="hires"?row.hireDate:q.metric==="attendance"?row.date:q.metric==="leave"?row.from:row.createdAt);
 const filtered=source.filter(row=>inFilters(row,["workforce","hires"].includes(q.metric)?row:employeeFor(row))&&(snapshot||(!q.start||dateFor(row)>=q.start)&&(!q.end||dateFor(row)<=q.end)&&/^\d{4}-\d{2}-\d{2}$/.test(dateFor(row))));
 const names=new Map([...companies,...departments,...employees].map(row=>[row.id,String(row.name)]));
 const temporal=["day","week","month"].includes(q.group);
 if(snapshot&&temporal)return res.status(400).json({error:"Snapshot metrics require category grouping."});
 const buckets=new Map<string,{label:string;value:number;statuses:Record<string,number>}>();
 for(const row of filtered){
  const employee=["workforce","hires"].includes(q.metric)?row:employeeFor(row);let key="";
  if(temporal){key=dateFor(row);if(q.group==="month")key=key.slice(0,7);if(q.group==="week"){const day=new Date(key+"T12:00:00Z");day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));key=day.toISOString().slice(0,10);}}
  else key=String(q.group==="company"?row.organizationId??employee?.organizationId??"":q.group==="department"?employee?.departmentId??employee?.department??"":q.group==="section"?employee?.sectionId??"":q.group==="manager"?employee?.managerId??employee?.manager??"":row.status??(row.read?"Read":"Unread"));
  const bucket=buckets.get(key)??{label:names.get(key)||key||"Unassigned",value:0,statuses:{}};bucket.value++;const status=String(row.status??(row.read?"Read":"Unread"));bucket.statuses[status]=(bucket.statuses[status]||0)+1;buckets.set(key,bucket);
 }
 if(temporal&&q.start&&q.end){for(let instant=Date.parse(q.start+"T12:00:00Z");instant<=Date.parse(q.end+"T12:00:00Z");instant+=86400000){const day=new Date(instant);let key=day.toISOString().slice(0,10);if(q.group==="month")key=key.slice(0,7);if(q.group==="week"){const monday=new Date(day);monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));key=monday.toISOString().slice(0,10);}if(!buckets.has(key))buckets.set(key,{label:key,value:0,statuses:{}});}}
 const points=[...buckets.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,point])=>point);
 const safe=(row:Row)=>({id:row.id,name:row.name,companyId:row.organizationId,kind:row.kind,parentDepartmentId:row.parentDepartmentId});
 const managerIds=new Set([...employees,...departments].map(row=>row.managerId).filter(Boolean));
 const summary=[...(can(user,"organizations","view")?[{label:"Companies",value:companies.length,to:"/organization/companies"},{label:"Active companies",value:companies.filter(row=>row.status==="active").length,to:"/organization/companies?status=active"},{label:"Inactive companies",value:companies.filter(row=>row.status==="inactive").length,to:"/organization/companies?status=inactive"}]:[]),...(can(user,"hr","view")?[{label:"Employees",value:employees.length,to:"/hr/employees"},{label:"Managers",value:employees.filter(row=>managerIds.has(row.id)).length,to:"/hr/employees?managers=true"},{label:"Departments and sections",value:departments.length,to:"/hr/departments"}]:[]),{label:"Unread notifications",value:notifications.filter(row=>!row.read).length,to:"/notifications"},...(can(user,"approvals","view")?[{label:"Pending approvals",value:rows("approvalRequests").filter(row=>row.status==="pending"&&canReadApproval(user,row as Parameters<typeof canReadApproval>[1])).length,to:"/admin?tab=Approvals"}]:[])];
 res.json({activityEnabled:can(user,"audit","view"),metrics,points,total:filtered.length,snapshot,companies:companies.map(safe),departments:departments.filter(row=>!q.company||row.organizationId===q.company).map(safe),managers:employees.filter(row=>managerIds.has(row.id)&&(!q.company||row.organizationId===q.company)).map(safe),statuses:[...new Set(source.filter(row=>!q.company||row.organizationId===q.company).map(row=>String(row.status??(row.read?"Read":"Unread"))))].sort(),summary,activity:can(user,"audit","view")?permitted("auditLog").filter(row=>(!q.start||localDate(row.occurredAt)>=q.start)&&(!q.end||localDate(row.occurredAt)<=q.end)).sort((a,b)=>String(b.occurredAt).localeCompare(String(a.occurredAt))).slice(0,8).map(row=>({id:row.id,action:row.action,actorName:row.actorName,occurredAt:row.occurredAt})):[]});
});
export default router;
