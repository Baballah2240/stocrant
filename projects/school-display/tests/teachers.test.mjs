import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {validateSchedule} from '../shared/schedule.mjs';
import {teacherDirectory,roomConflicts,freeTeachers,applyCover,teacherLessonsOn} from '../shared/teachers.mjs';
import {teacherNow,weekPlan,lessonReminders} from '../shared/teacher-plan.mjs';
const lesson=(id,classId,start,end,teacherEn,teacherAr='',room='',day=0)=>({id,classId,day,type:'lesson',start,end,subjectEn:'Subject '+id,subjectAr:'',teacherEn,teacherAr,room});
const week=[lesson('a1','a','07:30','08:15','Sara Ali','سارة علي','R1'),lesson('a2','a','08:15','09:00','Omar'),lesson('b1','b','07:30','08:15','Noura','','R1'),lesson('b2','b','08:15','09:00','Sara Ali'),lesson('c1','c','10:00','10:45','','سارة علي')];
const sunday='2026-10-25';

test('directory merges Arabic and English spellings of one teacher',()=>{
 const sara=teacherDirectory(week).find(entry=>entry.en==='Sara Ali');
 assert.equal(sara.ar,'سارة علي');assert.equal(teacherLessonsOn(week,[],sunday,sara.keys).length,3,'An Arabic-only lesson still belongs to the same teacher.');
 assert.equal(teacherDirectory([{...week[0],type:'break'}]).length,0,'Break supervisors are not teachers in the directory.');
});
test('room clashes need the same room, day and time in different classes',()=>{
 assert.deepEqual(roomConflicts(week).map(row=>[row.first,row.second,row.room]),[['a1','b1','R1']]);
 assert.equal(roomConflicts([week[0],{...week[2],day:1}]).length,0);
 assert.equal(roomConflicts([week[0],{...week[2],start:'08:15',end:'09:00'}]).length,0,'Back-to-back lessons do not clash.');
});
test('free teachers exclude the absent and busy, with the lightest day first',()=>{
 const sara=teacherDirectory(week).find(entry=>entry.en==='Sara Ali'),free=freeTeachers(week,[],sunday,{start:'07:30',end:'08:15'},sara.keys);
 assert.deepEqual(free.map(entry=>entry.en),['Omar'],'Noura teaches at 07:30 and Omar does not.');
 const later=freeTeachers(week,[],sunday,{start:'10:00',end:'10:45'},sara.keys);
 assert.deepEqual(later.map(entry=>entry.en),['Noura','Omar']);assert.deepEqual(later.map(entry=>entry.load),[1,1]);
});
test('cover creates a dated override, keeps the rest of the class day and leaves the week alone',()=>{
 const original=structuredClone(week);let ids=0;
 const next=applyCover({schedule:week,specialDays:[],date:sunday,assignments:[{classId:'a',id:'a1',teacherEn:'Noura',teacherAr:''}],makeId:()=>'s'+ ++ids});
 assert.equal(next.length,1);assert.equal(next[0].mode,'replace');assert.equal(next[0].schedule.length,2);
 const covered=next[0].schedule.find(row=>row.id==='a1');assert.equal(covered.teacherEn,'Noura');assert.equal(covered.substituteFor,'Sara Ali');assert.equal(next[0].schedule.find(row=>row.id==='a2').teacherEn,'Omar');
 assert.deepEqual(week,original);
 const again=applyCover({schedule:week,specialDays:next,date:sunday,assignments:[{classId:'a',id:'a1',teacherEn:'Omar',teacherAr:''}],makeId:()=>'unused'});
 assert.equal(again.length,1,'A second cover edits the same class and date.');assert.equal(again[0].schedule.find(row=>row.id==='a1').substituteFor,'Sara Ali','The originally absent teacher is remembered.');
 assert.equal(validateSchedule(again[0].schedule.map(row=>({...row,teacherImage:undefined,actionImage:undefined})))[0].substituteFor,'Sara Ali');
});
test('teacher day handles the current lesson, the next day, holidays and school timezone',()=>{
 const data={school:{timezone:'Asia/Qatar',holidays:[]},specialDays:[],schedule:[{...week[0],mine:true},{...week[1],mine:false},{...week[3],mine:true,day:1}]};
 const during=teacherNow(data,new Date('2026-10-25T04:45:00Z'));assert.equal(during.current.id,'a1');assert.equal(during.remaining,30*60);assert.ok(Math.abs(during.progress-1/3)<.001);
 const after=teacherNow(data,new Date('2026-10-25T09:00:00Z'));assert.equal(after.current,null);assert.equal(after.later.date,'2026-10-26');assert.equal(after.laterLesson.id,'b2');
 assert.equal(weekPlan(data,new Date('2026-10-24T21:30:00Z'),1)[0].date,'2026-10-25','The date rolls over in school time, not UTC.');
 assert.equal(teacherNow({...data,school:{...data.school,holidays:['2026-10-25']}},new Date('2026-10-25T04:45:00Z')).current,null);
});
test('reminders fire before future lessons of this teacher only, in school time',()=>{
 const data={school:{timezone:'Asia/Qatar',holidays:['2026-10-26']},specialDays:[],schedule:[{...week[0],mine:true},{...week[1],mine:false},{...week[3],mine:true,day:1}]};
 const rows=lessonReminders(data,new Date('2026-10-25T04:00:00Z'),10);
 assert.equal(rows[0].at,Date.parse('2026-10-25T04:20:00Z'));assert.ok(rows.every(row=>row.row.mine));assert.ok(!rows.some(row=>row.date==='2026-10-26'),'No reminders on a holiday.');
 assert.equal(new Set(rows.map(row=>row.id)).size,rows.length);
 assert.deepEqual(lessonReminders(data,new Date('2026-10-25T04:25:00Z'),10),[],'A lesson inside the lead time gets no late reminder.');
 assert.deepEqual(lessonReminders(data,new Date('2026-10-25T04:00:00Z'),0),[]);
});

