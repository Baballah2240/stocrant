import {communityNotices} from './community.mjs';
import {readFileSync} from 'node:fs';
import {createSign,createHash,randomBytes} from 'node:crypto';
import {schoolClock} from '../shared/schedule.mjs';
import {preferencesOf} from './inbox.mjs';

// Push notifications through Firebase Cloud Messaging (HTTP v1).
// The service-account key stays on the server (SCHOOL_FCM_SERVICE_ACCOUNT points to it).
// Jobs are queued in the state, deduplicated per user and item, retried with backoff,
// held during quiet hours and recorded so managers can see what happened.

const bad=(message,status=400)=>Object.assign(Error(message),{status});
const b64url=value=>Buffer.from(value).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');

/** Real FCM sender. Returns null when push is not configured. */
export function fcmSender(path=process.env.SCHOOL_FCM_SERVICE_ACCOUNT,fetchImpl=fetch){
 if(!path)return null;
 let account;try{account=JSON.parse(readFileSync(path,'utf8'));}catch{throw Error('SCHOOL_FCM_SERVICE_ACCOUNT does not point to a readable Firebase service-account JSON file.');}
 if(account.type!=='service_account'||!account.private_key||!account.client_email||!account.project_id)throw Error('The Firebase file is not a service-account key.');
 let cached=null;
 async function accessToken(){
  if(cached&&cached.expires>Date.now()+60000)return cached.token;
  const now=Math.floor(Date.now()/1000),header=b64url(JSON.stringify({alg:'RS256',typ:'JWT'})),claims=b64url(JSON.stringify({iss:account.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:account.token_uri||'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const signature=createSign('RSA-SHA256').update(header+'.'+claims).sign(account.private_key,'base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
  const res=await fetchImpl(account.token_uri||'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${header}.${claims}.${signature}`}),signal:AbortSignal.timeout(15000)});
  const body=await res.json().catch(()=>({}));if(!res.ok||!body.access_token)throw Object.assign(Error('Firebase sign-in failed.'),{retry:true});
  cached={token:body.access_token,expires:Date.now()+(body.expires_in||3600)*1000};return cached.token;
 }
 return {
  projectId:account.project_id,
  async send(token,message){
   const res=await fetchImpl(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,{method:'POST',headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json'},body:JSON.stringify({message:{token,notification:{title:message.title,body:message.body},data:message.data,android:{priority:message.urgent?'HIGH':'NORMAL',notification:{channel_id:message.urgent?'faslii-urgent':'faslii',visibility:'PRIVATE',tag:message.tag}}}}),signal:AbortSignal.timeout(15000)});
   if(res.ok)return {ok:true};
   const body=await res.json().catch(()=>({})),code=body.error?.details?.find(d=>d.errorCode)?.errorCode||body.error?.status||String(res.status);
   return {ok:false,code,unregistered:['UNREGISTERED','INVALID_ARGUMENT','NOT_FOUND'].includes(code)||res.status===404,retry:res.status===429||res.status>=500};
  }
 };
}

export function ensurePush(state){state.pushTokens ??= [];state.pushJobs ??= [];}

/** A phone registers (or refreshes) its FCM token for the signed-in user. */
export function registerPushToken(state,user,body,now=Date.now()){
 ensurePush(state);
 if(typeof body.token!=='string'||!/^[A-Za-z0-9_:\-.]{20,4096}$/.test(body.token))throw bad('Invalid notification token.');
 const hash=createHash('sha256').update(body.token).digest('hex');
 state.pushTokens=state.pushTokens.filter(row=>row.hash!==hash).filter(row=>!(row.userId===user.id&&row.deviceId&&row.deviceId===body.deviceId));
 state.pushTokens.push({hash,token:body.token,userId:user.id,deviceId:typeof body.deviceId==='string'?body.deviceId.slice(0,64):'',platform:body.platform==='ios'?'ios':'android',at:new Date(now).toISOString()});
 const mine=state.pushTokens.filter(row=>row.userId===user.id);if(mine.length>5){const drop=new Set(mine.slice(0,mine.length-5).map(row=>row.hash));state.pushTokens=state.pushTokens.filter(row=>!drop.has(row.hash));}
 return true;
}
export const removePushTokens=(state,userId)=>{ensurePush(state);state.pushTokens=state.pushTokens.filter(row=>row.userId!==userId);};
export function unregisterPushToken(state,user,token){ensurePush(state);if(typeof token!=='string')return;const hash=createHash('sha256').update(token).digest('hex');state.pushTokens=state.pushTokens.filter(row=>!(row.userId===user.id&&row.hash===hash));}

const titles={message:['New message from school','رسالة جديدة من المدرسة'],announcement:['School announcement','إعلان من المدرسة'],meeting:['Meeting invitation','دعوة إلى اجتماع'],event:['School event','فعالية مدرسية'],urgent:['Urgent alert','تنبيه عاجل'],change:['Timetable change','تغيير في الجدول'],reply:['New reply from the school','رد جديد من المدرسة'],request:['Request answered','تمت الإجابة على الطلب'],resource:['Document updated','تم تحديث مستند']};
/**
 * Queue one push per user and item. `item` = {key, category, priority, kind, text, data}.
 * The key makes enqueueing idempotent, so republishing never sends twice.
 */
export function enqueuePush(state,userIds,item,now=Date.now()){
 ensurePush(state);const known=new Set(state.pushJobs.map(job=>job.key)),created=[];
 for(const userId of new Set(userIds)){
  const key=`${userId}:${item.key}`;if(known.has(key))continue;known.add(key);
  const job={id:randomBytes(12).toString('hex'),key,userId,kind:item.kind||item.category,category:item.category,priority:item.priority||'normal',text:String(item.text||'').slice(0,240),data:item.data||{},status:'queued',attempts:0,nextAt:now,at:new Date(now).toISOString(),sentAt:null,error:null};
  state.pushJobs.push(job);created.push(job);
 }
 state.pushJobs=state.pushJobs.filter(job=>now-Date.parse(job.at)<30*86400000).slice(-5000);
 return created;
}
const minutesOf=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
/** When does the user's quiet period end (ms), or null if not quiet now. */
export function quietUntil(prefs,timezone,now=Date.now()){
 if(!prefs.quietEnabled)return null;
 const clock=schoolClock(new Date(now),timezone),minute=Math.floor(clock.seconds/60),start=minutesOf(prefs.quietStart),end=minutesOf(prefs.quietEnd);
 const quiet=start<=end?minute>=start&&minute<end:minute>=start||minute<end;if(!quiet)return null;
 const wait=((end-minute+1440)%1440)||1440;return now+wait*60000-(clock.seconds%60)*1000;
}

/** Sends due jobs. Returns a summary; never throws for individual failures. */
export async function deliverPush(state,sender,now=Date.now(),limit=50){
 ensurePush(state);const summary={sent:0,failed:0,held:0,skipped:0};
 if(!sender)return summary;
 const users=new Map(state.users.map(user=>[user.id,user])),policy=state.messagePolicy||{urgentBypassQuiet:true};
 for(const job of state.pushJobs.filter(row=>(row.status==='queued'||row.status==='retry'||row.status==='held')&&row.nextAt<=now).slice(0,limit)){
  const user=users.get(job.userId),prefs=user?preferencesOf(user):null;
  if(!user||user.active===false){job.status='skipped';job.error='Account inactive';summary.skipped++;continue;}
  const noticeId=job.data?.communityNotice||(job.key.startsWith(job.userId+':community:')?job.key.slice((job.userId+':community:').length):null);
  if(noticeId){
   const notice=communityNotices(state,user.role).find(row=>row.id===noticeId);
   if(!notice){job.status='skipped';job.error='School notification unavailable';summary.skipped++;continue;}
   job.text=(notice.title+': '+notice.text).slice(0,240);
  }
  if(prefs.categories[job.category]===false&&!(job.priority==='urgent'&&policy.urgentBypassQuiet)){job.status='skipped';job.error='Turned off by the teacher';summary.skipped++;continue;}
  const until=job.priority==='urgent'&&policy.urgentBypassQuiet?null:quietUntil(prefs,state.settings.timezone,now);
  if(until){job.status='held';job.nextAt=until;job.error='Quiet hours';summary.held++;continue;}
  const tokens=state.pushTokens.filter(row=>row.userId===job.userId);
  if(!tokens.length){job.status='skipped';job.error='No phone registered';summary.skipped++;continue;}
  const [en,ar]=titles[job.kind]||titles[job.category]||titles.message,arabic=state.settings.language==='ar';
  const message={title:arabic?ar:en,body:prefs.hidePreview?(arabic?'افتح فصلي للاطلاع.':'Open Faslii to read it.'):job.text||(arabic?'افتح فصلي للاطلاع.':'Open Faslii to read it.'),data:Object.fromEntries(Object.entries({...job.data,kind:job.kind}).map(([k,v])=>[k,String(v)])),urgent:job.priority==='urgent',hidden:prefs.hidePreview,tag:job.key.slice(-60)};
  let delivered=0,retry=false,lastError=null;
  for(const token of tokens){
   let result;try{result=await sender.send(token.token,message);}catch(error){result={ok:false,retry:true,code:error.message};}
   if(result.ok)delivered++;else{lastError=result.code;if(result.unregistered)state.pushTokens=state.pushTokens.filter(row=>row.hash!==token.hash);if(result.retry)retry=true;}
  }
  job.attempts++;
  if(delivered){job.status='sent';job.sentAt=new Date(now).toISOString();job.error=null;summary.sent++;}
  else if(retry&&job.attempts<5){job.status='retry';job.nextAt=now+Math.min(30,2**job.attempts)*60000;job.error=lastError;summary.failed++;}
  else{job.status='failed';job.error=lastError||'Delivery failed';summary.failed++;}
 }
 return summary;
}
/** Push status for one user and item key, for the delivery report. */
export function pushStatus(state,userId,key,configured){
 if(!configured)return 'not-configured';
 const job=(state.pushJobs||[]).find(row=>row.key===`${userId}:${key}`);
 return job?job.status:'none';
}
