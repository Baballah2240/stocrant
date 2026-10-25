import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createSuperAdmin} from './create-super-admin.mjs';
const root=mkdtempSync(join(tmpdir(),'stocrant-test-data-super-admin-'));process.env.STOCRANT_DATA_DIR=root;process.env.NODE_ENV='development';
const {createApp}=await import('../dist/app.js');const {getStore,saveStore}=await import('../dist/storage.js');
const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const currentEmail='existing-owner@super-admin.test',currentPassword=randomBytes(24).toString('hex');
const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Existing Owner',email:currentEmail,password:currentPassword,setupKey:'local-setup'})});assert.equal(setup.status,201);const oldCookie=setup.headers.get('set-cookie').split(';')[0];
async function api(path,body,session=oldCookie,method=body?'POST':'GET'){const response=await fetch(base+'/api'+path,{method,headers:{Cookie:session,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {response,data:await response.json()};}
const options={base,currentEmail,currentPassword,email:'additional-owner@super-admin.test',name:'Additional Super Admin'};
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true,force:true});});
test('rejects duplicate email and bad authentication without creating an account',async()=>{
  const count=getStore().collections.accessUsers.length;
  await assert.rejects(createSuperAdmin({...options,email:currentEmail}),/already has an account/);
  await assert.rejects(createSuperAdmin({...options,currentPassword:'wrong-password'}),/401/);
  assert.equal(getStore().collections.accessUsers.length,count);
});
test('creates an additional Super Admin, preserves existing accounts and companies, and controls users across companies',async()=>{
  const company=getStore().collections.companies[0];
  const {data:other}=await api('/workspace/access/users',{name:'Company Employee',email:'employee@super-admin.test',password:randomBytes(24).toString('hex'),roleId:'role-employee',organizationIds:[company.id]});assert.ok(other.item);
  const secondOrganization=(await api('/collections/organizations',{name:'Second Organization',status:'active'})).data.item;
  const secondCompany=(await api('/collections/companies',{name:'Second Company',parentOrganizationId:secondOrganization.id,organizationType:'office',industry:'services',currency:'QAR',status:'active'})).data.item;
  const secondStaff=(await api('/workspace/access/users',{name:'Other Company Employee',email:'second-employee@super-admin.test',password:randomBytes(24).toString('hex'),roleId:'role-employee',organizationIds:[secondCompany.id]})).data.item;
  const actor=getStore().collections.accessUsers.find(user=>user.email===currentEmail);actor.ownRecordsOnly=true;actor.permissions=[];saveStore(getStore());
  const previous=structuredClone(getStore());let credentials;
  const result=await createSuperAdmin({...options,onCredentials:value=>{credentials=value;}});
  assert.equal(result.verified,true);assert.equal(result.mustChangePassword,true);assert.ok(credentials.password.length>=24);
  const state=getStore();assert.equal(state.collections.accessRoles.find(role=>role.id==='role-main-manager').name,'Super Admin');
  assert.deepEqual(state.collections.companies,previous.collections.companies);assert.deepEqual(state.collections.organizations,previous.collections.organizations);assert.deepEqual(state.collections.employees,previous.collections.employees);
  for(const account of previous.collections.accessUsers){const after=state.collections.accessUsers.find(user=>user.id===account.id);for(const field of ['name','email','status','roleId','passwordHash','organizationIds'])assert.deepEqual(after[field],account[field]);}
  assert.equal((await api('/workspace/access/users')).response.status,200,'Existing administrator login must remain active');
  let login=await api('/auth/login',{email:options.email,password:credentials.password},'');assert.equal(login.response.status,200);let newCookie=login.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('/workspace/access/users',undefined,newCookie)).response.status,403,'Initial password setup is required');
  const finalPassword=randomBytes(24).toString('hex');assert.equal((await api('/auth/password',{currentPassword:credentials.password,newPassword:finalPassword},newCookie)).response.status,200);
  login=await api('/auth/login',{email:options.email,password:finalPassword},'');newCookie=login.response.headers.get('set-cookie').split(';')[0];
  const profile=(await api('/auth/me',undefined,newCookie)).data.user;assert.equal(profile.position,'Super Admin');assert.deepEqual(profile.permissions,['*']);assert.equal(profile.ownRecordsOnly,false);
  const all=(await api('/workspace/access/users',undefined,newCookie)).data.items;assert.ok(all.some(user=>user.id===actor.id)&&all.some(user=>user.id===other.item.id));
  assert.ok(all.some(user=>user.id===secondStaff.id),'Super Admin sees users from a different organization and company');
  assert.equal((await api(`/workspace/access/users/${secondStaff.id}`,{name:'Managed across companies'},newCookie,'PATCH')).response.status,200);
  assert.equal((await api(`/workspace/access/users/${other.item.id}`,{name:'Updated by Super Admin'},newCookie,'PATCH')).response.status,200);
  assert.equal((await api(`/workspace/access/users/${other.item.id}`,{status:'suspended'},newCookie,'PATCH')).response.status,200);
  assert.equal((await api('/workspace/shops/'+company.id,undefined,oldCookie)).response.status,200,'Legacy owner restrictions must not block platform access');
  const reserved=await api('/workspace/administration/roles',{name:'Super Admin',permissions:[],currentPassword},oldCookie);assert.equal(reserved.response.status,400);
});