test('teacher app API: read-only token, own lessons, cross-origin rules and revocation',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'school-teacher-')),app=await startServer({directory,port:0}),password=randomBytes(24).toString('hex');
 const api=async(path,{body,cookie='',bearer='',origin=app.origin,method}={})=>{const response=await fetch(app.origin+'/api/'+path,{method:method||(body===undefined?'GET':'POST'),headers:{...(origin?{Origin:origin}:{}),'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0],data:response.status===204?null:await response.json()};};
 try{
  await api('setup',{body:{name:'Owner',email:'owner@school.test',password}});const cookie=(await api('login',{body:{email:'owner@school.test',password}})).cookie;
  const a=(await api('classes',{body:{nameEn:'Class A',nameAr:''},cookie})).data.group,b=(await api('classes',{body:{nameEn:'Class B',nameAr:''},cookie})).data.group,c=(await api('classes',{body:{nameEn:'Class C',nameAr:''},cookie})).data.group;
  const schedule=[lesson('a1',a.id,'07:30','08:15','Sara Ali','سارة علي'),lesson('a2',a.id,'08:15','09:00','Omar'),lesson('b1',b.id,'09:00','09:45','Sara Ali'),lesson('c1',c.id,'07:30','08:15','Hidden Teacher'),lesson('c2',c.id,'10:00','10:45','Self Named')].map(row=>({...row,teacherImage:''}));
  assert.equal((await api('draft',{body:{schedule},cookie,method:'PUT'})).status,200);assert.equal((await api('publish',{body:{},cookie})).status,200);
  assert.equal((await api('users',{body:{name:'Sara',email:'sara@school.test',password,role:'teacher',classIds:[a.id],teacherName:'Sara Ali'},cookie})).status,200);
  assert.equal((await api('users',{body:{name:'Self Named',email:'self@school.test',password,role:'teacher',classIds:[a.id],teacherName:'Someone Else'},cookie})).status,200);

  assert.equal((await api('mobile/timetable')).status,401);
  assert.equal((await api('mobile/login',{body:{email:'sara@school.test',password:'wrong-password-value'},origin:'https://localhost'})).status,401);
  assert.equal((await api('mobile/login',{body:{email:'sara@school.test',password},origin:'https://evil.example'})).status,403,'Unknown web origins cannot use the teacher API.');
  const preflight=await api('mobile/timetable',{origin:'capacitor://localhost',method:'OPTIONS'});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'capacitor://localhost');assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
  const login=await api('mobile/login',{body:{email:'SARA@school.test ',password},origin:'https://localhost'});assert.equal(login.status,200);assert.equal(login.cookie,undefined,'The app receives a bearer token, not a cookie.');
  const token=login.data.token;assert.ok(!JSON.stringify(app.store.get().mobileTokens).includes(token),'Only a hash of the token is stored.');

  const view=await api('mobile/timetable',{bearer:token,origin:'https://localhost'});assert.equal(view.status,200);
  const byId=Object.fromEntries(view.data.schedule.map(row=>[row.id,row]));
  assert.equal(byId.a1.mine,true);assert.equal(byId.a2.mine,false,'A colleague in an assigned class is visible but not mine.');assert.equal(byId.b1.mine,true,'Own lessons appear from a class that is not assigned.');assert.equal(byId.c1,undefined,'Other classes stay private.');
  assert.equal(view.data.classes.some(row=>row.id===c.id),false);assert.equal(JSON.stringify(view.data).includes('hash'),false);

  // A self-chosen account name cannot pull lessons out of classes the teacher was not given.
  const self=(await api('mobile/login',{body:{email:'self@school.test',password},origin:'https://localhost'})).data.token;
  assert.equal((await api('account',{body:{name:'Hidden Teacher',email:'self@school.test',currentPassword:password,password},cookie:(await api('login',{body:{email:'self@school.test',password}})).cookie,method:'PUT'})).status,200);
  const relogged=(await api('mobile/login',{body:{email:'self@school.test',password},origin:'https://localhost'})).data.token;
  assert.equal((await api('mobile/timetable',{bearer:self})).status,401,'Changing an account revokes its app tokens.');
  assert.ok(!(await api('mobile/timetable',{bearer:relogged})).data.schedule.some(row=>row.id==='c1'));

  // The token reads the timetable and nothing else.
  for(const path of ['state','users','backup'])assert.equal((await api(path,{bearer:token})).status,401,path);
  assert.equal((await api('publish',{body:{},bearer:token})).status,401);
  assert.equal((await api('mobile/unknown',{bearer:token})).status,404);

  // Cover reaches both the substitute and the absent teacher after publishing, not before.
  const specialDays=applyCover({schedule:app.store.get().draft,specialDays:[],date:sunday,assignments:[{classId:a.id,id:'a1',teacherEn:'Omar',teacherAr:''}],makeId:()=>randomBytes(8).toString('hex')});
  assert.equal((await api('special-days',{body:{specialDays},cookie,method:'PUT'})).status,200);
  assert.equal((await api('mobile/timetable',{bearer:token})).data.specialDays.length,0,'Unpublished cover stays hidden.');
  assert.equal((await api('publish',{body:{},cookie})).status,200);
  const covered=(await api('mobile/timetable',{bearer:token})).data.specialDays[0].schedule.find(row=>row.id==='a1');assert.equal(covered.coveredBy,true);assert.equal(covered.mine,false);assert.equal(covered.teacherEn,'Omar');

  // Tokens survive a restart, then end with sign-out or when an administrator edits the account.
  const sara=app.store.get().users.find(row=>row.email==='sara@school.test');
  // Staff messages reach only the chosen teacher, and teachers cannot send them.
  assert.equal((await api('teacher-messages',{body:{userId:sara.id,text:'  Please see the office  '},cookie})).data.count,1);
  const inbox=(await api('mobile/timetable',{bearer:token})).data.messages;assert.equal(inbox.length,1);assert.equal(inbox[0].text,'Please see the office');assert.equal(inbox[0].fromName,'Owner');assert.equal(inbox[0].userId,undefined);
  assert.equal((await api('mobile/timetable',{bearer:relogged})).data.messages.length,0,'Another teacher cannot read it.');
  assert.equal((await api('teacher-messages',{body:{userId:'all',text:'Everyone'},cookie})).data.count,2);
  assert.equal((await api('teacher-messages',{body:{userId:sara.id,text:'   '},cookie})).status,400);assert.equal((await api('teacher-messages',{body:{userId:'unknown',text:'Hello'},cookie})).status,400);assert.equal((await api('teacher-messages',{body:{userId:sara.id,text:'x'.repeat(501)},cookie})).status,400);
  assert.equal((await api('teacher-messages',{body:{userId:'all',text:'Spoof'},bearer:token})).status,401,'The app token cannot send messages.');
  const teacherCookie=(await api('login',{body:{email:'sara@school.test',password}})).cookie;assert.equal((await api('teacher-messages',{body:{userId:'all',text:'Spoof'},cookie:teacherCookie})).status,403,'Teachers cannot send messages.');
  const other=(await api('mobile/login',{body:{email:'sara@school.test',password}})).data.token;
  assert.equal((await api('mobile/logout',{body:{},bearer:other})).status,200);assert.equal((await api('mobile/timetable',{bearer:other})).status,401);
  assert.equal((await api('mobile/timetable',{bearer:token})).status,200,'Signing out one phone leaves the other signed in.');
  assert.equal((await api('users',{body:{id:sara.id,active:false},cookie,method:'PUT'})).status,200);
  assert.equal((await api('mobile/timetable',{bearer:token})).status,401,'Disabling a teacher ends app access at once.');
  // Existing control-panel protection is unchanged.
  assert.equal((await api('publish',{body:{},cookie,origin:'https://localhost'})).status,403,'App origins cannot reach control-panel routes.');
 }finally{await app.close();}
});
