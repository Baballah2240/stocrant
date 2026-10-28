import {imageRefs} from '../shared/media.mjs';
import {existsSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';

// A display link grants read-only access to one assigned class, never administration.
export function displayLink(value,{allowLoopback=false}={}){
 const url=new URL(value);
 if(!(url.protocol==='https:'||(allowLoopback&&url.protocol==='http:'&&url.hostname==='127.0.0.1'))||url.username||url.password||url.pathname!=='/display'||url.hash||!/^[a-f0-9]{64}$/.test(url.searchParams.get('token')||'')||[...url.searchParams.keys()].some(k=>k!=='token'))throw Error('Paste an HTTPS screen link from Classrooms & screens.');
 return {origin:url.origin,token:url.searchParams.get('token')};
}
async function bounded(response,max){
 if(!response.ok)throw Object.assign(Error('The school server is unavailable.'),{status:response.status});
 let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>max)throw Error('School response too large.');chunks.push(chunk);}return Buffer.concat(chunks);
}
export function createRemote({directory,images,validate,onChange=async()=>{},fetcher=fetch,allowLoopback=false,interval=5000}){
 const file=join(directory,'remote-screen.json');let config=null,cached=null,lastSync=null,online=false,revoked=false,busy=false,closed=false,generation=0;
 const save=()=>{writeFileSync(file+'.tmp',JSON.stringify({config,cached,lastSync}),{mode:0o600});renameSync(file+'.tmp',file);};
 try{if(existsSync(file)){const saved=JSON.parse(readFileSync(file,'utf8'));config=displayLink(saved.config.origin+'/display?token='+saved.config.token,{allowLoopback});cached=saved.cached?validate(saved.cached):null;lastSync=saved.lastSync;}}catch{throw Error('The remote screen configuration is damaged. Restore it or remove remote-screen.json while the app is closed.');}
 function status(){return {configured:Boolean(config),origin:config?.origin||null,online,revoked,lastSync,revision:cached?.revision??null};}
 async function download(connection){
  const response=await fetcher(connection.origin+'/api/display?token='+connection.token+'&revision='+(cached?.revision||0),{redirect:'error',signal:AbortSignal.timeout(10000)});
  const next=validate(JSON.parse((await bounded(response,8*1024*1024)).toString()));
  for(const ref of imageRefs(next.settings,next.schedule,next.settings.specialDays)){
   if(!ref.startsWith('/api/images/'))continue;
   try{images.read(ref);continue;}catch{}
   const bytes=await bounded(await fetcher(connection.origin+ref+'?token='+connection.token,{redirect:'error',signal:AbortSignal.timeout(10000)}),2*1024*1024);
   const type=ref.endsWith('.jpg')?'jpeg':ref.split('.').at(-1),saved=images.upload('data:image/'+type+';base64,'+bytes.toString('base64'));
   if(saved!==ref)throw Error('The school image checksum does not match.');
  }
  return next;
 }
 async function sync(){
  if(!config||busy||closed)return;busy=true;const at=generation,current=config;
  try{const next=await download(current);if(closed||at!==generation)return;cached=next;lastSync=Date.now();online=true;revoked=false;save();await onChange(cached);}
  catch(error){if(at!==generation||closed)return;online=false;if([401,403].includes(error.status)){revoked=true;cached=null;save();await onChange(null);}}
  finally{busy=false;}
 }
 const timer=setInterval(()=>{void sync();},interval);timer.unref();
 return {
  status,sync,
  // Use current local wall time during an outage; a stale server timestamp would freeze the timetable.
  snapshot:()=>cached?{...structuredClone(cached),serverTime:Date.now(),remote:{...status()}}:null,
  connect:async value=>{if(busy)throw Error('Synchronization is busy. Try again shortly.');busy=true;const at=generation;try{const connection=displayLink(value,{allowLoopback}),next=await download(connection);if(closed||at!==generation)throw Error('Connection cancelled.');generation++;config=connection;cached=next;lastSync=Date.now();online=true;revoked=false;save();await onChange(cached);return status();}finally{busy=false;}},
  disconnect:async()=>{generation++;config=null;cached=null;lastSync=null;online=false;revoked=false;if(existsSync(file))unlinkSync(file);await onChange(null);return status();},
  close:()=>{closed=true;generation++;clearInterval(timer);}
 };
}
