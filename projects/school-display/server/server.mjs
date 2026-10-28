import {createServer} from 'node:http';
import {createServer as createSecureServer} from 'node:https';
import {createHmac} from 'node:crypto';
import {previewTime,validateSpecialDays,publicationIssues,validateAnnouncement} from './planning.mjs';
import {isAdmin,canAccess,assignments} from './access.mjs';
import {createRecovery} from './recovery.mjs';
import {restoreDevices} from './devices.mjs';
import {createUpdates} from './updates.mjs';
import {createRemote} from './remote.mjs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,extname} from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {openStore,defaultSettings} from './store.mjs';
import {defaultClasses,validateClasses,validateClassSchedule} from './classes.mjs';
import {createImages,validPhotoPath} from './images.mjs';
import {validateSchedule,sampleSchedule} from '../shared/schedule.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const hash=(password,salt)=>scryptSync(password,salt,64);
const verify=(password,admin)=>typeof password==='string' && password.length<=256 && timingSafeEqual(hash(password,admin.salt),Buffer.from(admin.hash,'hex'));
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function credentials(body){if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100||typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email)||body.email.length>180)fail('Enter your name and a valid email.');if(typeof body.password!=='string'||body.password.length<12||body.password.length>256)fail('Use a password of at least 12 characters.');const salt=randomBytes(16).toString('hex');return {name:body.name.trim(),email:body.email.toLowerCase().trim(),salt,hash:hash(body.password,salt).toString('hex')};}
export function validateSettings(input) {
  const s={...defaultSettings(),...input};
  for(const key of ['schoolEn','schoolAr','announcementEn','announcementAr']) if(typeof s[key]!=='string'||s[key].length>500)fail('School and announcement text must be under 500 characters.');
  try { new Intl.DateTimeFormat('en',{timeZone:s.timezone}).format(); } catch { fail('Choose a valid school timezone.'); }
  if(!['en','ar','both'].includes(s.language)||!['top','bottom'].includes(s.position)||!['standard','compact'].includes(s.size)||typeof s.monitor!=='string'||s.monitor.length>100||!Number.isInteger(s.alertMinutes)||s.alertMinutes<0||s.alertMinutes>30)fail('Check display settings.');
  if(!['left','center','right'].includes(s.horizontal)||!Number.isInteger(s.panelWidth)||s.panelWidth<420||s.panelWidth>1200||!Number.isInteger(s.textScale)||s.textScale<80||s.textScale>140||!Number.isInteger(s.edgeMargin)||s.edgeMargin<12||s.edgeMargin>120||typeof s.classId!=='string'||!/^[\w-]{1,80}$/.test(s.classId))fail('Check panel width, text size, alignment and margins.');
  for(const key of ['autostart','sound','paused','hideBar','fullscreenBreaks','fullscreenIdle'])if(typeof s[key]!=='boolean')fail('Check display settings.');
  if(!/^#[a-f0-9]{6}$/i.test(s.themeAccent)||!['light','dark','system'].includes(s.themeMode)||!['neutral','accent'].includes(s.panelTheme)||!Number.isInteger(s.panelOpacity)||s.panelOpacity<40||s.panelOpacity>95||!Number.isInteger(s.popupSeconds)||s.popupSeconds<3||s.popupSeconds>15||!Number.isInteger(s.notificationSeconds)||s.notificationSeconds<3||s.notificationSeconds>15||!['single','double'].includes(s.soundStyle))fail('Check theme and notification settings.');
  for(const key of ['breakImage','returnImage','logoImage'])if(!validPhotoPath(s[key]))fail('Upload the selected image before saving settings.');
  if(!Array.isArray(s.holidays)||s.holidays.length>200||s.holidays.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d))fail('Use valid holiday dates.');
  return Object.fromEntries(Object.keys(defaultSettings()).map(key=>[key,s[key]]));
}
export async function startServer({directory,port=4318,desktop=null,host='127.0.0.1',publicOrigin=null,tls=null,trustedProxy=false,setupKey=null,updateEnv=process.env,remoteOptions={}}={}) {
  const store=await openStore(directory),images=createImages(directory),sessions=new Map(),attempts=new Map();let origin;
  if((host!=='127.0.0.1'||publicOrigin)&&(!(tls||trustedProxy)||!publicOrigin?.startsWith('https://')||new URL(publicOrigin).origin!==publicOrigin))throw Error('Network mode requires TLS and an exact HTTPS public origin.');
  if(trustedProxy&&(tls||typeof setupKey!=='string'||setupKey.length<32))throw Error('Proxy mode requires a private setup key and upstream HTTPS termination.');
  const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
  const snapshot=()=>{const state=store.get();return {format:'school-display-1',settings:state.settings,draft:state.draft,published:state.published,classes:state.classes,publishedClasses:state.publishedClasses,specialDays:state.specialDays,publishedSpecialDays:state.publishedSpecialDays,devices:state.devices.map(({id,name,classId,monitor,enabled})=>({id,name,classId,monitor,enabled})),images:images.export(state.settings)};};
  const recovery=createRecovery(directory,snapshot),updates=createUpdates({directory,desktop,version,env:updateEnv}),telemetry=new Map();
  const validateRemote=value=>{
    if(!value||!value.configured||!Number.isInteger(value.revision)||value.revision<0||!Number.isFinite(value.serverTime)||!value.classInfo)throw Error('Invalid school display response.');
    const classes=validateClasses(value.classInfo.id==='default'?[value.classInfo]:[...defaultClasses(),value.classInfo]),settings=validateSettings(value.settings),classInfo=classes.find(c=>c.id===value.classInfo.id);
    if(settings.classId!==classInfo.id)throw Error('School screen class does not match.');
    settings.specialDays=validateSpecialDays(value.settings.specialDays||[],classes);
    if(value.publishedAt!==null&&(typeof value.publishedAt!=='string'||!Number.isFinite(Date.parse(value.publishedAt))))throw Error('Invalid publication date.');
    const schedule=validateClassSchedule(value.schedule,classes,validateSchedule);
    if(schedule.some(row=>row.classId!==classInfo.id)||settings.specialDays.some(row=>row.classId!==classInfo.id))throw Error('School screen contains another class.');
    return {settings,schedule,classInfo,revision:value.revision,publishedAt:value.publishedAt,serverTime:value.serverTime,configured:true};
  };
  const remote=desktop?createRemote({...remoteOptions,directory,images,validate:validateRemote,onChange:async value=>{await desktop?.applyRemote?.(value?.settings||null,remote.status().configured);}}):null;
  const classToken=(id,user)=>'view.'+user.id+'.'+id+'.'+createHmac('sha256',store.get().displayToken).update(user.id+':'+id+':'+user.hash).digest('hex');
  const displayAccess=token=>{const state=store.get();if(token===state.displayToken)return {classId:state.settings.classId};const device=state.devices.find(d=>d.token===token&&d.enabled);if(device)return {classId:device.classId,device};const parts=typeof token==='string'?token.split('.'):[];if(parts.length!==4||parts[0]!=='view'||!/^[a-f0-9]{64}$/.test(parts[3]))return null;const viewer=[state.admin,...state.users].find(u=>u&&u.id===parts[1]&&u.active!==false);if(!viewer||viewer.role==='teacher'&&!viewer.classIds.includes(parts[2])||!state.publishedClasses.some(c=>c.id===parts[2]))return null;const expected=classToken(parts[2],viewer);return timingSafeEqual(Buffer.from(expected.split('.')[3],'hex'),Buffer.from(parts[3],'hex'))?{classId:parts[2]}:null;};
  const deviceStates=()=>store.get().devices.map(device=>{const seen=telemetry.get(device.id);return {...device,displayUrl:'/display?token='+device.token,lastSeen:seen?.at||null,appliedRevision:seen?.revision??null,status:!device.enabled?'disabled':!seen||Date.now()-seen.at>15000?'offline':seen.revision!==store.get().revision?'outdated':'online'};});
  const audit=action=>{store.get().audit.unshift({at:new Date().toISOString(),action});store.get().audit=store.get().audit.slice(0,100);};
  function throttle(key,limit=10){const now=Date.now();const a=(attempts.get(key)||[]).filter(t=>now-t<15*60000);if(a.length>=limit)fail('Too many attempts. Try again in 15 minutes.',429);a.push(now);attempts.set(key,a);}
  const handler=async(req,res)=>{
    const reply=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'");
    try {
      if(req.url==='/health'&&req.method==='GET')return reply({ok:true});
      if(req.headers.host!==new URL(origin).host)fail('Invalid host.',403);
      if(trustedProxy&&req.headers['x-forwarded-proto']!=='https')fail('HTTPS is required.',403);
      const url=new URL(req.url,origin),path=url.pathname;
      if(!['GET','POST','PUT'].includes(req.method))fail('Method not allowed.',405);
      let body={};
      if(req.method!=='GET') {
        if(req.headers.origin!==origin)fail('Open the local control panel to make changes.',403);
        // Authorize uploads before buffering large bodies, then recheck the session below.
        if(path.startsWith('/api/')&&!['/api/setup','/api/login'].includes(path)){
          const headerToken=(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith('school_session='))?.slice(15),entry=sessions.get(headerToken),current=store.get();
          const actor=entry&&[current.admin,...current.users].find(u=>u&&u.id===entry.userId&&u.active!==false);
          if(!actor||entry.expires<=Date.now())fail('Sign in to the control panel.',401);
          if(!canAccess(actor,path))fail('Your role cannot perform this action.',403);
        }
        if(!(req.headers['content-type']||'').startsWith('application/json'))fail('JSON is required.',415);
        const limit=path==='/api/images'?3*1024*1024:path==='/api/restore'?128*1024*1024:['/api/draft','/api/special-days'].includes(path)?6*1024*1024:256000;
        let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)fail('Request too large.',413);chunks.push(chunk);}try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{fail('Invalid JSON.');}
      }
      const token=(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith('school_session='))?.slice(15);
      const state=store.get(),session=sessions.get(token);
      const users=[state.admin,...state.users].filter(Boolean);
      const user=session&&users.find(u=>u.id===session.userId&&u.active!==false);
      const authenticated=Boolean(user&&session.expires>Date.now());
      const publicUser=u=>({id:u.id,name:u.name,email:u.email,active:u.active!==false,owner:u===state.admin,role:u.role,classIds:u.classIds});
      if(session&&!authenticated)sessions.delete(token);

      if(path.startsWith('/api/images/')&&req.method==='GET'){
        if(!authenticated&&!displayAccess(url.searchParams.get('token')))fail('Invalid display access.',403);
        if(!authenticated&&![state.settings.breakImage,state.settings.returnImage,state.settings.logoImage,...['breakImage','returnImage','logoImage'].map(key=>remote?.snapshot()?.settings[key])].includes(path))fail('Image not found.',404);
        const image=images.read(path);res.setHeader('Content-Type',image.type);res.end(image.bytes);return;
      }
      if(path==='/api/status'&&req.method==='GET')return reply({setup:!state.admin,setupKeyRequired:trustedProxy&&!state.admin,authenticated,admin:authenticated?publicUser(user):null,desktop:Boolean(desktop)});
      if(path==='/api/setup'&&req.method==='POST') {if(state.admin)fail('The administrator already exists.',409);throttle('setup');if(trustedProxy){if(typeof body.setupKey!=='string'||body.setupKey.length>256||!timingSafeEqual(hash(body.setupKey,'setup'),hash(setupKey,'setup')))fail('Enter the private hosting setup key.',403);}else if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))fail('Create the initial administrator on the server computer.',403);state.admin={...credentials(body),role:'admin',classIds:[],id:randomBytes(16).toString('hex'),active:true};audit('Administrator created');store.save();return reply({ok:true});}
      if(path==='/api/login'&&req.method==='POST'){throttle('login-all',300);if(typeof body.email!=='string'||body.email.length>180)fail('Email or password is incorrect.',401);throttle('login:'+body.email.trim().toLowerCase());const account=users.find(u=>u.active!==false&&String(body.email).toLowerCase().trim()===u.email);if(!account||!verify(body.password,account))fail('Email or password is incorrect.',401);for(const [key,value] of sessions)if(value.expires<Date.now()||value.userId===account.id)sessions.delete(key);const value=randomBytes(32).toString('hex');sessions.set(value,{userId:account.id,expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',`school_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${tls||trustedProxy?'; Secure':''}`);return reply({ok:true});}
      if(path==='/api/display'&&req.method==='GET') {
        const access=displayAccess(url.searchParams.get('token'));if(!access)fail('Invalid display access.',403);
        if(remote?.status().configured&&url.searchParams.get('token')===state.displayToken){const value=remote.snapshot();if(value)return reply(value);if(remote.status().revoked)fail('This screen was disabled. Reconnect with a new screen link.',403);fail('Waiting to synchronize with the school server.',503);}
        if(access.device&&!url.searchParams.has('preview'))telemetry.set(access.device.id,{at:Date.now(),revision:Number(url.searchParams.get('revision')||0)});
        const classId=access.classId,settings={...state.settings,classId,specialDays:state.publishedSpecialDays.filter(row=>row.classId===classId)};
        const notices=state.announcements.filter(row=>row.classIds.includes(classId)&&Date.parse(row.expiresAt)>Date.now());
        if(notices.length){settings.announcementEn=notices.at(-1).textEn;settings.announcementAr=notices.at(-1).textAr;}
        return reply({settings,schedule:state.published.filter(row=>(row.classId||'default')===classId),classInfo:state.publishedClasses.find(row=>row.id===classId),revision:state.revision,publishedAt:state.publishedAt,serverTime:Date.now(),configured:Boolean(state.admin)});
      }
      if(path.startsWith('/api/')) {
        if(!authenticated)fail('Sign in to the control panel.',401);
        if(!canAccess(user,path))fail('Your role cannot perform this action.',403);
        if(path==='/api/remote'&&req.method==='GET'){if(!remote)fail('Connect from the Windows app on the classroom computer.',409);return reply(remote.status());}
        if(path==='/api/remote'&&req.method==='POST'){
          if(!remote)fail('Connect from the Windows app on the classroom computer.',409);
          throttle('sensitive:'+user.id);if(!verify(body.password,user))fail('Administrator password is incorrect.',403);
          let result;try{result=body.disconnect===true?await remote.disconnect():await remote.connect(body.url);}catch{fail('Could not connect. Check the HTTPS screen link and that the school server is available.',400);}audit(body.disconnect?'Remote school disconnected':'Remote school connected');store.save();return reply(result);
        }
        if(path==='/api/preview'&&req.method==='GET'){const classId=url.searchParams.get('classId')||'default';if(!state.classes.some(c=>c.id===classId))fail('Class group not found.',404);return reply({settings:{...state.settings,classId,specialDays:state.specialDays.filter(row=>row.classId===classId)},schedule:state.draft.filter(row=>(row.classId||'default')===classId),classInfo:state.classes.find(c=>c.id===classId),configured:true,publishedAt:state.publishedAt||new Date().toISOString(),revision:state.revision,serverTime:url.searchParams.has('date')?previewTime(url.searchParams.get('date'),url.searchParams.get('time')||'07:30',state.settings.timezone):Date.now(),draft:true});}
        if(path==='/api/devices'&&['POST','PUT'].includes(req.method)){
          if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100||!state.publishedClasses.some(c=>c.id===body.classId)||typeof body.monitor!=='string'||body.monitor.length>100||typeof body.enabled!=='boolean')fail('Name the screen and select a published class.');
          if(body.monitor!=='browser'&&!(desktop?.monitors()||[]).some(m=>m.id===body.monitor))fail('Choose a connected monitor or browser display.');
          if(body.enabled&&body.monitor!=='browser'&&state.devices.some(d=>d.id!==body.id&&d.enabled&&d.monitor===body.monitor))fail('This monitor already has an assigned screen.');
          let device;if(req.method==='POST'){if(state.devices.length>=100)fail('Use up to 100 screens.');device={id:randomBytes(16).toString('hex'),token:randomBytes(32).toString('hex'),createdAt:new Date().toISOString()};}else{device=state.devices.find(d=>d.id===body.id);if(!device)fail('Screen not found.',404);device={...device};}
          Object.assign(device,{name:body.name.trim(),classId:body.classId,monitor:body.monitor,enabled:body.enabled});
          if(body.renew===true)device.token=randomBytes(32).toString('hex');
          const next=req.method==='POST'?[...state.devices,device]:state.devices.map(d=>d.id===device.id?device:d);
          await desktop?.applyDevices?.(next);state.devices=next;audit('Screen assignment updated');store.save();return reply({device:deviceStates().find(d=>d.id===device.id)});
        }
        if(path==='/api/special-days'&&req.method==='PUT'){state.specialDays=validateSpecialDays(body.specialDays,state.classes);audit('Special-day draft saved');store.save();return reply({ok:true});}
        if(path==='/api/announcements'&&req.method==='POST'){const notice={...validateAnnouncement(body,state.publishedClasses),id:randomBytes(16).toString('hex')};state.announcements=state.announcements.filter(n=>Date.parse(n.expiresAt)>Date.now()).slice(-49).concat(notice);audit('Class announcement sent');store.save();return reply({ok:true});}
        if(path==='/api/recovery'&&req.method==='GET')return reply({backups:recovery.list(),status:recovery.status()});
        if(path==='/api/recovery'&&req.method==='POST')return reply(recovery.save('manual'));
        if(path==='/api/recovery/export'&&req.method==='POST')return reply(recovery.read(body.name));
        if(path==='/api/updates'&&req.method==='GET')return reply(updates.status());
        if(path==='/api/updates/check'&&req.method==='POST')return reply(await updates.check());
        if(path==='/api/updates/download'&&req.method==='POST')return reply(await updates.download());
        if(path==='/api/updates/install'&&req.method==='POST'){throttle('sensitive:'+user.id);if(!verify(body.password,user))fail('Administrator password is incorrect.',403);recovery.save('before-update');return reply(await updates.install());}
        if(path==='/api/classes'&&['POST','PUT'].includes(req.method)){
          const id=req.method==='POST'?randomBytes(16).toString('hex'):body.id;
          if(req.method==='PUT'&&!state.classes.some(row=>row.id===id))fail('Class group not found.',404);
          const group={id,nameEn:body.nameEn,nameAr:body.nameAr};
          state.classes=validateClasses(req.method==='POST'?[...state.classes,group]:state.classes.map(row=>row.id===id?group:row));audit('Class group saved');store.save();return reply({group});
        }
        if(path==='/api/users'&&req.method==='GET')return reply({users:users.map(publicUser)});
        if(path==='/api/users'&&req.method==='POST'){
          throttle('users');if(users.length>=50)fail('A maximum of 50 users is supported.');
          const account=credentials(body);if(users.some(u=>u.email===account.email))fail('This email already has an account.',409);
          const created={...account,id:randomBytes(16).toString('hex'),active:true,...assignments(body,state.classes)};state.users.push(created);audit('User added: '+created.email);store.save();return reply({user:publicUser(created)});
        }
        if(path==='/api/users'&&req.method==='PUT'){
          const target=state.users.find(u=>u.id===body.id);if(!target||target===user)fail('The original administrator and your own account cannot be disabled.');
          if(typeof body.active!=='boolean')fail('Choose an account status.');if(body.role)Object.assign(target,assignments(body,state.classes));target.active=body.active;
          for(const [key,value] of sessions)if(value.userId===target.id)sessions.delete(key);
          audit((target.active?'Administrator enabled: ':'Administrator disabled: ')+target.email);store.save();return reply({ok:true});
        }
        if(path==='/api/images'&&req.method==='POST'){const image=images.upload(body.data);audit('Display image uploaded');store.save();return reply({image});}
        if(path==='/api/logout'&&req.method==='POST'){sessions.delete(token);res.setHeader('Set-Cookie','school_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return reply({ok:true});}
        if(path==='/api/state'&&req.method==='GET'){
          const visible=c=>user.role!=='teacher'||user.classIds.includes(c.id),classes=(user.role==='teacher'?state.publishedClasses:state.classes).filter(visible),ids=new Set(classes.map(c=>c.id)),rowVisible=row=>ids.has(row.classId||'default');
          const settings={...state.settings,specialDays:state.publishedSpecialDays.filter(rowVisible)};if(!ids.has(settings.classId))settings.classId=classes[0]?.id||'default';
          return reply({settings,draft:(user.role==='teacher'?state.published:state.draft).filter(rowVisible),published:state.published.filter(rowVisible),classes,publishedClasses:state.publishedClasses.filter(visible),specialDays:(user.role==='teacher'?state.publishedSpecialDays:state.specialDays).filter(rowVisible),publishedSpecialDays:state.publishedSpecialDays.filter(rowVisible),issues:(user.role==='teacher'?[]:publicationIssues(state.draft,state.specialDays,state.settings.holidays)).filter(issue=>issue.classIds.every(id=>ids.has(id))),revision:state.revision,publishedAt:state.publishedAt,audit:isAdmin(user)?state.audit:[],devices:isAdmin(user)?deviceStates():[],recovery:isAdmin(user)?{...recovery.status(),databaseRecovered:store.recovered}:null,updates:isAdmin(user)?updates.status():null,version,remote:isAdmin(user)?remote?.status()||null:null,displayUrl:'/display?token='+(isAdmin(user)?state.displayToken:classToken(settings.classId,user)),monitors:isAdmin(user)?desktop?.monitors()||[]:[],desktop:Boolean(desktop),network:{secure:Boolean(tls||trustedProxy),local:!publicOrigin&&host==='127.0.0.1'},admin:publicUser(user)});
        }
        if(path==='/api/draft'&&req.method==='PUT'){state.draft=validateClassSchedule(body.schedule,state.classes,validateSchedule);audit('Draft timetable saved');store.save();return reply({ok:true});}
        if(path==='/api/sample'&&req.method==='POST'){const classId=body.classId||'default';if(!state.classes.some(row=>row.id===classId))fail('Choose an existing class group.');state.draft=state.draft.filter(row=>(row.classId||'default')!==classId).concat(sampleSchedule().map(row=>({...row,classId,id:classId+':'+row.id})));audit('Sample timetable loaded into draft');store.save();return reply({ok:true});}
        if(path==='/api/publish'&&req.method==='POST'){const published=validateClassSchedule(state.draft,state.classes,validateSchedule),specialDays=validateSpecialDays(state.specialDays,state.classes);if(publicationIssues(published,specialDays,state.settings.holidays).length)fail('Resolve teacher double bookings before publishing.',409);recovery.save('before-publish');state.published=published;state.publishedSpecialDays=structuredClone(specialDays);state.publishedClasses=structuredClone(state.classes);state.revision++;state.publishedAt=new Date().toISOString();audit('Timetable published');store.save();return reply({ok:true});}
        if(path==='/api/settings'&&req.method==='PUT'){const settings=validateSettings(body);if(!state.publishedClasses.some(row=>row.id===settings.classId))fail('Publish this class group before selecting it for the monitor.');images.check(settings);await desktop?.apply(settings);state.settings=settings;audit('Display settings updated');store.save();return reply({ok:true});}
        if(path==='/api/backup'&&req.method==='GET')return reply(snapshot());
        if(path==='/api/restore'&&req.method==='POST'){throttle('sensitive');if(!verify(body.password,user))fail('Administrator password is incorrect.',403);const b=body.backup;if(b?.format!=='school-display-1')fail('Choose a School Display backup.');const classes=validateClasses(b.classes||defaultClasses()),publishedClasses=validateClasses(b.publishedClasses||b.classes||defaultClasses()),draft=validateClassSchedule(b.draft,classes,validateSchedule),published=validateClassSchedule(b.published,publishedClasses,validateSchedule),settings=validateSettings(b.settings);if(publishedClasses.some(row=>!classes.some(group=>group.id===row.id)))fail('Published class groups must also exist in the draft.');if(!publishedClasses.some(row=>row.id===settings.classId))fail('The selected class group is missing from this backup.');const specialDays=validateSpecialDays(b.specialDays||[],classes),publishedSpecialDays=validateSpecialDays(b.publishedSpecialDays||[],publishedClasses);if(publicationIssues(published,publishedSpecialDays,settings.holidays).length)fail('Resolve teacher double bookings before restoring.');const devices=b.devices===undefined?state.devices:restoreDevices(b.devices,publishedClasses,state.devices);if(devices.some(d=>!publishedClasses.some(c=>c.id===d.classId)))fail('Reassign existing screens before restoring a backup without their classes.');const saveImages=images.prepareRestore(b.images,settings);recovery.save('before-restore');await desktop?.apply(settings);await desktop?.applyDevices?.(devices,settings);saveImages();Object.assign(state,{draft,published,classes,publishedClasses,specialDays,publishedSpecialDays,devices,announcements:[],settings,revision:state.revision+1,publishedAt:new Date().toISOString()});audit('Backup restored');store.save();return reply({ok:true});}
        if(path==='/api/account'&&req.method==='PUT'){throttle('sensitive');if(!verify(body.currentPassword,user))fail('Current password is incorrect.',403);const updated=credentials(body);if(users.some(u=>u!==user&&u.email===updated.email))fail('This email already has an account.',409);Object.assign(user,updated);for(const [key,value] of sessions)if(value.userId===user.id)sessions.delete(key);audit('Administrator account updated');store.save();return reply({ok:true});}
        if(path==='/api/rotate-display'&&req.method==='POST'){throttle('sensitive');if(!verify(body.password,user))fail('Administrator password is incorrect.',403);state.displayToken=randomBytes(32).toString('hex');audit('Display access renewed');store.save();for(const device of state.devices)device.token=randomBytes(32).toString('hex');store.save();await desktop?.applyDevices?.(state.devices);await desktop?.reload(state.displayToken);return reply({ok:true});}
        if(path==='/api/exit'&&req.method==='POST'){throttle('sensitive');if(!verify(body.password,user))fail('Administrator password is incorrect.',403);if(!desktop)fail('The desktop app is not running.',409);audit('Desktop exit authorized');store.save();reply({ok:true});setTimeout(()=>desktop.exit(),250);return;}
        fail('Not found.',404);
      }
      const files={'/':'web/index.html','/control':'web/index.html','/display':'web/display.html','/app.js':'web/app.js','/display.js':'web/display.js','/i18n.js':'web/i18n.js','/styles.css':'web/styles.css','/display.css':'web/display.css','/schedule.mjs':'shared/schedule.mjs','/theme.js':'web/theme.js','/workspace.js':'web/workspace.js','/ios.css':'web/ios.css','/remote.js':'web/remote.js','/icon.svg':'assets/icon.svg','/images/student-break.png':'assets/student-break.png','/images/student-return.png':'assets/student-return.png'};
      if(req.method!=='GET'||!files[path])fail('Not found.',404);
      const data=await readFile(join(root,files[path]));res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'})[extname(files[path])]);res.end(data);
    }catch(error){reply({error:error.status?error.message:error.message?.includes('overlap')||error.message?.includes('time')||error.message?.includes('teacher')||error.message?.includes('timetable')||error.message?.includes('class')?error.message:'Could not complete the request.'},error.status||400);}
  };
  const server=tls?createSecureServer(tls,handler):createServer(handler);
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});}catch(error){remote?.close();recovery.close();store.close();throw error;}origin=publicOrigin||`http://127.0.0.1:${server.address().port}`;
  return {server,origin,store,remote,close:async()=>{remote?.close();recovery.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}};
}
