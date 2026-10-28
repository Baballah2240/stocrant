import {request} from 'node:http';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {createRemote,displayLink} from '../server/remote.mjs';
import {networkOptions} from '../server/network.mjs';

const directory=()=>mkdtempSync(join(tmpdir(),'school-remote-'));
test('unchanged remote polls keep fresh status without rewriting the cache or reconfiguring screens',async()=>{
 const dir=directory();let applies=0,time=1,school='First school',cancelled=false,denied=false;
 const remote=createRemote({directory:dir,images:{},validate:value=>value,interval:3600000,onChange:async()=>{applies++;},fetcher:async()=>denied?new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:403}):Response.json({configured:true,revision:1,serverTime:time++,settings:{schoolEn:school},schedule:[]})});
 try{
  await remote.connect('https://school.example/display?token='+'a'.repeat(64));
  const file=join(dir,'remote-screen.json'),initial=readFileSync(file,'utf8');
  await remote.sync();await remote.sync();assert.equal(applies,1);assert.equal(readFileSync(file,'utf8'),initial);assert.equal(remote.status().online,true);
  school='Updated without publication';await remote.sync();assert.equal(applies,2);assert.notEqual(readFileSync(file,'utf8'),initial);assert.equal(remote.snapshot().settings.schoolEn,school);
  denied=true;await remote.sync();assert.equal(cancelled,true);assert.equal(remote.status().revoked,true);assert.equal(remote.snapshot(),null);assert.equal(applies,3);
  await remote.sync();assert.equal(applies,3,'Repeated revocation must not repeatedly reconfigure screens');
 }finally{remote.close();}
});
async function account(app){
 const password=randomBytes(24).toString('hex');let cookie='';
 const req=async(path,body,method='POST',session=cookie)=>{
  const response=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:app.origin,'Content-Type':'application/json',Cookie:session},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 await req('setup',{name:'Owner',email:'owner@school.test',password});cookie=(await req('login',{email:'owner@school.test',password})).cookie;
 return {req,password};
}
test('remote Windows screen follows its assigned class, images, settings, offline restart and revocation',async()=>{
 const central=await startServer({directory:directory(),port:0,updateEnv:{}}),localDir=directory();let offline=false,settings=null;
 const options={directory:localDir,port:0,desktop:{applyRemote:async value=>{settings=value;},monitors:()=>[]},remoteOptions:{interval:3600000,allowLoopback:true,fetcher:(...args)=>{if(offline)throw Error('offline');return fetch(...args);}},updateEnv:{}};
 let local=await startServer(options);
 try{
  const cloud=await account(central),client=await account(local);
  const group=(await cloud.req('classes',{nameEn:'6A',nameAr:'الصف السادس'})).data.group;await cloud.req('publish',{});
  const img=(await cloud.req('images',{data:'data:image/png;base64,'+readFileSync(new URL('../assets/icon.png',import.meta.url)).toString('base64')})).data.image;
  await cloud.req('settings',{...central.store.get().settings,schoolEn:'Central school',logoImage:img},'PUT');
  const device=(await cloud.req('devices',{name:'Classroom PC',classId:group.id,monitor:'browser',enabled:true})).data.device;
  const url=central.origin+device.displayUrl;
  assert.equal((await client.req('remote',{url,password:client.password},'POST','')).status,401);
  assert.equal((await client.req('remote',{url,password:'wrong'})).status,403);
  const connection=await client.req('remote',{url,password:client.password});assert.equal(connection.status,200,JSON.stringify(connection.data));
  assert.equal(settings.schoolEn,'Central school');assert.equal(local.remote.status().online,true);
  const token=local.store.get().displayToken,display=()=>fetch(local.origin+'/api/display?token='+token);
  let view=await (await display()).json();assert.equal(view.classInfo.id,group.id);assert.equal(view.schedule.length,0);
  assert.equal((await fetch(local.origin+img+'?token='+token)).status,200);
  const state=(await client.req('state')).data;assert.equal(state.remote.origin,central.origin);assert.ok(!JSON.stringify(state.remote).includes(device.token));
  assert.ok(!JSON.stringify((await client.req('backup')).data).includes(device.token));
  const rows=[{id:'remote-lesson',classId:group.id,day:0,type:'lesson',start:'07:30',end:'08:15',subjectEn:'Remote maths',subjectAr:'الرياضيات',teacherEn:'Teacher',teacherAr:'',room:'6A'}];
  await cloud.req('draft',{schedule:rows},'PUT');await cloud.req('publish',{});
  await cloud.req('announcements',{textEn:'Hello screens',textAr:'',classIds:[group.id],expiresAt:new Date(Date.now()+60000).toISOString()});
  await local.remote.sync();view=await (await display()).json();assert.equal(view.schedule[0].subjectEn,'Remote maths');assert.equal(view.settings.announcementEn,'Hello screens');
  await local.remote.sync();assert.equal((await cloud.req('state')).data.devices[0].status,'online');
  offline=true;await local.remote.sync();view=await (await display()).json();assert.equal(view.remote.online,false);assert.equal(view.schedule.length,1);
  await local.close();local=await startServer(options);view=await (await display()).json();assert.equal(view.schedule[0].subjectEn,'Remote maths');assert.equal(view.remote.online,false);assert.ok(Math.abs(view.serverTime-Date.now())<1000);
  offline=false;await cloud.req('devices',{...device,enabled:false},'PUT');await local.remote.sync();assert.equal((await display()).status,403);assert.equal(local.remote.snapshot(),null);
  await local.close();local=await startServer(options);assert.equal(local.remote.snapshot(),null);
  const login=await fetch(local.origin+'/api/login',{method:'POST',headers:{Origin:local.origin,'Content-Type':'application/json'},body:JSON.stringify({email:'owner@school.test',password:client.password})});
  const disconnected=await fetch(local.origin+'/api/remote',{method:'POST',headers:{Origin:local.origin,'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0]},body:JSON.stringify({password:client.password,disconnect:true})});
  assert.equal(disconnected.status,200);assert.equal(local.remote.status().configured,false);
 }finally{await local.close();await central.close();}
});
test('remote links require HTTPS and read-only screen tokens, never arbitrary paths or redirects',()=>{
 const token='a'.repeat(64);assert.equal(displayLink('https://schools.mohbaba.online/display?token='+token).origin,'https://schools.mohbaba.online');
 for(const link of ['http://schools.mohbaba.online/display?token='+token,'https://user:pass@example.com/display?token='+token,'https://example.com/control?token='+token,'https://example.com/display?token='+token+'&other=1'])assert.throws(()=>displayLink(link));
});
test('hosted proxy mode protects initial setup, exact origin and secure sessions',async()=>{
 const key=randomBytes(32).toString('hex'),origin='https://schools.mohbaba.online';
 assert.throws(()=>networkOptions({SCHOOL_TRUST_PROXY:'1',SCHOOL_NETWORK_ORIGIN:origin}),/setup key/);
 const options=networkOptions({SCHOOL_TRUST_PROXY:'1',SCHOOL_NETWORK_ORIGIN:origin,SCHOOL_SETUP_KEY:key,PORT:'0'});
 const app=await startServer({directory:directory(),...options});
 const endpoint='http://127.0.0.1:'+app.server.address().port;
 const req=async(path,body,extra={})=>new Promise((resolve,reject)=>{
  const payload=body?JSON.stringify(body):null;
  const outgoing=request(endpoint+path,{method:body?'POST':'GET',headers:{Host:'schools.mohbaba.online',Origin:origin,'X-Forwarded-Proto':'https','Content-Type':'application/json',...(payload?{'Content-Length':Buffer.byteLength(payload)}:{}),...extra}},response=>{
   const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,headers:{get:key=>Array.isArray(response.headers[key])?response.headers[key].join(';'):response.headers[key]},json:async()=>JSON.parse(Buffer.concat(chunks))}));
  });outgoing.on('error',reject);outgoing.end(payload);
 });
 try{
  assert.equal((await req('/api/status',null,{Host:'evil.test'})).status,403);
  assert.equal((await req('/api/status',null,{'X-Forwarded-Proto':'http'})).status,403);
  assert.equal((await req('/health',null,{Host:'health.internal','X-Forwarded-Proto':'http'})).status,200);
  const status=await req('/api/status');const statusBody=await status.json();assert.equal(statusBody.setupKeyRequired,true,JSON.stringify({status:status.status,body:statusBody}));
  const credentials={name:'Hosted owner',email:'owner@school.test',password:randomBytes(24).toString('hex')};
  assert.equal((await req('/api/setup',credentials)).status,403);
  assert.equal((await req('/api/setup',{...credentials,setupKey:key})).status,200);
  const login=await req('/api/login',credentials);assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/; Secure/);
  assert.equal((await req('/api/setup',{...credentials,setupKey:key})).status,409);
 }finally{await app.close();}
});
