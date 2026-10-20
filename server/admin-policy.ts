import { getCollection } from "./storage.js";
export const moduleActions={organizations:["view","export"],locations:["view","create","edit","delete","export"],hr:["view","create","edit","delete","approve","export","personal.view","salary.view"],operations:["view","create","edit","delete","export"],inventory:["view","create","edit","delete","export"],finance:["view","create","edit","delete","export"],payroll:["view","create","edit","approve","pay","export","configure"],customerService:["view","create","edit","delete","reply","export"],approvals:["view","approve"],access:["view","create","edit","delete"],audit:["view"]} as const;
export const policyDefaults={automaticAccounts:true,automaticEmail:true,defaultRoleId:"role-employee",invitationHours:48,emailLanguage:"en",supportEmail:"",mainSelfApproval:true,separateApproverSections:["finance","payroll","inventory"]};
export function administrationPolicy(){const row=(getCollection("workspaceSettings") as Record<string,unknown>[]).find(row=>row.id==="administration-policy");return {...policyDefaults,...row} as typeof policyDefaults & {updatedAt?:string;updatedBy?:string};}
export function eligibleSelfApproval(request:Record<string,unknown>){
 const policy=administrationPolicy();if(!policy.mainSelfApproval||policy.separateApproverSections.includes(String(request.section)))return false;
 if(!["organizations","companies","departments","employees","workItems","companyNotes","locationUpdates"].includes(String(request.collection)))return false;
 const payload=request.payload as Record<string,unknown>|undefined;
 if(request.collection==="employees"&&payload&&Object.hasOwn(payload,"salary")){const current=(getCollection("employees") as Record<string,unknown>[]).find(row=>row.id===request.targetId);if(current?payload.salary!==current.salary:Number(payload.salary)!==0)return false;}
 return true;
}
