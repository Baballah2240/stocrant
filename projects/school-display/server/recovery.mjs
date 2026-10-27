import {mkdirSync,writeFileSync,renameSync,readdirSync,readFileSync,unlinkSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
export function createRecovery(directory,snapshot){
 const folder=join(directory,'backups');mkdirSync(folder,{recursive:true});let error=null;
 const list=()=>readdirSync(folder).filter(name=>/^backup-[\dT-]+-[a-f0-9]{8}\.json$/.test(name)).sort().reverse().map(name=>({name,bytes:statSync(join(folder,name)).size,at:statSync(join(folder,name)).mtime.toISOString()}));
 function save(reason='automatic'){
  const name='backup-'+new Date().toISOString().replace(/[:.Z]/g,'-')+'-'+randomBytes(4).toString('hex')+'.json',target=join(folder,name);
  try{writeFileSync(target+'.tmp',JSON.stringify({...snapshot(),backupReason:reason}),{mode:0o600});renameSync(target+'.tmp',target);for(const row of list().slice(14))unlinkSync(join(folder,row.name));error=null;return {name};}catch(cause){error=cause.message;throw cause;}
 }
 function read(name){if(!list().some(row=>row.name===name))throw Object.assign(Error('Backup not found.'),{status:404});return JSON.parse(readFileSync(join(folder,name),'utf8'));}
 // Backups are business-data exports; credentials remain only in the live database.
 const safely=()=>{try{save();}catch{}};if(!list().length)safely();
 const timer=setInterval(safely,6*3600000);timer.unref();
 return {save,read,list,status:()=>({retained:list().length,last:list()[0]||null,error}),close:()=>clearInterval(timer)};
}
