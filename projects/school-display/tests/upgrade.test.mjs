import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {createUpdates,newerVersion,validateManifest} from '../server/updates.mjs';
import {networkOptions} from '../server/network.mjs';
import {sampleSchedule,scheduleState} from '../shared/schedule.mjs';
import {openStore} from '../server/store.mjs';
import {previewTime} from '../server/planning.mjs';
const create=async()=>{
 const directory=mkdtempSync(join(tmpdir(),'school-upgrade-')),app=await startServer({directory,port:0,updateEnv:{}}),password=randomBytes(24).toString('hex');let cookie='';
 const req=async(path,body,method='POST',session=cookie)=>{const response=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:app.origin,'Content-Type':'application/json',Cookie:session},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 await req('setup',{name:'Owner',email:'owner@school.test',password});cookie=(await req('login',{email:'owner@school.test',password})).cookie;return {app,password,req,directory,cookie};
};
test('database corruption recovers the last complete state and quarantines the damaged file',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'school-recovery-'));let store=await openStore(directory);
 store.get().settings.schoolEn='Saved school';store.save();store.get().settings.schoolEn='Most recent change';store.save();store.close();writeFileSync(join(directory,'school.sqlite'),'damaged database');
 store=await openStore(directory);try{assert.equal(store.get().settings.schoolEn,'Saved school');assert.ok(store.recovered);assert.ok(readdirSync(directory).some(name=>name.startsWith('school-corrupt-')));assert.ok(store.get().audit[0].action.includes('recovered'));}finally{store.close();}
});
test('future-day previews use school timezone and reject nonexistent DST times',()=>{
 assert.equal(previewTime('2026-10-25','07:40','Asia/Riyadh'),Date.parse('2026-10-25T04:40:00Z'));
 assert.throws(()=>previewTime('2026-03-08','02:30','America/New_York'),/does not exist/);
 assert.throws(()=>previewTime('2026-02-30','08:00','UTC'),/valid preview/);
});
test('teacher permissions are enforced server-side and display links revoke with access',async()=>{
 const {app,password,req}=await create();try{
  const group=(await req('classes',{nameEn:'6A',nameAr:''})).data.group;await req('publish',{});
  const user=(await req('users',{name:'Teacher',email:'teacher@school.test',password,role:'teacher',classIds:[group.id]})).data.user;
  const teacher=(await req('login',{email:user.email,password})).cookie,state=(await req('state',undefined,'GET',teacher)).data;
  assert.equal(state.classes.length,1);assert.equal(state.classes[0].id,group.id);assert.equal(state.admin.role,'teacher');assert.deepEqual(state.devices,[]);assert.deepEqual(state.audit,[]);
  for(const path of ['users','recovery','updates'])assert.equal((await req(path,undefined,'GET',teacher)).status,403);
  for(const path of ['publish','devices','announcements','sample'])assert.equal((await req(path,{},'POST',teacher)).status,403);
  assert.equal((await req('draft',{schedule:[]},'PUT',teacher)).status,403);assert.equal((await req('settings',state.settings,'PUT',teacher)).status,403);
  const route=state.displayUrl.replace('/api/','').replace('/display?','display?');assert.equal((await req(route,undefined)).data.classInfo.id,group.id);
  assert.equal((await req('preview?classId='+group.id,undefined,'GET',teacher)).status,403);
  assert.equal((await req('users',{id:user.id,active:false},'PUT')).status,200);
  assert.equal((await req(route,undefined)).status,403);assert.equal((await req('state',undefined,'GET',teacher)).status,401);
  const coordinator=(await req('users',{name:'Coordinator',email:'coord@school.test',password,role:'coordinator'})).data.user,coord=(await req('login',{email:coordinator.email,password})).cookie;
  assert.equal((await req('draft',{schedule:[]},'PUT',coord)).status,200);assert.equal((await req('preview?classId=default',undefined,'GET',coord)).status,200);assert.equal((await req('publish',{},'POST',coord)).status,403);
 }finally{await app.close();}
});
test('screens have independent class links, heartbeat revisions and revocable access',async()=>{
 const {app,req}=await create();try{
  const group=(await req('classes',{nameEn:'6B',nameAr:''})).data.group;await req('publish',{});
  const created=await req('devices',{name:'Room 12',classId:group.id,monitor:'browser',enabled:true});assert.equal(created.status,200);const device=created.data.device;assert.equal(device.status,'offline');
  let route=device.displayUrl.replace('/display?','display?');assert.equal((await req(route+'&preview=1',undefined)).data.classInfo.id,group.id);assert.equal((await req('state',undefined)).data.devices[0].status,'offline','Previews do not count as live screens.');
  const view=(await req(route+'&revision=0',undefined)).data;assert.equal(view.classInfo.id,group.id);assert.equal((await req('state',undefined)).data.devices[0].status,'outdated');
  await req(route+'&revision='+app.store.get().revision,undefined);assert.equal((await req('state',undefined)).data.devices[0].status,'online');
  await req('announcements',{classIds:[group.id],textEn:'Assembly now',textAr:'',expiresAt:new Date(Date.now()+600000).toISOString()});assert.equal((await req(route,undefined)).data.settings.announcementEn,'Assembly now');
  const main=(await req('state',undefined)).data.displayUrl.replace('/display?','display?');assert.notEqual((await req(main,undefined)).data.settings.announcementEn,'Assembly now');
  await req('devices',{...device,enabled:false},'PUT');assert.equal((await req(route,undefined)).status,403);
  const changed=(await req('devices',{...device,enabled:true,renew:true},'PUT')).data.device;assert.notEqual(changed.displayUrl,device.displayUrl);assert.equal((await req(route,undefined)).status,403);
 }finally{await app.close();}
});
test('teacher conflicts block publication; replacement days cancel lessons and change teachers',async()=>{
 const {app,req,password}=await create();try{
  const group=(await req('classes',{nameEn:'6A',nameAr:''})).data.group,original=sampleSchedule()[0],second={...original,id:'other',classId:group.id};
  await req('draft',{schedule:[original,second]},'PUT');assert.equal((await req('state',undefined)).data.issues.length,1);assert.equal((await req('publish',{})).status,409);
  await req('draft',{schedule:[original,{...second,teacherEn:'Different teacher',teacherAr:''}]},'PUT');assert.equal((await req('publish',{})).status,200);
  const special={id:'exam',classId:'default',date:'2026-10-25',nameEn:'Exam day',nameAr:'',mode:'replace',schedule:[{...original,id:'exam-lesson',start:'09:00',end:'10:00',teacherEn:'Substitute',teacherAr:''}]};
  assert.equal((await req('special-days',{specialDays:[special]},'PUT')).status,200);assert.equal((await req('publish',{})).status,200);
  const state=(await req('state',undefined)).data,route=state.displayUrl.replace('/display?','display?'),display=(await req(route,undefined)).data;
  assert.equal(scheduleState(display.schedule,display.settings,new Date('2026-10-25T04:40:00Z')).current,null);
  assert.equal(scheduleState(display.schedule,display.settings,new Date('2026-10-25T06:10:00Z')).current.teacherEn,'Substitute');
  await req('special-days',{specialDays:[{...special,mode:'cancel'}]},'PUT');await req('publish',{});const closed=(await req(route,undefined)).data;assert.equal(scheduleState(closed.schedule,closed.settings,new Date('2026-10-25T06:10:00Z')).current,null);
  const preview=await req('preview?classId=default',undefined);assert.equal(preview.data.draft,true);
  const backup=(await req('backup',undefined)).data;assert.equal(backup.publishedSpecialDays.length,1);assert.equal(JSON.stringify(backup).includes(app.store.get().displayToken),false);
  await req('recovery',{});const list=(await req('recovery',undefined)).data.backups;assert.ok(list.length>=3);const copy=(await req('recovery/export',{name:list[0].name})).data;assert.equal(copy.format,'school-display-1');assert.equal(JSON.stringify(copy).includes('hash'),false);assert.equal((await req('recovery/export',{name:'../../school.sqlite'})).status,404);
  assert.equal((await req('restore',{password,backup})).status,200);assert.equal(app.store.get().publishedSpecialDays[0].mode,'cancel');
  assert.equal((await req('updates',undefined)).data.configured,false);assert.equal((await req('updates/check',{})).status,400);
 }finally{await app.close();}
});
test('trusted updates reject bad manifests and signatures; valid packages stage and install',async()=>{
 assert.equal(newerVersion('2.0.0','1.9.9'),true);assert.equal(newerVersion('1.9.9','2.0.0'),false);assert.equal(newerVersion('2.0.0','2.0.0'),false);
 const file=Buffer.from('signed installer fixture'),manifest={version:'2.0.0',url:'https://updates.school.test/setup.exe',bytes:file.length,sha256:createHash('sha256').update(file).digest('hex')},signer='A'.repeat(40),directory=mkdtempSync(join(tmpdir(),'school-updater-'));let valid=false,installed=false;
 assert.throws(()=>validateManifest({...manifest,url:'http://evil.test/setup.exe'},'https://updates.school.test/feed.json','1.3.0'),/HTTPS/);
 const updates=createUpdates({directory,version:'1.3.0',env:{SCHOOL_UPDATE_URL:'https://updates.school.test/feed.json',SCHOOL_UPDATE_SIGNER:signer},desktop:{verifyInstaller:async()=>({valid,thumbprint:signer}),installUpdate:async()=>{installed=true;}},fetcher:async url=>new Response(url.endsWith('.json')?JSON.stringify(manifest):file)});
 await updates.check();await assert.rejects(updates.download(),/not signed/);valid=true;await updates.download();assert.equal(updates.status().staged,'2.0.0');const staged=join(directory,'updates',readdirSync(join(directory,'updates')).find(name=>name.endsWith('.exe')));writeFileSync(staged,'tampered');await assert.rejects(updates.install(),/changed/);assert.equal(installed,false);await updates.download();await updates.install();assert.equal(installed,true);
 assert.deepEqual(networkOptions({}),{});assert.throws(()=>networkOptions({SCHOOL_NETWORK_ORIGIN:'http://school.test'}),/HTTPS/);
 await assert.rejects(startServer({directory:mkdtempSync(join(tmpdir(),'school-network-')),port:0,host:'0.0.0.0'}),/TLS/);
});
