import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { handover } from './admin-handover.mjs';

const root=mkdtempSync(join(tmpdir(),'stocrant-test-data-handover-'));process.env.STOCRANT_DATA_DIR=root;process.env.NODE_ENV='development';
const {createApp}=await import('../dist/app.js');
const {getStore}=await import('../dist/storage.js');
const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`,storeFile=join(root,'data','stocrant.json'),currentEmail='owner@handover.test',currentPassword=randomBytes(24).toString('base64url');
const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Original Owner',email:currentEmail,password:currentPassword,setupKey:'local-setup'})});assert.equal(setup.status,201);
const cookie=setup.headers.get('set-cookie').split(';')[0];
async function api(path,body){const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.ok(response.ok,await response.clone().text());return response.json();}
const options={base,storeFile,currentEmail,currentPassword,email:'new-owner@handover.test',name:'New Owner'};
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true,force:true});});

test('stops for invalid credentials or an unavailable backup before changing accounts',async()=>{
  const before=structuredClone(getStore().collections.accessUsers);
  await assert.rejects(handover({...options,currentPassword:'incorrect-password'}),/401/);
  await assert.rejects(handover({...options,storeFile:join(root,'missing.json')}),/ENOENT/);
  const access=users=>users.map(({lastLoginAt,previousLoginAt,...user})=>user);
  assert.deepEqual(access(getStore().collections.accessUsers),access(before));
});

test('verifies the replacement Main, archives companies and disables old users without deleting business history',async()=>{
  const company=getStore().collections.companies[0];
  await api(`/workspace/organization-admins/${company.parentOrganizationId}`,{version:0,name:'Old Organization Admin',email:'organization@handover.test',password:randomBytes(24).toString('base64url'),organizationIds:[company.id]});
  await api('/workspace/access/users',{name:'Old Staff',email:'staff@handover.test',password:randomBytes(24).toString('base64url'),roleId:'role-customer-service',organizationIds:[company.id]});
  await api('/workspace/finance/accounts',{name:'Historic Bank',type:'bank',organizationId:company.id,currency:'QAR',openingBalance:'125.25'});
  await api('/workspace/customer-service/questions',{customerName:'Historic Customer',organizationId:company.id,subject:'Preserved question',message:'Business history must remain unchanged.'});
  const before=structuredClone(getStore());let credentials;
  const result=await handover({...options,onCredentials:value=>{credentials=value;}});
  assert.ok(credentials.password.length>=24);assert.equal(result.email,options.email);
  assert.deepEqual(JSON.parse(readFileSync(result.backup,'utf8')).collections.customerQuestions,before.collections.customerQuestions);
  const final=getStore();
  assert.deepEqual(final.collections.customerQuestions,before.collections.customerQuestions);
  assert.deepEqual(final.collections.financeTransactions,before.collections.financeTransactions);
  assert.deepEqual(final.collections.financeAccounts,before.collections.financeAccounts);
  assert.equal(final.collections.accessUsers.filter(user=>user.status==='active').length,1);
  assert.equal(final.collections.accessUsers.find(user=>user.id===result.accountId).roleId,'role-main-manager');
  assert.ok(final.collections.companies.every(company=>company.status==='inactive'));
  assert.ok(final.collections.organizations.every(organization=>organization.status==='inactive'));
  assert.equal((await fetch(base+'/api/workspace/overview',{headers:{Cookie:cookie}})).status,401);
  const disk=readFileSync(storeFile,'utf8');assert.ok(!disk.includes(credentials.password));
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:options.email,password:credentials.password})});assert.equal(login.status,200);
  const newCookie=login.headers.get('set-cookie').split(';')[0],oldStaff=final.collections.accessUsers.find(user=>user.email==='staff@handover.test');
  const reactivate=await fetch(base+`/api/workspace/access/users/${oldStaff.id}`,{method:'PATCH',headers:{Cookie:newCookie,'Content-Type':'application/json'},body:JSON.stringify({status:'active'})});assert.equal(reactivate.status,400,'Archiving must not permit reactivating accounts in an inactive company');
  // Re-running for the same Main email refreshes its password and does not create duplicates.
  const repeat=await handover({...options,currentEmail:options.email,currentPassword:credentials.password,onCredentials:value=>{credentials=value;}});
  assert.equal(repeat.accountId,result.accountId);
  assert.equal(getStore().collections.accessUsers.filter(user=>user.email===options.email).length,1);
});
