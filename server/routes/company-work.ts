import { Router } from "express";
import { z } from "zod";
import { can, isWithinScope, ownRecordsRequired } from "../permissions.js";
import { mutateCollection } from "../workspace.js";
import { transaction } from "../storage.js";
import { workRows, readableCompanyTasks, readableCompanyNotes, managesCompanyWork } from "../company-work.js";
const router=Router({mergeParams:true});
const statuses=["Pending","Planned","Assigned","In Progress","Awaiting Approval","Completed","Cancelled"] as const;
const taskSchema=z.object({title:z.string().trim().min(1).max(180),description:z.string().trim().max(4000).default(""),priority:z.enum(["Low","Medium","High","Urgent"]).default("Medium"),status:z.enum(statuses).default("Pending"),assigneeIds:z.array(z.string().min(1)).min(1).max(100),startDate:z.string().date().or(z.literal("")).optional(),dueDate:z.string().date().or(z.literal("")).optional(),progress:z.coerce.number().min(0).max(100).default(0)}).strict();
const noteSchema=z.object({title:z.string().trim().min(1).max(180),body:z.string().trim().min(1).max(8000),category:z.enum(["General","Follow-up","Observation","Reminder"]).default("General"),employeeId:z.string().optional(),workItemId:z.string().optional(),followUpDate:z.string().date().or(z.literal("")).optional(),visibility:z.enum(["management","employee"]).default("management")}).strict();
router.use((req,res,next)=>{
 const company=workRows("companies").find(row=>row.id===(req.params as Record<string,string>).companyId&&isWithinScope(req.auth!,{...row,organizationId:row.id}));
 if(!company)return res.status(404).json({error:"Company not found."});
 if(!can(req.auth,"operations","view"))return res.status(403).json({error:"You do not have permission to view company work."});
 res.locals.company=company;next();
});
router.get("/",(req,res)=>{
 const user=req.auth!,id=String((req.params as Record<string,string>).companyId),tasks=readableCompanyTasks(user,id),taskIds=new Set(tasks.map(task=>task.id));
 res.json({tasks,notes:readableCompanyNotes(user,id),activity:workRows("workActivity").filter(row=>taskIds.has(String(row.workItemId))&&row.organizationId===id),employees:workRows("employees").filter(row=>row.organizationId===id&&isWithinScope(user,row)).map(row=>({id:row.id,name:row.name,department:row.department})),permissions:{comment:can(user,"operations","edit")&&can(user,"operations","create"),create:can(user,"operations","create")&&!ownRecordsRequired(user),edit:managesCompanyWork(user),delete:can(user,"operations","delete")&&!ownRecordsRequired(user),export:can(user,"operations","export"),notes:managesCompanyWork(user)}});
});
function error(res:import("express").Response,reason:unknown){const e=reason as Error&{statusCode?:number};return res.status(e.statusCode??400).json({error:e.message||"Request failed."});}
for(const kind of ["tasks","notes"] as const){
 for(const editing of [false,true])router[editing?"patch":"post"](`/${kind}${editing?"/:id":""}`,(req,res)=>{
  const user=req.auth!,companyId=String((req.params as Record<string,string>).companyId),collection=kind==="tasks"?"workItems":"companyNotes";
  if(!can(user,"operations",editing?"edit":"create")||ownRecordsRequired(user)||kind==="notes"&&!managesCompanyWork(user))return res.status(403).json({error:"You do not have permission to manage company work."});
  const current=editing?workRows(collection).find(row=>row.id===(req.params as Record<string,string>).id&&row.organizationId===companyId&&isWithinScope(user,row)):undefined;
  if(editing&&!current)return res.status(404).json({error:"Record not found."});
  const parsed=(kind==="tasks"?taskSchema:noteSchema).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Enter a title, valid dates and all required company work details."});
  let payload:Record<string,unknown>={...parsed.data,organizationId:companyId};
  if(kind==="tasks"){
   const ids=[...new Set((parsed.data as z.infer<typeof taskSchema>).assigneeIds)];
   const employees=ids.map(id=>workRows("employees").find(row=>row.id===id&&row.organizationId===companyId&&isWithinScope(user,row)&&(!["terminated","inactive","suspended"].includes(String(row.status))||current?.assigneeId===id||Array.isArray(current?.assigneeIds)&&current.assigneeIds.includes(id))));
   if(employees.some(row=>!row))return res.status(400).json({error:"Choose active employees from this company."});
   if(payload.startDate&&payload.dueDate&&String(payload.dueDate)<String(payload.startDate))return res.status(400).json({error:"Due date must be on or after the start date."});
   payload={...payload,assigneeIds:ids,assigneeId:ids[0],assignee:employees.map(row=>row!.name).join(", "),locationId:current?.locationId??employees[0]?.locationId,progress:payload.status==="Completed"?100:payload.progress};
  }else{
   const employee=payload.employeeId?workRows("employees").find(row=>row.id===payload.employeeId&&row.organizationId===companyId&&isWithinScope(user,row)):undefined;
   const task=payload.workItemId?workRows("workItems").find(row=>row.id===payload.workItemId&&row.organizationId===companyId&&isWithinScope(user,row)):undefined;
   if(payload.employeeId&&!employee||payload.workItemId&&!task||payload.visibility==="employee"&&!employee&&!task)return res.status(400).json({error:"Choose a linked employee or task from this company."});
   payload={...payload,locationId:employee?.locationId??task?.locationId,assigneeIds:task?.assigneeIds,assigneeId:task?.assigneeId};
  }
  try{const result=mutateCollection(user,collection,editing?"edit":"create",payload,current?.id);return res.status(result.pending?202:editing?200:201).json(result);}catch(reason){return error(res,reason);}
 });
 router.delete(`/${kind}/:id`,(req,res)=>{
  const user=req.auth!,companyId=String((req.params as Record<string,string>).companyId),collection=kind==="tasks"?"workItems":"companyNotes";
  if(!can(user,"operations","delete")||ownRecordsRequired(user)||kind==="notes"&&!managesCompanyWork(user))return res.status(403).json({error:"You do not have permission to manage company work."});
  const current=workRows(collection).find(row=>row.id===(req.params as Record<string,string>).id&&row.organizationId===companyId&&isWithinScope(user,row));
  if(!current)return res.status(404).json({error:"Record not found."});
  if(kind==="tasks"&&(workRows("companyNotes").some(row=>row.workItemId===current.id)||workRows("workActivity").some(row=>row.workItemId===current.id)))return res.status(409).json({error:"This task has linked notes. Cancel it to preserve its history."});
  try{return res.json(mutateCollection(user,collection,"delete",{},current.id));}catch(reason){return error(res,reason);}
 });
}
router.post("/tasks/:id/comments",(req,res)=>{
 const user=req.auth!,companyId=String((req.params as Record<string,string>).companyId),task=readableCompanyTasks(user,companyId).find(row=>row.id===(req.params as Record<string,string>).id);
 if(!task)return res.status(404).json({error:"Work item not found."});
 if(!can(user,"operations","edit"))return res.status(403).json({error:"You do not have permission to manage company work."});
 const parsed=z.object({message:z.string().trim().min(1).max(2000)}).strict().safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Enter an activity update."});
 try{const result=transaction(()=>mutateCollection(user,"workActivity","create",{organizationId:companyId,locationId:task.locationId,workItemId:task.id,assigneeId:task.assigneeId,assigneeIds:task.assigneeIds,message:parsed.data.message,occurredAt:new Date().toISOString()}));return res.status(result.pending?202:201).json(result);}catch(reason){return error(res,reason);}
});
export default router;
