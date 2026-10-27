import {readFileSync,statSync,mkdirSync,openSync,closeSync,writeSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export function newerVersion(next,current){const parts=v=>/^\d+\.\d+\.\d+$/.test(v)?v.split('.').map(Number):null,a=parts(next),b=parts(current);return Boolean(a&&b&&a.some((n,i)=>n>b[i]&&a.slice(0,i).every((v,j)=>v===b[j])));}
export function validateManifest(manifest,feed,current){
 if(!manifest||!newerVersion(manifest.version,current)||typeof manifest.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(manifest.sha256)||!Number.isInteger(manifest.bytes)||manifest.bytes<1||manifest.bytes>300*1024*1024)fail('The update manifest is invalid or is not newer.');
 const url=new URL(manifest.url,feed);if(url.protocol!=='https:'||url.origin!==new URL(feed).origin||url.username||url.password||!url.pathname.endsWith('.exe'))fail('The installer must use the trusted HTTPS update host.');
 return {version:manifest.version,sha256:manifest.sha256.toLowerCase(),bytes:manifest.bytes,url:url.href};
}
export function createUpdates({directory,desktop,version,env=process.env,fetcher=fetch}){
 const feed=env.SCHOOL_UPDATE_URL,signer=env.SCHOOL_UPDATE_SIGNER?.replace(/\s/g,'').toUpperCase();let latest=null,staged=null,busy=false;
 const configured=Boolean(feed&&signer&&/^[A-F0-9]{40}$/.test(signer)&&(()=>{try{const u=new URL(feed);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}})());
 const status=()=>({version,configured,available:latest?{version:latest.version,bytes:latest.bytes}:null,staged:staged?.version||null,busy,canInstall:Boolean(desktop?.verifyInstaller&&desktop?.installUpdate),signingRequired:true});
 async function check(){if(!configured)fail('Configure an HTTPS update feed and trusted signing certificate first.');const r=await fetcher(feed,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)fail('The update feed is unavailable.');let content='';for await(const chunk of r.body){content+=Buffer.from(chunk).toString();if(content.length>64000)fail('The update manifest is too large.');}const input=JSON.parse(content);if(input.version===version){latest=null;return status();}latest=validateManifest(input,feed,version);return status();}
 async function download(){
  if(busy)fail('An update is already in progress.');if(!latest||!desktop?.verifyInstaller)fail('Check for updates from the Windows application first.');busy=true;const manifest={...latest};let file,fd;
  try{const folder=join(directory,'updates');mkdirSync(folder,{recursive:true});file=join(folder,randomBytes(16).toString('hex')+'.exe');fd=openSync(file+'.part','wx',0o600);const response=await fetcher(manifest.url,{signal:AbortSignal.timeout(120000),redirect:'error'});if(!response.ok)fail('Could not download the update.');const hash=createHash('sha256');let bytes=0;
   for await(const chunk of response.body){const buffer=Buffer.from(chunk);bytes+=buffer.length;if(bytes>manifest.bytes)fail('The installer size does not match.');hash.update(buffer);writeSync(fd,buffer);}closeSync(fd);fd=undefined;
   if(bytes!==manifest.bytes||hash.digest('hex')!==manifest.sha256)fail('The installer checksum does not match.');renameSync(file+'.part',file);
   const signature=await desktop.verifyInstaller(file);if(!signature.valid||signature.thumbprint?.toUpperCase()!==signer)fail('The installer is not signed by the trusted publisher.');
   if(staged?.file)try{unlinkSync(staged.file);}catch{}staged={...manifest,file};return status();
  }catch(error){if(fd!==undefined){closeSync(fd);fd=undefined;}for(const candidate of [file,file&&file+'.part'])if(candidate)try{unlinkSync(candidate);}catch{}throw error;}finally{if(fd!==undefined)closeSync(fd);busy=false;}
 }
 async function install(){if(!staged||!desktop?.installUpdate)fail('Download and verify an update first.');if(statSync(staged.file).size!==staged.bytes||createHash('sha256').update(readFileSync(staged.file)).digest('hex')!==staged.sha256)fail('The staged installer has changed. Download it again.');const signature=await desktop.verifyInstaller(staged.file);if(!signature.valid||signature.thumbprint?.toUpperCase()!==signer)fail('The installer signature is no longer valid.');await desktop.installUpdate(staged.file);return {ok:true};}
 return {status,check,download,install};
}
