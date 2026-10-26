import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer,validateSettings} from '../server/server.mjs';
import {defaultSettings} from '../server/store.mjs';
import {openStore} from '../server/store.mjs';
import {scheduleState,validateSchedule,sampleSchedule} from '../shared/schedule.mjs';

test('parallel class lessons are independent while overlaps within a class are rejected',()=>{
 const original=sampleSchedule()[0],other={...original,id:'other-lesson',classId:'other',subjectEn:'Art'};
 const rows=validateSchedule([original,other]);assert.equal(rows.length,2);
 assert.equal(scheduleState(rows,defaultSettings(),new Date('2026-10-25T04:40:00Z')).current.subjectEn,'Mathematics');
 assert.equal(scheduleState(rows,{...defaultSettings(),classId:'other'},new Date('2026-10-25T04:40:00Z')).current.subjectEn,'Art');
 assert.throws(()=>validateSchedule([original,{...other,classId:'default'}]),/overlap/);
 assert.throws(()=>validateSchedule([{...other,classId:22}]),/class/);
});

test('panel dimensions reject out-of-range, fractional and nonnumeric inputs',()=>{
 for(const input of [{panelWidth:419},{panelWidth:1201},{textScale:79},{textScale:141},{edgeMargin:11},{edgeMargin:121},{panelWidth:680.1},{textScale:'100'},{horizontal:'outside'}])assert.throws(()=>validateSettings(input),/panel/);
 for(const input of [{panelWidth:420,textScale:80,edgeMargin:12,horizontal:'left'},{panelWidth:1200,textScale:140,edgeMargin:120,horizontal:'right'}])assert.equal(validateSettings(input).panelWidth,input.panelWidth);
});

test('existing single-class databases gain controls without losing their timetable',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'school-class-migration-'));let store=await openStore(directory);
 const state=store.get();delete state.classes;delete state.publishedClasses;
 for(const key of ['classId','panelWidth','textScale','horizontal','edgeMargin'])delete state.settings[key];
 state.published=sampleSchedule();state.publishedAt=new Date().toISOString();store.save();store.close();
 store=await openStore(directory);
 try{assert.equal(store.get().classes[0].id,'default');assert.equal(store.get().published.length,25);assert.equal(store.get().settings.panelWidth,680);assert.equal(store.get().settings.classId,'default');assert.equal(scheduleState(store.get().published,store.get().settings,new Date('2026-10-25T04:40:00Z')).current.subjectEn,'Mathematics');}finally{store.close();}
});

test('classes publish safely, select one monitor timetable, preserve other groups and survive backups',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'school-classes-'));let app=await startServer({directory,port:0});let cookie='';const password=randomBytes(24).toString('hex');
 async function request(path,body,method='POST'){
  const response=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Cookie:cookie,Origin:app.origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 try{
  assert.equal((await request('classes',{nameEn:'6A',nameAr:''})).status,401);
  await request('setup',{name:'Owner',email:'classes@school.test',password});cookie=(await request('login',{email:'classes@school.test',password})).cookie;
  assert.equal((await request('classes',{nameEn:'',nameAr:''})).status,400);
  const group=(await request('classes',{nameEn:'Grade 6A',nameAr:''})).data.group;
  const initial=(await request('state')).data;
  assert.equal((await request('settings',{...initial.settings,classId:group.id},'PUT')).status,400,'Unpublished groups cannot silently replace the monitor timetable.');
  const lesson={...initial.draft[0],id:'art',classId:group.id,subjectEn:'Art',teacherEn:'New Teacher'};
  assert.equal((await request('draft',{schedule:[...initial.draft,{...lesson,classId:'missing'}]},'PUT')).status,400);
  assert.equal((await request('draft',{schedule:[...initial.draft,lesson]},'PUT')).status,200);
  await request('publish',{});
  const token=app.store.get().displayToken,display='display?token='+token;
  assert.equal((await request(display)).data.schedule.length,25);
  const settings={...initial.settings,classId:group.id,panelWidth:920,textScale:120,horizontal:'right',edgeMargin:60};
  assert.equal((await request('settings',settings,'PUT')).status,200);
  let view=(await request(display)).data;assert.equal(view.schedule.length,1);assert.equal(view.schedule[0].teacherEn,'New Teacher');assert.equal(view.classInfo.nameEn,'Grade 6A');
  await request('classes',{...group,nameEn:'Renamed 6A'},'PUT');assert.equal((await request(display)).data.classInfo.nameEn,'Grade 6A','Class names follow publication.');
  await request('publish',{});assert.equal((await request(display)).data.classInfo.nameEn,'Renamed 6A');
  // Replacing one class with a sample must retain all other class schedules.
  await request('sample',{classId:group.id});assert.equal(app.store.get().draft.filter(row=>(row.classId||'default')==='default').length,25);
  assert.equal(app.store.get().draft.filter(row=>row.classId===group.id).length,25);await request('publish',{});
  const backup=(await request('backup')).data,revision=app.store.get().revision;
  assert.equal((await request('restore',{password,backup:{...backup,draft:[{...lesson,classId:'unknown'}]}})).status,400);assert.equal(app.store.get().revision,revision);
  assert.equal((await request('restore',{password,backup})).status,200);assert.equal(app.store.get().classes.length,2);assert.equal((await request(display)).data.schedule.length,25);
  const legacy={...backup,draft:sampleSchedule(),published:sampleSchedule(),settings:{...backup.settings}};delete legacy.classes;delete legacy.publishedClasses;
  for(const key of ['classId','panelWidth','textScale','horizontal','edgeMargin'])delete legacy.settings[key];
  assert.equal((await request('restore',{password,backup:legacy})).status,200);assert.equal(app.store.get().settings.classId,'default');assert.equal(app.store.get().classes.length,1);
  assert.equal((await request('restore',{password,backup})).status,200);
  await app.close();app=await startServer({directory,port:0});assert.equal(app.store.get().settings.panelWidth,920);assert.equal(app.store.get().settings.classId,group.id);assert.equal(app.store.get().classes[1].nameEn,'Renamed 6A');
 }finally{await app.close();}
});
