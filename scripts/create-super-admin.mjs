import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {secretPrompt} from './admin-handover.mjs';

/** Create a separate platform-owner login through the running app; preserve all existing data. */
export async function createSuperAdmin({base,currentEmail,currentPassword,email,name,onCredentials=()=>{}}){
  const origin=new URL(base);
  if(origin.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw new Error('Use HTTPS or the loopback service address.');
  let cookie='';
  async function api(path,method='GET',body,session=cookie){
    const response=await fetch(new URL('/api'+path,base),{method,redirect:'error',headers:{Cookie:session,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await response.json();if(!response.ok)throw new Error(`${path}: ${response.status} ${data.error||'Request failed'}`);
    return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  cookie=(await api('/auth/login','POST',{email:currentEmail,password:currentPassword},'')).cookie;
  const actor=(await api('/auth/me')).data.user;
  if(actor.roleId!=='role-main-manager'||actor.mustChangePassword)throw new Error('Use an existing platform administrator whose password setup is complete.');
  const users=(await api('/workspace/access/users')).data.items;
  if(users.some(user=>user.email.toLowerCase()===email.trim().toLowerCase()))throw new Error('This email already has an account. Enter a different email for the additional login.');
  const password=randomBytes(24).toString('base64url');
  const created=(await api('/workspace/access/users','POST',{name,email:email.trim(),password,roleId:'role-main-manager',organizationIds:[],ownRecordsOnly:false})).data.item;
  // Print privately as soon as creation succeeds so a verification failure cannot hide credentials.
  onCredentials({email:created.email,username:created.username,password});
  const login=await api('/auth/login','POST',{email:created.email,password},'');
  const verified=(await api('/auth/me','GET',undefined,login.cookie)).data.user;
  if(verified.id!==created.id||verified.roleId!=='role-main-manager'||!verified.permissions.includes('*')||verified.accountStatus!=='active')throw new Error('The account was created, but full Super Admin login verification failed. Keep its credentials for recovery.');
  await api('/auth/logout','POST',{},login.cookie);
  return {accountId:created.id,email:created.email,verified:true,mustChangePassword:verified.mustChangePassword};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const prompts=createInterface({input:process.stdin,output:process.stdout});
    const currentEmail=(process.env.STOCRANT_CURRENT_ADMIN_EMAIL||await prompts.question('Existing platform administrator email: ')).trim();
    const email=(process.env.STOCRANT_NEW_ADMIN_EMAIL||await prompts.question('Email for the additional Super Admin (must be unused): ')).trim();prompts.close();
    const currentPassword=process.env.STOCRANT_CURRENT_ADMIN_PASSWORD||await secretPrompt('Existing administrator password (hidden): ');
    const result=await createSuperAdmin({base:process.env.STOCRANT_ADMIN_API_BASE||`http://127.0.0.1:${process.env.PORT||3000}`,currentEmail,currentPassword,email,name:process.env.STOCRANT_NEW_ADMIN_NAME||'Mohammed Baballah',onCredentials:value=>console.log('\nSAVE THESE PRIVATE CREDENTIALS — do not share passwords in chat or GitHub:\n'+JSON.stringify(value,null,2))});
    console.log('Additional Super Admin login verified. Change the temporary password at first sign-in. Existing accounts and companies remain unchanged.\n'+JSON.stringify(result,null,2));
  }catch(error){console.error('Super Admin creation stopped: '+error.message);process.exitCode=1;}
}
