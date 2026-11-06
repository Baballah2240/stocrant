import {createHash,randomBytes} from 'node:crypto';
import {weekPlan} from '../shared/teacher-plan.mjs';

// Two-way school messages, acknowledgements, delivery tracking, timetable change
// notices and notification preferences for the teacher app.
// Every function receives the stored state and the acting user; nothing here
// trusts identifiers from the client without checking ownership.

export const categories=['message','announcement','meeting','event','urgent','change'];
export const priorities=['normal','important','urgent'];
const messageLife=30*86400000,noticeLife=30*86400000,id=()=>randomBytes(16).toString('hex');
const bad=(message,status=400)=>Object.assign(Error(message),{status});
const cleanText=(value,max)=>{const text=typeof value==='string'?value.trim():'';if(!text||text.length>max)throw bad(`Write a message of up to ${max} characters.`);return text;};
const clientKey=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,64}$/.test(value)?value:null;
const iso=now=>new Date(now).toISOString();

export function ensureInbox(state){
 state.teacherMessages ??= [];state.scheduleNotices ??= [];
 state.messagePolicy ??= {urgentBypassQuiet:true,noteEn:'Urgent safety alerts from the school administration still sound during quiet hours.',noteAr:'تصل التنبيهات العاجلة المتعلقة بالسلامة من إدارة المدرسة حتى أثناء ساعات الهدوء.'};
 for(const row of state.teacherMessages){row.threadId ??= row.id;row.direction ??= 'down';row.category ??= 'message';row.priority ??= 'normal';row.requireAck ??= false;row.batchId ??= row.id;}
}
const prune=(state,now)=>{state.teacherMessages=state.teacherMessages.filter(row=>now-Date.parse(row.at)<messageLife).slice(-4000);state.scheduleNotices=state.scheduleNotices.filter(row=>now-Date.parse(row.at)<noticeLife).slice(-4000);};

/** Staff → teachers/parents. Targets use the same rules as the original sender. */
export function sendTeacherMessage(state,sender,body,now=Date.now()){
 ensureInbox(state);
 const text=cleanText(body.text,500),active=state.users.filter(user=>user.active!==false),teachers=active.filter(user=>user.role==='teacher'),parents=active.filter(user=>user.role==='parent');
 const list=Array.isArray(body.userIds)?body.userIds.map(String):[String(body.userId||'')];
 const targets=new Map();
 for(const target of list){
  const classStudents=target.startsWith('class:')?state.students.filter(row=>row.classId===target.slice(6)).map(row=>row.id):[];
  const teachersOfClass=target.startsWith('teachers:')?teachers.filter(user=>user.classIds.includes(target.slice(9))):[];
  const found=target==='all'?teachers:target==='parents'?parents:target.startsWith('class:')?parents.filter(user=>user.studentIds.some(sid=>classStudents.includes(sid))):target.startsWith('teachers:')?teachersOfClass:[...teachers,...parents].filter(user=>user.id===target);
  for(const user of found)targets.set(user.id,user);
 }
 if(!targets.size)throw bad('Choose who should receive this message.');
 const category=categories.includes(body.category)&&body.category!=='change'?body.category:'message',priority=priorities.includes(body.priority)?body.priority:category==='urgent'?'urgent':'normal';
 const subject=typeof body.subject==='string'?body.subject.trim().slice(0,120):'',batchId=id(),at=iso(now);
 const rows=[...targets.values()].map(user=>{const rowId=id();return {id:rowId,threadId:rowId,batchId,userId:user.id,direction:'down',fromId:sender.id,fromName:sender.name,subject,text,category,priority,requireAck:body.requireAck===true,at,deliveredAt:null,readAt:null,ackAt:null};});
 prune(state,now);state.teacherMessages.push(...rows);
 state.lastSentRows=rows;return rows.length;
}

/** A teacher replies inside one of their own threads. Idempotent by clientId so offline retries never duplicate. */
export function replyAsTeacher(state,user,body,now=Date.now()){
 ensureInbox(state);
 const key=clientKey(body.clientId);if(!key)throw bad('Missing reply reference.');
 const existing=state.teacherMessages.find(row=>row.clientId===key&&row.fromId===user.id);if(existing)return existing;
 const root=state.teacherMessages.find(row=>row.threadId===body.threadId&&row.userId===user.id);if(!root)throw bad('Conversation not found.',404);
 const row={id:id(),threadId:root.threadId,batchId:root.batchId,userId:user.id,direction:'up',fromId:user.id,fromName:user.name,subject:'',text:cleanText(body.text,2000),category:root.category,priority:'normal',requireAck:false,at:iso(now),clientId:key,deliveredAt:iso(now),readAt:null,ackAt:null};
 state.teacherMessages.push(row);return row;
}

