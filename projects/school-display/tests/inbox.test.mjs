import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';

// Lessons run on every weekday at fixed times; the change notices only compare
// what each teacher sees, so the test does not depend on the time of day.
const lesson=(id,classId,day,start,end,teacherEn,room='',extra={})=>({id,classId,day,type:'lesson',start,end,subjectEn:'Subject '+id,subjectAr:'',teacherEn,teacherAr:'',room,teacherImage:'',...extra});
const week=(classId,teacher,room)=>[0,1,2,3,4,5,6].map(day=>lesson(classId+day,classId,day,'08:00','08:45',teacher,room));

test('teacher inbox: two-way messages, acknowledgements, delivery tracking, change notices and permissions',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'school-inbox-')),app=await startServer({directory,port:0}),password=randomBytes(24).toString('hex');
 const api=async(path,{body,cookie='',bearer='',method}={})=>{const origin=bearer?'https://localhost':app.origin;const response=await fetch(app.origin+'/api/'+path,{method:method||(body===undefined?'GET':'POST'),headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json().catch(()=>null),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 try{
  await api('setup',{body:{name:'Owner',email:'owner@school.test',password}});const cookie=(await api('login',{body:{email:'owner@school.test',password}})).cookie;
  const a=(await api('classes',{body:{nameEn:'Class A',nameAr:''},cookie})).data.group,b=(await api('classes',{body:{nameEn:'Class B',nameAr:''},cookie})).data.group;
  assert.equal((await api('draft',{body:{schedule:[...week(a.id,'Sara Ali','R1'),...week(b.id,'Omar','R2')]},cookie,method:'PUT'})).status,200);
  assert.equal((await api('publish',{body:{},cookie})).status,200);
  for(const [name,email,classId,teacherName] of [['Sara','sara@school.test',a.id,'Sara Ali'],['Omar','omar@school.test',b.id,'Omar']])assert.equal((await api('users',{body:{name,email,password,role:'teacher',classIds:[classId],teacherName},cookie})).status,200);
  assert.equal((await api('users',{body:{name:'Coordinator',email:'coord@school.test',password,role:'coordinator',classIds:[]},cookie})).status,200);
  const users=app.store.get().users,sara=users.find(u=>u.email==='sara@school.test'),omar=users.find(u=>u.email==='omar@school.test');
  const sign=async email=>(await api('mobile/login',{body:{email,password},bearer:'x'})).data.token;
  const saraToken=await sign('sara@school.test'),omarToken=await sign('omar@school.test');

  // An important instruction to a group, with acknowledgement required.
  assert.equal((await api('teacher-messages',{body:{userIds:['teachers:'+a.id,omar.id],subject:'Exam duty',text:'Collect papers at 9',category:'meeting',priority:'important',requireAck:true},cookie})).data.count,2);
  let report=(await api('teacher-messages',{cookie})).data;assert.equal(report.batches.length,1);assert.deepEqual(report.batches[0].recipients.map(r=>r.app).sort(),['waiting','waiting']);
  assert.equal(report.batches[0].recipients[0].email,'not-configured','Email copies are reported separately until a provider is configured.');

  let view=(await api('mobile/timetable',{bearer:saraToken})).data;const message=view.messages.find(m=>m.subject==='Exam duty');
  assert.ok(message&&message.requireAck&&message.priority==='important'&&message.category==='meeting');
  assert.ok(view.preferences.hidePreview,'Lock-screen previews are hidden by default.');
  report=(await api('teacher-messages',{cookie})).data;const saraRow=report.batches[0].recipients.find(r=>r.userId===sara.id);
  assert.equal(saraRow.app,'delivered');assert.equal(saraRow.readAt,null);assert.equal(saraRow.ackAt,null);

  // Read and acknowledgement are tracked separately; repeating them is harmless.
  assert.equal((await api('mobile/read',{body:{ids:[message.id]},bearer:saraToken})).status,200);
  report=(await api('teacher-messages',{cookie})).data;assert.ok(report.batches[0].recipients.find(r=>r.userId===sara.id).readAt);assert.equal(report.batches[0].recipients.find(r=>r.userId===sara.id).ackAt,null);
  assert.equal((await api('mobile/ack',{body:{id:message.id},bearer:saraToken})).status,200);const firstAck=app.store.get().teacherMessages.find(m=>m.id===message.id).ackAt;
  assert.equal((await api('mobile/ack',{body:{id:message.id},bearer:saraToken})).status,200);assert.equal(app.store.get().teacherMessages.find(m=>m.id===message.id).ackAt,firstAck);
  assert.equal((await api('mobile/ack',{body:{id:message.id},bearer:omarToken})).status,404,'A teacher cannot acknowledge someone else’s message.');

  // Replies stay in the thread, are idempotent for offline retries and are private to their owner.
  const clientId='offline-reply-001';
  for(let i=0;i<2;i++)assert.equal((await api('mobile/reply',{body:{threadId:message.threadId,text:'I will be there',clientId},bearer:saraToken})).status,200);
  assert.equal(app.store.get().teacherMessages.filter(m=>m.clientId===clientId).length,1,'A retried reply is stored once.');
  assert.equal((await api('mobile/reply',{body:{threadId:message.threadId,text:'Not mine',clientId:'omar-reply-0001'},bearer:omarToken})).status,404);
  assert.equal((await api('mobile/reply',{body:{threadId:message.threadId,text:'No key'},bearer:saraToken})).status,400);
  report=(await api('teacher-messages',{cookie})).data;const conversation=report.conversations.find(c=>c.threadId===message.threadId);
  assert.equal(conversation.unread,1);assert.equal(conversation.messages.at(-1).text,'I will be there');
  assert.equal((await api('teacher-messages/reply',{body:{threadId:message.threadId,text:'Thank you'},cookie})).status,200);
  view=(await api('mobile/timetable',{bearer:saraToken})).data;assert.deepEqual(view.messages.filter(m=>m.threadId===message.threadId).map(m=>m.direction),['down','up','down']);
  assert.equal((await api('teacher-messages',{cookie})).data.conversations.find(c=>c.threadId===message.threadId).unread,0,'Answering marks the reply read.');
  assert.ok(!(await api('mobile/timetable',{bearer:omarToken})).data.messages.some(m=>m.threadId===message.threadId),'Omar never sees Sara’s thread.');

  // Coordinators may message and reply; only administrators set the urgent policy.
  const coordCookie=(await api('login',{body:{email:'coord@school.test',password}})).cookie;
  assert.equal((await api('teacher-messages',{cookie:coordCookie})).status,200);
  assert.equal((await api('message-policy',{body:{urgentBypassQuiet:false},cookie:coordCookie,method:'PUT'})).status,403);
  assert.equal((await api('message-policy',{body:{urgentBypassQuiet:false,noteEn:'Quiet hours apply to every alert.'},cookie,method:'PUT'})).status,200);
  assert.equal((await api('mobile/timetable',{bearer:saraToken})).data.policy.urgentBypassQuiet,false);

  // Preferences are validated on the server.
  assert.equal((await api('mobile/preferences',{body:{quietEnabled:true,quietStart:'22:00',quietEnd:'06:00',categories:{event:false}},bearer:saraToken})).status,200);
  assert.equal((await api('mobile/preferences',{body:{quietStart:'25:99'},bearer:saraToken})).status,400);
  const prefs=(await api('mobile/timetable',{bearer:saraToken})).data.preferences;assert.equal(prefs.quietStart,'22:00');assert.equal(prefs.categories.event,false);assert.equal(prefs.categories.urgent,true);

  // Publishing a room change and a cover assignment notifies exactly the affected teachers, once.
  const changed=[...week(a.id,'Sara Ali','R1').map(row=>row.day===0||row.day===1||row.day===2||row.day===3||row.day===4||row.day===5||row.day===6?{...row,room:'Lab 5'}:row),...week(b.id,'Omar','R2')];
  assert.equal((await api('draft',{body:{schedule:changed},cookie,method:'PUT'})).status,200);assert.equal((await api('publish',{body:{},cookie})).status,200);
  let saraNotices=(await api('mobile/timetable',{bearer:saraToken})).data.notices;assert.ok(saraNotices.length>=1);assert.ok(saraNotices.every(n=>n.kind==='room'&&n.before.room==='R1'&&n.after.room==='Lab 5'));
  assert.equal((await api('mobile/timetable',{bearer:omarToken})).data.notices.length,0,'Unaffected teachers get no notice.');
  const count=saraNotices.length;assert.equal((await api('publish',{body:{},cookie})).status,200);
  assert.equal((await api('mobile/timetable',{bearer:saraToken})).data.notices.length,count,'Republishing the same timetable never duplicates notices.');

  // Teachers acknowledge a change or report a conflict, which opens a thread for managers.
  const notice=saraNotices[0];
  assert.equal((await api('mobile/ack',{body:{noticeId:notice.id},bearer:saraToken})).status,200);
  assert.equal((await api('mobile/conflict',{body:{noticeId:notice.id,text:'Lab 5 is booked for exams',clientId:'conflict-report-01'},bearer:saraToken})).status,200);
  assert.equal((await api('mobile/conflict',{body:{noticeId:notice.id,text:'x',clientId:'conflict-report-02'},bearer:omarToken})).status,404);
  report=(await api('teacher-messages',{cookie})).data;
  const change=report.changes.find(c=>c.id===notice.id);assert.ok(change.ackAt&&change.deliveredAt);assert.equal(change.conflict.text,'Lab 5 is booked for exams');
  assert.ok(report.conversations.some(c=>c.category==='change'&&c.messages[0].text==='Lab 5 is booked for exams'));

  // A cancelled lesson is reported with its previous details.
  assert.equal((await api('draft',{body:{schedule:[...week(a.id,'Sara Ali','Lab 5').filter(row=>row.day!==new Date().getDay()),...week(b.id,'Omar','R2')]},cookie,method:'PUT'})).status,200);assert.equal((await api('publish',{body:{},cookie})).status,200);
  saraNotices=(await api('mobile/timetable',{bearer:saraToken})).data.notices;assert.ok(saraNotices.some(n=>n.kind==='cancelled'&&n.before&&!n.after));

  // Parents cannot use teacher-only actions.
  assert.equal((await api('mobile/reply',{body:{threadId:message.threadId,text:'x',clientId:'parent-reply-01'},bearer:'not-a-token'})).status,401);
 }finally{await app.close();}
});
