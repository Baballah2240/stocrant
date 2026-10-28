import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
test('teacher and activity photos publish privately, survive backup restore and synchronize to remote screens',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'qatar-photos-')),cloud=await startServer({directory:join(directory,'cloud'),port:0}),local=await startServer({directory:join(directory,'local'),port:0,desktop:{},remoteOptions:{allowLoopback:true,interval:3600000}});let cookie='';
 const password=randomBytes(24).toString('hex');const req=async(path,body,method='POST')=>{const response=await fetch(cloud.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:cloud.origin,'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 try{
  await req('setup',{name:'Owner',email:'photos@school.test',password});cookie=(await req('login',{email:'photos@school.test',password})).cookie;
  const photo=(await req('images',{data:'data:image/png;base64,'+readFileSync(new URL('../assets/icon.png',import.meta.url)).toString('base64')})).data.image;
  const group=(await req('classes',{nameEn:'Other class',nameAr:''})).data.group;
  const row={...cloud.store.get().draft[0],teacherImage:photo,actionImage:photo};
  assert.equal((await req('draft',{schedule:[row]},'PUT')).status,200);await req('publish',{});
  const device=(await req('devices',{name:'Other screen',classId:group.id,monitor:'browser',enabled:true})).data.device;
  assert.equal((await fetch(cloud.origin+photo)).status,403);assert.equal((await fetch(cloud.origin+photo+'?token='+device.token)).status,404);assert.equal((await fetch(cloud.origin+photo+'?token='+cloud.store.get().displayToken)).status,200);
  await req('users',{name:'Other teacher',email:'other@school.test',password,role:'teacher',classIds:[group.id]});
  const teacher=await req('login',{email:'other@school.test',password});
  assert.equal((await fetch(cloud.origin+photo,{headers:{Cookie:teacher.cookie}})).status,404,'A signed-in teacher must not read a different class photo.');
  const backup=(await req('backup',undefined)).data;assert.ok(backup.images[photo]);assert.equal(backup.published[0].teacherImage,photo);
  assert.equal((await req('restore',{backup,password})).status,200);assert.equal(cloud.store.get().published[0].actionImage,photo);
  await local.remote.connect(cloud.origin+'/display?token='+cloud.store.get().displayToken);assert.equal(local.remote.snapshot().schedule[0].teacherImage,photo);
  assert.equal((await fetch(local.origin+photo+'?token='+local.store.get().displayToken)).status,200);
  const missing='/api/images/'+'f'.repeat(64)+'.png';assert.equal((await req('draft',{schedule:[{...row,teacherImage:missing}]},'PUT')).status,400);
  assert.equal((await req('settings',{...cloud.store.get().settings,lessonLeadSeconds:121},'PUT')).status,400);
 }finally{await local.close();await cloud.close();}
});