/** Staff answer a teacher's reply in the same thread. */
export function replyAsStaff(state,sender,body,now=Date.now()){
 ensureInbox(state);
 const root=state.teacherMessages.find(row=>row.threadId===body.threadId);if(!root)throw bad('Conversation not found.',404);
 const row={id:id(),threadId:root.threadId,batchId:root.batchId,userId:root.userId,direction:'down',fromId:sender.id,fromName:sender.name,subject:'',text:cleanText(body.text,2000),category:root.category,priority:'normal',requireAck:false,at:iso(now),deliveredAt:null,readAt:null,ackAt:null};
 state.teacherMessages.push(row);
 for(const item of state.teacherMessages)if(item.threadId===root.threadId&&item.direction==='up'&&!item.readAt)item.readAt=iso(now);
 return row;
}

/** Marks messages and notices delivered the first time the owner's app receives them. Returns true when anything changed. */
export function markDelivered(state,user,now=Date.now()){
 ensureInbox(state);let changed=false;const at=iso(now);
 for(const row of state.teacherMessages)if(row.userId===user.id&&row.direction==='down'&&!row.deliveredAt){row.deliveredAt=at;changed=true;}
 for(const row of state.scheduleNotices)if(row.userId===user.id&&!row.deliveredAt){row.deliveredAt=at;changed=true;}
 return changed;
}
export function markRead(state,user,body,now=Date.now()){
 ensureInbox(state);const ids=new Set([...(Array.isArray(body.ids)?body.ids:[]),...(Array.isArray(body.noticeIds)?body.noticeIds:[])].map(String).slice(0,500)),at=iso(now);let count=0;
 for(const row of state.teacherMessages)if(row.userId===user.id&&row.direction==='down'&&ids.has(row.id)&&!row.readAt){row.readAt=at;row.deliveredAt ??= at;count++;}
 for(const row of state.scheduleNotices)if(row.userId===user.id&&ids.has(row.id)&&!row.readAt){row.readAt=at;row.deliveredAt ??= at;count++;}
 return count;
}
/** "Acknowledged" for an important instruction or an assignment. Repeating it is harmless. */
export function acknowledge(state,user,body,now=Date.now()){
 ensureInbox(state);const at=iso(now);
 const message=body.id&&state.teacherMessages.find(row=>row.id===body.id&&row.userId===user.id&&row.direction==='down');
 const notice=body.noticeId&&state.scheduleNotices.find(row=>row.id===body.noticeId&&row.userId===user.id);
 const target=message||notice;if(!target)throw bad('Item not found.',404);
 target.ackAt ??= at;target.readAt ??= at;target.deliveredAt ??= at;return target;
}
/** A teacher reports a conflict with a timetable change; it opens a thread that managers see. */
export function reportConflict(state,user,body,now=Date.now()){
 ensureInbox(state);
 const key=clientKey(body.clientId);if(!key)throw bad('Missing report reference.');
 const existing=state.teacherMessages.find(row=>row.clientId===key&&row.fromId===user.id);if(existing)return existing;
 const notice=state.scheduleNotices.find(row=>row.id===body.noticeId&&row.userId===user.id);if(!notice)throw bad('Change not found.',404);
 const text=cleanText(body.text,1000),rowId=id();
 const row={id:rowId,threadId:rowId,batchId:'conflict:'+notice.id,userId:user.id,direction:'up',fromId:user.id,fromName:user.name,subject:'Conflict: '+describe(notice),text,category:'change',priority:'important',requireAck:false,at:iso(now),clientId:key,noticeId:notice.id,deliveredAt:iso(now),readAt:null,ackAt:null};
 state.teacherMessages.push(row);notice.conflict={text,at:iso(now),threadId:rowId};notice.readAt ??= iso(now);return row;
}
const describe=notice=>{const row=notice.after||notice.before||{};return `${row.subjectEn||row.subjectAr||''} ${notice.date} ${row.start||''}`.trim();};

