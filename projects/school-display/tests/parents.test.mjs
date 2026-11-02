import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
const qatarDate=(offset=0)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));
const lesson=(id,classId,teacherEn)=>({id,classId,day:0,type:'lesson',start:'07:30',end:'08:15',subjectEn:'Subject '+id,subjectAr:'',teacherEn,teacherAr:'',room:''});

test('parents: invitation, own children only, attendance, work and absence, with role limits',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'school-parent-')),app=await startServer({directory,port:0,updateEnv:{}}),password=randomBytes(24).toString('hex');
 const api=async(path,{body,cookie='',bearer='',method}={})=>{const response=await fetch(app.origin+'/api/'+path,{method:method||(body===undefined?'GET':'POST'),headers:{Origin:app.origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0],data:await response.json()};};
 try{
  await api('setup',{body:{name:'Owner',email:'owner@school.test',password}});const cookie=(await api('login',{body:{email:'owner@school.test',password}})).cookie;
  const a=(await api('classes',{body:{nameEn:'Grade 6A',nameAr:'السادس أ'},cookie})).data.group,b=(await api('classes',{body:{nameEn:'Grade 7B',nameAr:''},cookie})).data.group;
  await api('draft',{body:{schedule:[lesson('a1',a.id,'Sara Ali'),lesson('b1',b.id,'Omar')]},cookie,method:'PUT'});await api('publish',{body:{},cookie});
  await api('users',{body:{name:'Sara',email:'sara@school.test',password,role:'teacher',classIds:[a.id],teacherName:'Sara Ali'},cookie});
  const ali=(await api('students',{body:{nameEn:'Ali',nameAr:'علي',classId:a.id},cookie})).data.student,huda=(await api('students',{body:{nameEn:'Huda',nameAr:'',classId:b.id},cookie})).data.student;
  assert.equal((await api('students/import',{body:{rows:[{nameEn:'Ok',nameAr:'',className:'Grade 6A'},{nameEn:'Bad',nameAr:'',className:'No such class'}]},cookie})).status,400);assert.equal(app.store.get().students.length,2,'A bad line imports nothing.');
  assert.equal((await api('students/import',{body:{rows:[{nameEn:'Noor',nameAr:'',className:'السادس أ'}]},cookie})).data.count,1);
  const noor=app.store.get().students.at(-1);

  // Invitation codes are stored hashed, work once, and cannot be guessed.
  const code=(await api('parent-invites',{body:{studentId:ali.id},cookie})).data.code;assert.match(code,/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);assert.ok(!JSON.stringify(app.store.get().parentInvites).includes(code.replace('-','')));
  const register=body=>api('mobile/parent/register',{body:{name:'Parent One',email:'parent@home.test',password,...body}});
  assert.equal((await register({code:'AAAAA-AAAAA'})).status,400);assert.equal(app.store.get().users.some(row=>row.role==='parent'),false);
  assert.equal((await register({code,email:'sara@school.test'})).status,409,'A staff email cannot become a parent account.');
  const parentToken=(await register({code:code.toLowerCase().replace('-',' ')})).data.token;assert.ok(parentToken);
  assert.equal((await register({code,email:'second@home.test'})).status,400,'A code works once.');

  const view=(await api('mobile/timetable',{bearer:parentToken})).data;
  assert.equal(view.role,'parent');assert.deepEqual(view.children.map(row=>row.id),[ali.id]);assert.deepEqual(view.students.map(row=>row.id),[ali.id],'Classmates are hidden.');assert.deepEqual(view.schedule.map(row=>row.id),['a1']);assert.deepEqual(view.classes.map(row=>row.id),[a.id]);assert.ok(!JSON.stringify(view).includes('Huda')&&!JSON.stringify(view).includes('Noor'));

  // Parents use only the app and cannot perform teacher actions.
  assert.equal((await api('login',{body:{email:'parent@home.test',password}})).status,401,'Parents cannot open the control panel.');
  assert.equal((await api('mobile/attendance',{body:{classId:a.id,date:qatarDate(),entries:[{studentId:ali.id,status:'present'}]},bearer:parentToken})).status,403);
  assert.equal((await api('mobile/work',{body:{classId:a.id,type:'homework',title:'x',dueDate:qatarDate()},bearer:parentToken})).status,403);
  assert.equal((await api('users',{cookie})).data.users.some(row=>row.email==='parent@home.test'),false,'Parents stay out of the staff list.');

  // Teachers act only on their classes.
  const teacher=(await api('mobile/login',{body:{email:'sara@school.test',password}})).data.token,teacherView=(await api('mobile/timetable',{bearer:teacher})).data;
  assert.deepEqual(teacherView.students.map(row=>row.id).sort(),[ali.id,noor.id].sort());
  assert.equal((await api('mobile/attendance',{body:{classId:b.id,date:qatarDate(),entries:[{studentId:huda.id,status:'absent'}]},bearer:teacher})).status,403);
  assert.equal((await api('mobile/attendance',{body:{classId:a.id,date:qatarDate(),entries:[{studentId:huda.id,status:'absent'}]},bearer:teacher})).status,400,'A student from another class is rejected.');
  assert.equal((await api('mobile/attendance',{body:{classId:a.id,date:qatarDate(1),entries:[{studentId:ali.id,status:'absent'}]},bearer:teacher})).status,400,'Future dates are rejected.');
  assert.equal((await api('mobile/attendance',{body:{classId:a.id,date:qatarDate(),entries:[{studentId:ali.id,status:'absent'},{studentId:noor.id,status:'present'}]},bearer:teacher})).data.count,2);
  assert.equal((await api('mobile/attendance',{body:{classId:a.id,date:qatarDate(),entries:[{studentId:ali.id,status:'late'}]},bearer:teacher})).status,200);
  const marks=(await api('mobile/timetable',{bearer:parentToken})).data.attendance;assert.equal(marks.length,1,'Parents see only their child, and a correction replaces the old mark.');assert.equal(marks[0].status,'late');
  assert.equal((await api('mobile/work',{body:{classId:b.id,type:'exam',title:'Other',dueDate:qatarDate(2)},bearer:teacher})).status,403);
  const work=(await api('mobile/work',{body:{classId:a.id,type:'exam',title:'Maths exam',details:'Chapter 3',dueDate:qatarDate(2)},bearer:teacher})).data.item;
  assert.equal((await api('mobile/timetable',{bearer:parentToken})).data.work[0].title,'Maths exam');assert.equal((await api('mobile/timetable',{bearer:parentToken})).data.work[0].byId,undefined);

  // Absence requests: own child only, then a decision reaches attendance.
  assert.equal((await api('mobile/absence',{body:{studentId:huda.id,from:qatarDate(1),to:qatarDate(1)},bearer:parentToken})).status,404,"Another family's child is rejected.");
  assert.equal((await api('mobile/absence',{body:{studentId:ali.id,from:qatarDate(-1),to:qatarDate(1)},bearer:parentToken})).status,400);
  const request=(await api('mobile/absence',{body:{studentId:ali.id,from:qatarDate(1),to:qatarDate(2),reason:'Family trip'},bearer:parentToken})).data.request;
  assert.equal((await api('mobile/absence/decide',{body:{id:request.id,status:'approved'},bearer:parentToken})).status,403,'A parent cannot approve their own request.');
  assert.equal((await api('mobile/timetable',{bearer:teacher})).data.absenceRequests[0].reason,'Family trip');
  assert.equal((await api('mobile/absence/decide',{body:{id:request.id,status:'approved'},bearer:teacher})).status,200);
  assert.equal((await api('mobile/absence/decide',{body:{id:request.id,status:'declined'},bearer:teacher})).status,404,'A decision cannot be changed by a second answer.');
  const after=(await api('mobile/timetable',{bearer:parentToken})).data;assert.equal(after.absenceRequests[0].status,'approved');assert.equal(after.attendance.filter(row=>row.status==='excused').length,2);

  // Messages to a class reach only parents of that class.
  assert.equal((await api('teacher-messages',{body:{userId:'class:'+b.id,text:'Nobody'},cookie})).status,400);
  assert.equal((await api('teacher-messages',{body:{userId:'class:'+a.id,text:'Trip tomorrow'},cookie})).data.count,1);
  assert.equal((await api('mobile/timetable',{bearer:parentToken})).data.messages[0].text,'Trip tomorrow');
  assert.equal((await api('mobile/timetable',{bearer:teacher})).data.messages.length,0);

  // A second child joins the same account, and only with the right password.
  const second=(await api('parent-invites',{body:{studentId:huda.id},cookie})).data.code;
  assert.equal((await register({code:second,password:'another-wrong-password'})).status,409);
  assert.equal((await api('mobile/parent/link',{body:{code:second},bearer:teacher})).status,403);
  assert.equal((await api('mobile/parent/link',{body:{code:second},bearer:parentToken})).status,200);
  assert.equal((await api('mobile/timetable',{bearer:parentToken})).data.children.length,2);

  // Changing a password replaces the token; removal ends access.
  assert.equal((await api('mobile/password',{body:{currentPassword:'wrong-password-value',password},bearer:parentToken})).status,403);
  const renewed=(await api('mobile/password',{body:{currentPassword:password,password:password+'x'},bearer:parentToken})).data.token;
  assert.equal((await api('mobile/timetable',{bearer:parentToken})).status,401);assert.equal((await api('mobile/timetable',{bearer:renewed})).status,200);
  const parent=app.store.get().users.find(row=>row.role==='parent');
  assert.equal((await api('parents',{body:{id:parent.id,action:'disable'},cookie})).status,200);assert.equal((await api('mobile/timetable',{bearer:renewed})).status,401);
  assert.equal((await api('users',{body:{id:parent.id,active:true},cookie,method:'PUT'})).status,400,'Parents are not managed as staff.');

  // Staff-only routes stay closed to teachers, and removing a student removes their records.
  const teacherCookie=(await api('login',{body:{email:'sara@school.test',password}})).cookie;
  assert.equal((await api('students',{body:{nameEn:'X',nameAr:'',classId:a.id},cookie:teacherCookie})).status,403);assert.equal((await api('parent-invites',{body:{studentId:ali.id},cookie:teacherCookie})).status,403);
  const teacherState=(await api('state',{cookie:teacherCookie})).data;assert.equal(teacherState.parents,undefined);assert.equal(teacherState.students,undefined);
  assert.equal((await api('students/remove',{body:{id:ali.id},cookie})).status,200);assert.ok(!app.store.get().attendance.some(row=>row.studentId===ali.id));assert.ok(!parent.studentIds.includes(ali.id));
  assert.equal(work.classId,a.id);
  // Student records travel in backups, but parent passwords and codes do not.
  const backup=(await api('backup',{cookie})).data;assert.equal(backup.students.length,2);assert.equal(backup.parentInvites,undefined);assert.ok(!JSON.stringify(backup).includes(parent.hash));
 }finally{await app.close();}
});
