import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../server/server.mjs';
test('local control flow protects admin, publishing, display access, backups and exit',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'school-display-api-'));let applied=0,exited=false;
 const app=await startServer({directory:dir,port:0,desktop:{monitors:()=>[],apply:async()=>applied++,reload:async()=>{},exit:()=>exited=true}});let cookie='';const password='School-Display-Test-1234';
 async function req(path,body,method='POST',extra={}){const response=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Cookie:cookie,Origin:app.origin,'Content-Type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});return {response,data:await response.json()};}
 try{
  assert.equal((await req('state')).response.status,401);
  assert.equal((await req('setup',{name:'Owner',email:'owner@school.test',password},'POST',{Origin:'https://evil.test'})).response.status,403);
  assert.equal((await req('setup',{name:'Owner',email:'owner@school.test',password})).response.status,200);
  assert.equal((await req('setup',{name:'Other',email:'other@school.test',password})).response.status,409);
  assert.equal((await req('login',{email:'owner@school.test',password:'wrong'})).response.status,401);
  const login=await req('login',{email:'owner@school.test',password});cookie=login.response.headers.get('set-cookie').split(';')[0];
  const state=(await req('state')).data,displayToken=new URL(state.displayUrl,app.origin).searchParams.get('token');assert.equal(state.published.length,0);
  assert.equal((await req('display?token=wrong')).response.status,403);
  const display=await req('display?token='+displayToken);assert.equal(display.response.status,200);assert.ok(!('draft' in display.data));assert.ok(!('admin' in display.data));
  assert.equal((await req('draft',{schedule:[...state.draft,state.draft[0]]},'PUT')).response.status,400);
  assert.equal((await req('publish',{})).response.status,200);assert.equal((await req('display?token='+displayToken)).data.schedule.length,25);
  assert.equal((await req('settings',{...state.settings,timezone:'Imaginary/City'},'PUT')).response.status,400);
  assert.equal((await req('settings',{...state.settings,language:'ar',holidays:['2026-02-30']},'PUT')).response.status,400);
  assert.equal((await req('settings',{...state.settings,language:'ar'},'PUT')).response.status,200);assert.equal(applied,1);
  const backup=(await req('backup')).data;assert.ok(!JSON.stringify(backup).includes('hash'));assert.ok(!JSON.stringify(backup).includes(displayToken));
  assert.equal((await req('restore',{backup,password:'incorrect'})).response.status,403);
  assert.equal((await req('restore',{backup,password})).response.status,200);
  assert.equal((await req('rotate-display',{password})).response.status,200);assert.equal((await req('display?token='+displayToken)).response.status,403);
  assert.equal((await req('exit',{password:'incorrect'})).response.status,403);assert.equal(exited,false);
  const html=await fetch(app.origin+'/control');assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy'),/script-src 'self'/);
  assert.equal((await fetch(app.origin+'/../package.json')).status,404);
  await req('logout',{});assert.equal((await req('state')).response.status,401);
 }finally{await app.close();}
 const reopened=await startServer({directory:dir,port:0});assert.equal(reopened.store.get().revision,2);assert.equal(reopened.store.get().settings.language,'ar');assert.equal(reopened.store.get().admin.email,'owner@school.test');await reopened.close();
});