const clock=/^([01]\d|2[0-3]):[0-5]\d$/;
export const defaultPreferences=()=>({categories:Object.fromEntries(categories.map(key=>[key,true])),reminderMinutes:10,lessonStart:false,lessonEnd:false,quietEnabled:false,quietStart:'21:00',quietEnd:'06:30',hidePreview:true});
export function preferencesOf(user){const base=defaultPreferences(),saved=user.preferences||{};return {...base,...saved,categories:{...base.categories,...saved.categories||{}}};}
export function savePreferences(user,body){
 const next=preferencesOf(user);
 if(body.categories&&typeof body.categories==='object')for(const key of categories)if(typeof body.categories[key]==='boolean')next.categories[key]=body.categories[key];
 if([0,5,10,15,30].includes(body.reminderMinutes))next.reminderMinutes=body.reminderMinutes;
 for(const key of ['lessonStart','lessonEnd','quietEnabled','hidePreview'])if(typeof body[key]==='boolean')next[key]=body[key];
 for(const key of ['quietStart','quietEnd'])if(body[key]!==undefined){if(typeof body[key]!=='string'||!clock.test(body[key]))throw bad('Use a time such as 21:00.');next[key]=body[key];}
 user.preferences=next;return next;
}
export function savePolicy(state,body){
 ensureInbox(state);
 if(typeof body.urgentBypassQuiet!=='boolean')throw bad('Choose whether urgent alerts may sound during quiet hours.');
 const note=(value,fallback)=>typeof value==='string'?value.trim().slice(0,300):fallback;
 state.messagePolicy={urgentBypassQuiet:body.urgentBypassQuiet,noteEn:note(body.noteEn,state.messagePolicy.noteEn),noteAr:note(body.noteAr,state.messagePolicy.noteAr)};
 return state.messagePolicy;
}

/** The slice of messages and notices a teacher's app may see. */
export function inboxPayload(state,user,now=Date.now()){
 ensureInbox(state);
 const mine=state.teacherMessages.filter(row=>row.userId===user.id&&now-Date.parse(row.at)<messageLife);
 const shape=({id,threadId,direction,fromName,subject,text,category,priority,requireAck,at,readAt,ackAt,clientId,noticeId})=>({id,threadId,direction,fromName,subject,text,category,priority,requireAck,at,readAt,ackAt,clientId:clientId||null,noticeId:noticeId||null});
 return {
  messages:mine.slice(-200).map(shape),
  notices:state.scheduleNotices.filter(row=>row.userId===user.id&&now-Date.parse(row.at)<noticeLife).slice(-100).map(({id,kind,date,before,after,at,readAt,ackAt,conflict,revision})=>({id,kind,date,before,after,at,readAt,ackAt,revision,conflict:conflict?{text:conflict.text,at:conflict.at}:null})),
  preferences:preferencesOf(user),
  policy:state.messagePolicy
 };
}

/** Delivery results for managers: per batch, per recipient, plus open threads with replies. */
export function deliveryReport(state,now=Date.now()){
 ensureInbox(state);
 const users=new Map(state.users.map(user=>[user.id,user])),name=uid=>users.get(uid)?.name||'Removed account';
 const recent=state.teacherMessages.filter(row=>now-Date.parse(row.at)<messageLife);
 const batches=new Map();
 for(const row of recent)if(row.direction==='down'&&row.threadId===row.id){
  const batch=batches.get(row.batchId)||{batchId:row.batchId,subject:row.subject,text:row.text,category:row.category,priority:row.priority,requireAck:row.requireAck,at:row.at,fromName:row.fromName,recipients:[]};
  batch.recipients.push({userId:row.userId,threadId:row.threadId,name:name(row.userId),role:users.get(row.userId)?.role||'',app:row.deliveredAt?'delivered':'waiting',deliveredAt:row.deliveredAt,readAt:row.readAt,ackAt:row.ackAt,email:'not-configured',push:'not-configured'});
  batches.set(row.batchId,batch);
 }
 const threads=new Map();
 for(const row of recent){const list=threads.get(row.threadId)||[];list.push(row);threads.set(row.threadId,list);}
 const conversations=[...threads.entries()].filter(([,rows])=>rows.some(row=>row.direction==='up')).map(([threadId,rows])=>{rows.sort((a,b)=>a.at.localeCompare(b.at));const root=rows[0];return {threadId,teacher:name(root.userId),subject:root.subject||'',category:root.category,unread:rows.filter(row=>row.direction==='up'&&!row.readAt).length,messages:rows.map(({id,direction,fromName,text,at,readAt})=>({id,direction,fromName,text,at,readAt}))};}).sort((a,b)=>b.messages.at(-1).at.localeCompare(a.messages.at(-1).at));
 const changes=state.scheduleNotices.filter(row=>now-Date.parse(row.at)<noticeLife).map(row=>({id:row.id,teacher:name(row.userId),kind:row.kind,date:row.date,before:row.before,after:row.after,at:row.at,deliveredAt:row.deliveredAt||null,readAt:row.readAt||null,ackAt:row.ackAt||null,conflict:row.conflict||null}));
 return {batches:[...batches.values()].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,50),conversations:conversations.slice(0,50),changes:changes.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,100),policy:state.messagePolicy,channels:{app:true,push:false,email:false}};
}

