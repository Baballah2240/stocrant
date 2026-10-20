import { createCipheriv,createDecipheriv,randomBytes } from "node:crypto";
import { getCollection,getStore,nextCollectionId,saveStore,transaction } from "./storage.js";
import { administrationPolicy } from "./admin-policy.js";
import { issueEmployeeInvitation,tokenDigest } from "./employee-accounts.js";
import { audit } from "./workspace.js";
import { accountScopeActive,type AuthenticatedUser } from "./auth.js";
type Row=Record<string,unknown>&{id:string};
const rows=(name:string)=>getCollection(name) as Row[];
function encryptionKey(){const key=Buffer.from(process.env.STOCRANT_ONBOARDING_KEY||"","base64");if(key.length!==32)throw new Error("Configure the onboarding encryption key.");return key;}
export function emailConfiguration(){
 let secureOrigin=false;try{const url=new URL(process.env.STOCRANT_APP_URL||"");secureOrigin=url.protocol==="https:"&&!url.username&&!url.password&&!url.hash&&!url.search;}catch{/* Invalid/unconfigured. */}
 let encryption=false;try{encryptionKey();encryption=true;}catch{/* Report only a flag. */}
 return {provider:"Resend",configured:Boolean(process.env.STOCRANT_EMAIL_API_KEY&&process.env.STOCRANT_EMAIL_FROM&&secureOrigin&&encryption),originConfigured:secureOrigin,encryptionConfigured:encryption,senderConfigured:Boolean(process.env.STOCRANT_EMAIL_FROM),apiKeyConfigured:Boolean(process.env.STOCRANT_EMAIL_API_KEY)};
}
function encrypt(value:string){const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),nonce);return Buffer.concat([nonce,cipher.update(value,"utf8"),cipher.final(),cipher.getAuthTag()]).toString("base64");}
function decrypt(value:string){const data=Buffer.from(value,"base64"),cipher=createDecipheriv("aes-256-gcm",encryptionKey(),data.subarray(0,12));cipher.setAuthTag(data.subarray(-16));return Buffer.concat([cipher.update(data.subarray(12,-16)),cipher.final()]).toString("utf8");}
const escape=(value:unknown)=>String(value||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function onboardingStatus(employeeId:string){
 const account=rows("accessUsers").find(row=>row.employeeId===employeeId),job=rows("onboardingEmails").filter(row=>row.employeeId===employeeId).at(-1);
 if(!account)return {status:"no-account"};
 if(!job)return {status:"not-queued"};
 const invitationAccepted=Boolean(account.activationRequired===false&&account.activatedAt);
 return {id:job.id,invitationAccepted,status:!invitationAccepted&&(Date.parse(String(job.expiresAt))<=Date.now()||job.tokenHash&&!rows("employeeInvitations").some(row=>row.tokenHash===job.tokenHash&&Date.parse(String(row.expiresAt))>Date.now()))?"expired":job.status,attempts:job.attempts,createdAt:job.createdAt,sentAt:job.sentAt,error:job.error,expiresAt:job.expiresAt};
}
/** Runs inside the employee transaction. Persist encrypted delivery work, never a raw token. */
export function queueOnboarding(actor:AuthenticatedUser,employee:Row){
 const account=rows("accessUsers").find(row=>row.employeeId===employee.id);if(!account||account.status!=="invited"||!account.activationRequired)return;
 const email=String(employee.email||"").trim().toLowerCase();
 const configuration=emailConfiguration(),now=new Date().toISOString();
 const job:Row={id:nextCollectionId("onboardingEmails"),employeeId:employee.id,accountId:account.id,organizationId:employee.organizationId,status:"pending",attempts:0,createdAt:now,createdBy:actor.id,recipient:email};
 for(const previous of rows("onboardingEmails").filter(row=>row.accountId===account.id&&row.status!=="sent")){previous.status="superseded";delete previous.encryptedPayload;}
 if(!email||!configuration.configured){job.status="failed";job.error=!email?"Add an employee email before sending an invitation.":"Email delivery is not configured.";}
 else {
  const invitation=issueEmployeeInvitation(actor,employee),policy=administrationPolicy(),company=rows("companies").find(row=>row.id===employee.organizationId);
  const link=new URL(process.env.STOCRANT_APP_URL!);link.hash="activate="+invitation.token;
  const ar=policy.emailLanguage==="ar",subject=ar?"تفعيل حسابك في Stocrant":"Activate your Stocrant account";
  const lines=ar?[`مرحبًا ${employee.name}`,`الشركة: ${company?.name||"Stocrant"}`,`الرقم الوظيفي: ${employee.employeeCode}`,`اسم المستخدم: ${account.username}`,`أنشئ كلمة مرورك عبر الرابط الآمن: ${link}`,`ينتهي الرابط في: ${invitation.expiresAt}`,"الرابط للاستخدام مرة واحدة. لا تشاركه. بعد التفعيل، سجّل الدخول باسم المستخدم وكلمة مرورك."]:[`Hello ${employee.name}`,`Company: ${company?.name||"Stocrant"}`,`Employee ID: ${employee.employeeCode}`,`Username: ${account.username}`,`Set your password securely: ${link}`,`Link expires: ${invitation.expiresAt}`,"This link is for one use only. Do not share it. After activation, sign in with your username and chosen password."];
  if(policy.supportEmail)lines.push((ar?"الدعم: ":"Support: ")+policy.supportEmail);
  job.encryptedPayload=encrypt(JSON.stringify({from:process.env.STOCRANT_EMAIL_FROM,to:[email],subject,text:lines.join("\n"),html:`<div dir="${ar?"rtl":"ltr"}">${lines.map(line=>`<p>${escape(line)}</p>`).join("")}<p><a href="${escape(link.toString())}">${ar?"تفعيل الحساب":"Activate account"}</a></p></div>`}));job.tokenHash=tokenDigest(invitation.token);job.expiresAt=invitation.expiresAt;
 }
 getStore().collections.onboardingEmails=[...rows("onboardingEmails"),job];saveStore(getStore());audit(actor,"onboarding.queued",{employeeId:employee.id,organizationId:employee.organizationId,targetId:job.id,outcome:job.status});return job;
}
let running=false;
/** Single-process durable outbox; provider idempotency window is 24h, so retries stop before it. */
export async function dispatchOnboardingEmails(){
 if(running)return;running=true;
 try{for(const snapshot of rows("onboardingEmails").filter(row=>row.status==="pending"&&(!row.nextAttemptAt||Date.parse(String(row.nextAttemptAt))<=Date.now())).slice(0,20)){
  const job=rows("onboardingEmails").find(row=>row.id===snapshot.id);if(!job)continue;
  const account=rows("accessUsers").find(row=>row.id===job.accountId),employee=rows("employees").find(row=>row.id===job.employeeId),invite=rows("employeeInvitations").find(row=>row.tokenHash===job.tokenHash);
  if(!account||!employee||account.status!=="invited"||!account.activationRequired||!accountScopeActive(account)||String(employee.email||"").toLowerCase()!==job.recipient||!invite||Date.parse(String(invite.expiresAt))<=Date.now()||Date.parse(String(job.expiresAt))<=Date.now()||Date.now()-Date.parse(String(job.createdAt))>=23*3600000) {job.status="expired";delete job.encryptedPayload;saveStore(getStore());continue;}
  job.attempts=Number(job.attempts||0)+1;saveStore(getStore());
  try{
   const endpoint=process.env.NODE_TEST_CONTEXT?process.env.STOCRANT_EMAIL_TEST_ENDPOINT||"https://api.resend.com/emails":"https://api.resend.com/emails";
   const response=await fetch(endpoint,{method:"POST",headers:{Authorization:`Bearer ${process.env.STOCRANT_EMAIL_API_KEY}`,"Content-Type":"application/json","Idempotency-Key":"stocrant-onboarding/"+job.id},body:decrypt(String(job.encryptedPayload)),signal:AbortSignal.timeout(10000),redirect:"error"});
   if(!response.ok)throw new Error("Email provider rejected the request.");
   const receipt=await response.json() as {id?:unknown};if(typeof receipt.id!=="string")throw new Error("Email provider did not confirm acceptance.");
   transaction(()=>{const latest=rows("onboardingEmails").find(row=>row.id===job.id);if(!latest||latest.status!=="pending")return;latest.status="sent";latest.sentAt=new Date().toISOString();latest.providerId=receipt.id;delete latest.encryptedPayload;delete latest.error;saveStore(getStore());audit(undefined,"onboarding.sent",{targetId:job.id,employeeId:job.employeeId,organizationId:job.organizationId,outcome:"provider-accepted"});});
  }catch{
   const latest=rows("onboardingEmails").find(row=>row.id===job.id);if(!latest||latest.status!=="pending")continue;latest.error="Email delivery failed. Retry the invitation.";latest.status=Number(latest.attempts)>=3?"failed":"pending";latest.nextAttemptAt=new Date(Date.now()+60000*Number(latest.attempts)).toISOString();saveStore(getStore());
  }
 }}finally{running=false;}
}
