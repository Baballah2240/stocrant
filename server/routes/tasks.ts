import express, { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authenticatedUser } from "../auth.js";
import { can, isWithinScope, ownRecordsRequired } from "../permissions.js";
import { getStore, saveStore, transaction } from "../storage.js";
import { documentUploadConfig, filePath, persistDocumentFile, removeDraftFile, validateDocumentFile } from "../document-files.js";
import { accessibleTask, assignedTask, canManageTask, canCreateTask, commentOnTask, contributeTask, requestSmartTask, dispatchTaskDeadlines, requestManageTask, taskDetails, taskError, taskRows, taskOverdue, taskToday } from "../operations.js";

const router=Router();
function fail(res:Response,error:unknown){const e=error as Error&{statusCode?:number};return res.status(error instanceof z.ZodError?400:e.statusCode||400).json({error:error instanceof z.ZodError?error.issues.map(i=>i.message).join("; "):e.message||"Task request failed."});}
const endpoint=(fn:(req:Request,res:Response)=>unknown)=>(req:Request,res:Response)=>{try{return fn(req,res);}catch(error){return fail(res,error);}};
router.get("/",endpoint((req,res)=>{
 const user=req.auth!;if(!can(user,"operations","view"))taskError("You do not have permission to view tasks.",403);
 dispatchTaskDeadlines(user);
 const items=taskRows("workItems").filter(t=>isWithinScope(user,t));
 const companyIds=new Set(taskRows("companies").filter(c=>c.status!=="inactive"&&isWithinScope(user,{...c,organizationId:c.id})).map(c=>c.id));
 const manage=canManageTask(user),canAssign=manage||canCreateTask(user),participantIds=new Set(items.flatMap(t=>t.assigneeIds||[t.assigneeId]));
 const employees=taskRows("employees").filter(e=>companyIds.has(e.organizationId)&&(canAssign?isWithinScope(user,e):participantIds.has(e.id)||e.id===user.employeeId)).map(e=>({id:e.id,name:e.name,organizationId:e.organizationId,department:e.department,departmentId:e.departmentId,sectionId:e.sectionId,status:e.status}));
 res.json({items:items.map(t=>({...t,isOverdue:Boolean(taskOverdue(t)),today:taskToday(t)})),companies:taskRows("companies").filter(c=>companyIds.has(c.id)).map(c=>({id:c.id,name:c.name})),employees,teams:canAssign?taskRows("departments").filter(d=>companyIds.has(d.organizationId)&&employees.some(e=>e.departmentId===d.id||e.sectionId===d.id||e.department===d.name)).map(d=>({id:d.id,name:d.name,organizationId:d.organizationId})):[],permissions:{create:canCreateTask(user),manage,update:can(user,"operations","edit"),review:manage&&can(user,"operations","approve")}});
}));
router.get("/:id",endpoint((req,res)=>res.json(taskDetails(req.auth!,String(req.params.id)))));
router.post("/",endpoint((req,res)=>{const result=requestSmartTask(req.auth!,req.body);return res.status(result.pending?202:201).json(result);}));
router.post("/:id/contribution",endpoint((req,res)=>res.json({item:contributeTask(req.auth!,String(req.params.id),req.body)})));
router.post("/:id/comments",endpoint((req,res)=>res.status(201).json({item:commentOnTask(req.auth!,String(req.params.id),req.body)})));
router.post("/:id/manage",endpoint((req,res)=>{const result=requestManageTask(req.auth!,String(req.params.id),req.body);return res.status(result.pending?202:200).json(result);}));
function uploadAccess(req:Request,res:Response,next:()=>void){try{const task=accessibleTask(req.auth!,String(req.params.id));if(!can(req.auth,"operations","edit")||!assignedTask(req.auth!,task)&&!canManageTask(req.auth!,task)||ownRecordsRequired(req.auth!)&&!assignedTask(req.auth!,task))taskError("You do not have permission to attach task files.",403);if(taskRows("workFiles").filter(f=>f.workItemId===task.id).length>=100)taskError("This task has reached its attachment limit.",409);next();}catch(error){fail(res,error);}}
router.post("/:id/files",uploadAccess,express.raw({type:"application/octet-stream",limit:documentUploadConfig().maxBytes}),endpoint((req,res)=>{
 let fileId:string|undefined;
 try{
   req.auth=authenticatedUser(req);if(!req.auth)taskError("Sign in is required.",401);const task=accessibleTask(req.auth!,String(req.params.id));
   if(!can(req.auth,"operations","edit")||!assignedTask(req.auth,task)&&!canManageTask(req.auth,task))taskError("You do not have permission to attach task files.",403);
   if(taskRows("workFiles").filter(f=>f.workItemId===task.id).length>=100)taskError("This task has reached its attachment limit.",409);
   if(!Buffer.isBuffer(req.body))taskError("Send file bytes as application/octet-stream.");
   const metadata=validateDocumentFile(decodeURIComponent(req.get("X-File-Name")||""),req.body);
   const existing=taskRows("workFiles").find(f=>f.workItemId===task.id&&f.createdBy===req.auth!.id&&f.sha256===metadata.sha256&&f.name===metadata.name);if(existing)return res.status(201).json({file:existing});
   fileId=persistDocumentFile(req.body);
   const file={...metadata,id:fileId,workItemId:task.id,organizationId:task.organizationId,createdBy:req.auth.id,createdByName:req.auth.name,createdAt:new Date().toISOString()};
   transaction(()=>{getStore().collections.workFiles=[...taskRows("workFiles"),file];saveStore(getStore());commentOnTask(req.auth!,task.id,{message:"Task file attached: "+file.name,fileIds:[file.id],clientRequestId:"file:"+file.id},{key:"Task file attached: {name}",values:{name:file.name}});});
   return res.status(201).json({file});
 }catch(error){if(fileId)removeDraftFile(fileId);throw error;}
}));
router.get("/:id/files/:fileId",endpoint((req,res)=>{
 const task=accessibleTask(req.auth!,String(req.params.id));const file=taskRows("workFiles").find(f=>f.id===req.params.fileId&&f.workItemId===task.id);
 if(!file)taskError("Task file not found.",404);
 res.setHeader("Content-Type",file.mime);res.setHeader("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g,c=>`%${c.charCodeAt(0).toString(16)}`)}`);res.setHeader("Cache-Control","private, no-store");res.setHeader("Content-Security-Policy","sandbox; default-src 'none'");return res.sendFile(filePath(file.id));
}));
export default router;
