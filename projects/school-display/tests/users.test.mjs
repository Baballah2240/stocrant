import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';

test('separate administrators retain their sessions, protect ownership, and revoke disabled access',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'school-users-'));let app=await startServer({directory,port:0});
 const password=randomBytes(24).toString('hex'),secondPassword=randomBytes(24).toString('hex');
 const request=async(path,body,cookie='',method='POST')=>{
  const response=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:app.origin,'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 try{
  assert.equal((await request('users',undefined)).status,401);
  await request('setup',{name:'Owner',email:'owner@school.test',password});
  const owner=(await request('login',{email:'owner@school.test',password})).cookie;
  const created=await request('users',{name:'Second',email:'second@school.test',password:secondPassword},owner);assert.equal(created.status,200);
  const user=created.data.user;assert.equal(user.owner,false);assert.ok(!JSON.stringify(created.data).includes('hash'));
  assert.equal((await request('users',{name:'Duplicate',email:'SECOND@school.test',password},owner)).status,409);
  const second=(await request('login',{email:'second@school.test',password:secondPassword})).cookie;
  assert.equal((await request('state',undefined,owner)).status,200,'A different user must not sign out the owner.');
  assert.equal((await request('status',undefined,second)).data.admin.email,'second@school.test');
  assert.equal((await request('publish',{},second)).status,200);
  assert.equal((await request('rotate-display',{password},second)).status,403,'Protected actions need the signed-in user password.');
  assert.equal((await request('rotate-display',{password:secondPassword},second)).status,200);
  assert.equal((await request('users',{id:user.id,active:false},second,'PUT')).status,400,'Cannot disable yourself.');
  const ownerId=(await request('state',undefined,owner)).data.admin.id;
  assert.equal((await request('users',{id:ownerId,active:false},second,'PUT')).status,400,'Cannot disable the original administrator.');
  assert.equal((await request('account',{name:'Second',email:'owner@school.test',currentPassword:secondPassword,password:secondPassword},second,'PUT')).status,409);
  assert.equal((await request('users',{id:user.id,active:false},owner,'PUT')).status,200);
  assert.equal((await request('state',undefined,second)).status,401,'Existing session must be revoked immediately.');
  assert.equal((await request('login',{email:'second@school.test',password:secondPassword})).status,401);
  assert.equal((await request('users',{id:user.id,active:true},owner,'PUT')).status,200);
  assert.equal((await request('login',{email:'second@school.test',password:secondPassword})).status,200);
  // Simulate an existing pre-multi-user database and verify migration preserves access.
  delete app.store.get().admin.id;app.store.save();await app.close();app=await startServer({directory,port:0});
  assert.equal((await request('login',{email:'owner@school.test',password})).status,200);
  assert.equal((await request('login',{email:'second@school.test',password:secondPassword})).status,200);
 }finally{await app.close();}
});
