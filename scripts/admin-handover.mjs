import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

// Authenticate against the running service. Never edit its cached data file.
export async function handover({base,storeFile,currentEmail,currentPassword,email,name,onCredentials=()=>{}}) {
  const origin=new URL(base);
  if(origin.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw new Error('Use HTTPS or the loopback service address.');
  let cookie='';
  async function api(path,method='GET',body,session=cookie){
    const response=await fetch(new URL('/api'+path,base),{method,redirect:'error',headers:{Cookie:session,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await response.json();
    if(!response.ok)throw new Error(`${method} ${path}: ${response.status} ${data.error||'Request failed'}`);
    return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  cookie=(await api('/auth/login','POST',{email:currentEmail,password:currentPassword},'')).cookie;
  const actor=(await api('/auth/me')).data.user;
  if(actor.roleId!=='role-main-manager'||actor.mustChangePassword)throw new Error('Sign in with an existing Main Administrator whose initial password setup is complete.');
  const users=(await api('/workspace/access/users')).data.items;
  const companies=(await api('/collections/companies')).data.items;
  const organizations=(await api('/collections/organizations')).data.items;
  const existing=users.find(user=>user.email.toLowerCase()===email.toLowerCase());
  if(existing&&existing.roleId!=='role-main-manager')throw new Error('The requested email belongs to a non-Main account. Choose an unused email or resolve that account in Users first. No accounts or companies were changed.');
  // A complete snapshot is kept outside the public web directories. Stop if it fails.
  const original=readFileSync(storeFile);const snapshot=JSON.parse(original.toString('utf8'));
  if(!Array.isArray(snapshot.collections?.accessUsers)||!snapshot.collections.accessUsers.some(user=>user.id===actor.id&&user.email.toLowerCase()===currentEmail.toLowerCase()))throw new Error('The backup file does not belong to the authenticated service.');
  const backup=join(dirname(storeFile),'backups',`pre-admin-handover-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomBytes(4).toString('hex')}.json`);
  mkdirSync(dirname(backup),{recursive:true,mode:0o700});
  writeFileSync(backup,original,{flag:'wx',mode:0o600,flush:true});
  if(!readFileSync(backup).equals(original))throw new Error('Backup verification failed. No account changes were made.');
  const password=randomBytes(24).toString('base64url');
  let target;
  if(existing?.id===actor.id){
    await api('/auth/password','POST',{currentPassword,newPassword:password});target=existing;
  }else{
    const temporary=randomBytes(24).toString('base64url');
    if(existing)target=(await api(`/workspace/access/users/${existing.id}`,'PATCH',{name,password:temporary,status:'active'})).data.item;
    else target=(await api('/workspace/access/users','POST',{name,email,password:temporary,roleId:'role-main-manager',organizationIds:[],ownRecordsOnly:false})).data.item;
    const first=(await api('/auth/login','POST',{email,password:temporary},'')).cookie;
    await api('/auth/password','POST',{currentPassword:temporary,newPassword:password},first);
  }
  // Deliver credentials before subsequent operations, so a partial failure cannot hide them.
  onCredentials({email,password,backup});
  cookie=(await api('/auth/login','POST',{email,password},'')).cookie;
  const verified=(await api('/auth/me')).data.user;
  if(verified.id!==target.id||verified.roleId!=='role-main-manager'||verified.accountStatus!=='active'||verified.mustChangePassword)throw new Error('New Main Administrator verification failed; no companies or old accounts were disabled.');
  await api(`/workspace/access/users/${target.id}`,'PATCH',{name});
  // Companies must be archived before their parent, which releases designated-admin protections.
  for(const company of companies.filter(company=>company.status!=='inactive')){
    const result=(await api(`/collections/companies/${company.id}`,'PATCH',{status:'inactive'})).data;
    if(result.pending)throw new Error('Archiving requires approval on this deployment. Stopped before disabling old users.');
  }
  for(const organization of organizations.filter(organization=>organization.status==='active')){
    const result=(await api(`/collections/organizations/${organization.id}`,'PATCH',{status:'inactive'})).data;
    if(result.pending)throw new Error('Organization archiving requires approval. Stopped before disabling old users.');
  }
  for(const user of users.filter(user=>user.id!==target.id&&user.status!=='inactive'))await api(`/workspace/access/users/${user.id}`,'PATCH',{status:'inactive'});
  const finalUsers=(await api('/workspace/access/users')).data.items;
  const finalCompanies=(await api('/collections/companies')).data.items;
  if(finalUsers.some(user=>user.id!==target.id&&user.status!=='inactive')||finalCompanies.some(company=>company.status!=='inactive'))throw new Error('Final verification failed. Keep the backup and review the remaining records.');
  return {email,accountId:target.id,backup,archivedCompanies:companies.length,disabledUsers:finalUsers.filter(user=>user.id!==target.id).length};
}

async function secretPrompt(label){
  if(!process.stdin.isTTY)throw new Error('Use an interactive Shell, or set STOCRANT_CURRENT_ADMIN_PASSWORD privately in the process environment.');
  process.stdout.write(label);process.stdin.setRawMode(true);process.stdin.resume();
  try{return await new Promise((resolve,reject)=>{let value='';const read=chunk=>{for(const c of chunk.toString()){if(c==='\u0003'){process.stdin.off('data',read);reject(new Error('Cancelled.'));return;}if(c==='\r'||c==='\n'){process.stdin.off('data',read);resolve(value);return;}if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else value+=c;}};process.stdin.on('data',read);});}
  finally{process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.env.STOCRANT_ADMIN_HANDOVER!=='archive-companies-disable-users')throw new Error('Set STOCRANT_ADMIN_HANDOVER=archive-companies-disable-users to run the requested handover.');
    const questions=createInterface({input:process.stdin,output:process.stdout});
    const currentEmail=process.env.STOCRANT_CURRENT_ADMIN_EMAIL||await questions.question('Existing Main Admin email: ');questions.close();
    const currentPassword=process.env.STOCRANT_CURRENT_ADMIN_PASSWORD||await secretPrompt('Existing Main Admin password (hidden): ');
    const result=await handover({base:process.env.STOCRANT_ADMIN_API_BASE||`http://127.0.0.1:${process.env.PORT||3000}`,storeFile:join(process.env.STOCRANT_DATA_DIR||resolve('.'),'data','stocrant.json'),currentEmail,email:process.env.STOCRANT_NEW_ADMIN_EMAIL||'mohammedbaballah142@gmail.com',name:process.env.STOCRANT_NEW_ADMIN_NAME||'Mohammed Baballah',currentPassword,onCredentials:credentials=>console.log('\nSAVE THESE PRIVATE CREDENTIALS — do not paste them into chat or GitHub:\n'+JSON.stringify(credentials,null,2))});
    console.log('Handover verified. Business history is preserved. Change the generated password and edit details in My profile.\n'+JSON.stringify(result,null,2));
  }catch(error){console.error('Handover stopped: '+error.message+'\nNo records are deleted. If credentials were printed, keep them; completed archive/access changes may already have applied.');process.exitCode=1;}
}