// ---------- Timetable change notices ----------
const pickRow=row=>row?{subjectEn:row.subjectEn||'',subjectAr:row.subjectAr||'',start:row.start,end:row.end,room:row.room||'',classId:row.classId,teacherEn:row.teacherEn||'',teacherAr:row.teacherAr||'',substituteFor:row.substituteFor||''}:null;
const lessonsOf=(payload,now,days)=>{const out=new Map();for(const day of weekPlan(payload,new Date(now),days))for(const row of day.rows)if(row.type==='lesson'&&(row.mine||row.coveredBy))out.set(`${day.date}|${row.classId}|${row.start}|${row.subjectEn||row.subjectAr}`,{date:day.date,row});return out;};
/**
 * Compares what each teacher sees before and after a publication over the next
 * `days` days and records one notice per real change. `payloadFor(state,user)`
 * is the teacher timetable builder, so permissions are identical to the app.
 */
export function recordScheduleChanges(before,after,payloadFor,now=Date.now(),days=14){
 ensureInbox(after);
 const teachers=after.users.filter(user=>user.role==='teacher'&&user.active!==false),created=[];
 for(const user of teachers){
  let old,fresh;try{old=lessonsOf(payloadFor(before,user,now),now,days);fresh=lessonsOf(payloadFor(after,user,now),now,days);}catch{continue;}
  const loose=map=>{const out=new Map();for(const [key,value] of map){const k=key.split('|');const lk=`${k[0]}|${k[1]}|${k[3]}`;if(!out.has(lk))out.set(lk,{key,...value});}return out;};
  const oldLoose=loose(old),freshLoose=loose(fresh),handled=new Set();const push=(kind,date,b,a)=>created.push({user,kind,date,before:pickRow(b),after:pickRow(a)});
  for(const [key,{date,row}] of old){
   const next=fresh.get(key);
   if(next){handled.add(key);const n=next.row;
    if(row.mine&&!n.mine&&n.coveredBy)push('covered',date,row,n);
    else if(!row.substituteFor&&n.substituteFor&&n.mine)push('substitute',date,row,n);
    else if((row.room||'')!==(n.room||''))push('room',date,row,n);
    else if(row.end!==n.end)push('time',date,row,n);
    continue;}
   const k=key.split('|'),moved=freshLoose.get(`${k[0]}|${k[1]}|${k[3]}`);
   if(moved&&!old.has(moved.key)){handled.add(moved.key);push('time',date,row,moved.row);}
   else push('cancelled',date,row,null);
  }
  for(const [key,{date,row}] of fresh)if(!handled.has(key)&&!old.has(key))push(row.substituteFor&&row.mine?'substitute':'added',date,null,row);
 }
 const seen=new Set(after.scheduleNotices.map(row=>row.hash));
 const rows=[];
 for(const item of created){
  const hash=createHash('sha256').update(JSON.stringify([item.user.id,item.kind,item.date,item.before,item.after])).digest('hex');
  if(seen.has(hash))continue;seen.add(hash);
  rows.push({id:id(),hash,userId:item.user.id,kind:item.kind,date:item.date,before:item.before,after:item.after,at:iso(now),revision:after.revision,deliveredAt:null,readAt:null,ackAt:null,conflict:null});
 }
 prune(after,now);after.scheduleNotices.push(...rows);
 after.lastNoticeRows=rows;return rows.length;
}
