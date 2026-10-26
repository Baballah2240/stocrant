import {createServer} from 'node:http';
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
  for(const key of ['autostart','sound','paused','fullscreenBreaks','fullscreenIdle'])if(typeof s[key]!=='boolean')fail('Check display settings.');
  for(const key of ['breakImage','returnImage'])if(!validPhotoPath(s[key]))fail('Upload the selected image before saving settings.');
  if(!Array.isArray(s.holidays)||s.holidays.length>200||s.holidays.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d))fail('Use valid holiday dates.');
  return Object.fromEntries(Object.keys(defaultSettings()).map(key=>[key,s[key]]));
}
export async function startServer({directory,port=4318,desktop=null}={}) {
  const store=await openStore(directory),images=createImages(directory),sessions=new Map(),attempts=new Map();let origin;
  const audit=action=>{store.get().audit.unshift({at:new Date().toISOString(),action});store.get().audit=store.get().audit.slice(0,100);};
  function throttle(key){const now=Date.now();const a=(attempts.get(key)||[]).filter(t=>now-t<15*60000);if(a.length>=10)fail('Too many attempts. Try again in 15 minutes.',429);a.push(now);attempts.set(key,a);}
  const server=createServer(async(req,res)=>{
    const reply=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'");
    try {
      if(req.headers.host!==new URL(origin).host)fail('Invalid host.',403);
      const url=new URL(req.url,origin),path=url.pathname;
      if(!['GET','POST','PUT'].includes(req.method))fail('Method not allowed.',405);
      let body={};
      if(req.method!=='GET') {
        if(req.headers.origin!==origin)fail('Open the local control panel to make changes.',403);
        if(!(req.headers['content-type']||'').startsWith('application/json'))fail('JSON is required.',415);
        const limit=path==='/api/images'?3*1024*1024:path==='/api/restore'?16*1024*1024:path==='/api/draft'?6*1024*1024:256000;
        let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)fail('Request too large.',413);chunks.push(chunk);}try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{fail('Invalid JSON.');}
      }
      const token=(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith('school_session='))?.slice(15);
      const state=store.get(),session=sessions.get(token);
      const users=[state.admin,...state.users].filter(Boolean);
      const user=session&&users.find(u=>u.id===session.userId&&u.active!==false);
      const authenticated=Boolean(user&&session.expires>Date.now());
      const publicUser=u=>({id:u.id,name:u.name,email:u.email,active:u.active!==false,owner:u===state.admin});
      if(session&&!authenticated)sessions.delete(token);

      if(path.startsWith('/api/images/')&&req.method==='GET'){
        if(!authenticated&&url.searchParams.get('token')!==state.displayToken)fail('Invalid display access.',403);
        if(!authenticated&&![state.settings.breakImage,state.settings.returnImage].includes(path))fail('Image not found.',404);
        const image=images.read(path);res.setHeader('Content-Type',image.type);res.end(image.bytes);return;
      }
      if(path==='/api/status'&&req.method==='GET')return reply({setup:!state.admin,authenticated,admin:authenticated?publicUser(user):null,desktop:Boolean(desktop)});
      if(path==='/api/setup'&&req.method==='POST') {if(state.admin)fail('The administrator already exists.',409);throttle('setup');state.admin={...credentials(body),id:randomBytes(16).toString('hex'),active:true};audit('Administrator created');store.save();return reply({ok:true});}
      if(path==='/api/login'&&req.method==='POST'){throttle('login');const account=users.find(u=>u.active!==false&&String(body.email).toLowerCase().trim()===u.email);if(!account||!verify(body.password,account))fail('Email or password is incorrect.',401);for(const [key,value] of sessions)if(value.expires<Date.now()||value.userId===account.id)sessions.delete(key);const value=randomBytes(32).toString('hex');sessions.set(value,{userId:account.id,expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',`school_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return reply({ok:true});}
      if(path==='/api/display'&&req.method==='GET') {if(url.searchParams.get('token')!==state.displayToken)fail('Invalid display access.',403);return reply({settings:state.settings,schedule:state.published.filter(row=>(row.classId||'default')===state.settings.classId),classInfo:state.publishedClasses.find(row=>row.id===state.settings.classId),revision:state.revision,publishedAt:state.publishedAt,serverTime:Date.now(),configured:Boolean(state.admin)});}
      if(path.startsWith('/api/')) {
        if(!authenticated)fail('Sign in to the control panel.',401);
        if(path==='/api/classes'&&['POST','PUT'].includes(req.method)){
          const id=req.method==='POST'?randomBytes(16).toString('hex'):body.id;
          if(req.method==='PUT'&&!state.classes.some(row=>row.id===id))fail('Class group not found.',404);
          const group={id,nameEn:body.nameEn,nameAr:body.nameAr};
          state.classes=validateClasses(req.method==='POST'?[...state.classes,group]:state.classes.map(row=>row.id===id?group:row));audit('Class group saved');store.save();return reply({group});
        }
        if(path==='/api/users'&&req.method==='GET')return reply({users:users.map(publicUser)});
        if(path==='/api/users'&&req.method==='POST'){
          throttle('users');if(users.length>=50)fail('A maximum of 50 administrators is supported.');
          const account=credentials(body);if(users.some(u=>u.email===account.email))fail('This email already has an account.',409);
          const created={...account,id:randomBytes(16).toString('hex'),active:true};state.users.push(created);audit('Administrator added: '+created.email);store.save();return reply({user:publicUser(created)});
        }
        if(path==='/api/users'&&req.method==='PUT'){
          const target=state.users.find(u=>u.id===body.id);if(!target||target===user)fail('The original administrator and your own account cannot be disabled.');
          if(typeof body.active!=='boolean')fail('Choose an account status.');target.active=body.active;
          for(const [key,value] of sessions)if(value.userId===target.id)sessions.delete(key);
          audit((target.active?'Administrator enabled: ':'Administrator disabled: ')+target.email);store.save();return reply({ok:true});
        }
        if(path==='/api/images'&&req.method==='POST'){const image=images.upload(body.data);audit('Display image uploaded');store.save();return reply({image});}
        if(path==='/api/logout'&&req.method==='POST'){sessions.delete(token);res.setHeader('Set-Cookie','school_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return reply({ok:true});}
        if(path==='/api/state'&&req.method==='GET')return reply({settings:state.settings,draft:state.draft,published:state.published,classes:state.classes,publishedClasses:state.publishedClasses,revision:state.revision,publishedAt:state.publishedAt,audit:state.audit,displayUrl:`/display?token=${state.displayToken}`,monitors:desktop?.monitors()||[],desktop:Boolean(desktop),admin:publicUser(user)});
        if(path==='/api/draft'&&req.method==='PUT'){state.draft=validateClassSchedule(body.schedule,state.classes,validateSchedule);audit('Draft timetable saved');store.save();return reply({ok:true});}
        if(path==='/api/sample'&&req.method==='POST'){const classId=body.classId||'default';if(!state.classes.some(row=>row.id===classId))fail('Choose an existing class group.');state.draft=state.draft.filter(row=>(row.classId||'default')!==classId).concat(sampleSchedule().map(row=>({...row,classId,id:classId+':'+row.id})));audit('Sample timetable loaded into draft');store.save();return reply({ok:true});}
        if(path==='/api/publish'&&req.method==='POST'){state.published=validateClassSchedule(state.draft,state.classes,validateSchedule);state.publishedClasses=structuredClone(state.classes);state.revision++;state.publishedAt=new Date().toISOString();audit('Timetable published');store.save();return reply({ok:true});}
        if(path==='/api/settings'&&req.method==='PUT'){const settings=validateSettings(body);if(!state.publishedClasses.some(row=>row.id===settings.classId))fail('Publish this class group before selecting it for the monitor.');images.check(settings);await desktop?.apply(settings);state.settings=settings;audit('Display settings updated');store.save();return reply({ok:true});}
        if(path==='/api/backup'&&req.method==='GET')return reply({format:'school-display-1',settings:state.settings,draft:state.draft,published:state.published,classes:state.classes,publishedClasses:state.publishedClasses,images:images.export(state.settings)});
        if(path==='/api/restore'&&req.method==='POST'){throttle('sensitive');if(!verify(body.password,user))fail('Administrator password is incorrect.',403);const b=body.backup;if(b?.format!=='school-display-1')fail('Choose a School Display backup.');const classes=validateClasses(b.classes||defaultClasses()),publishedClasses=validateClasses(b.publishedClasses||b.classes||defaultClasses()),draft=validateClassSchedule(b.draft,classes,validateSchedule),published=validateClassSchedule(b.published,publishedClasses,validateSchedule),settings=validateSettings(b.settings);if(publishedClasses.some(row=>!classes.some(group=>group.id===row.id)))fail('Published class groups must also exist in the draft.');if(!publishedClasses.some(row=>row.id===settings.classId))fail('The selected class group is missing from this backup.');const saveImages=images.prepareRestore(b.images,settings);await desktop?.apply(settings);saveImages();Object.assign(state,{draft,published,classes,publishedClasses,settings,revision:state.revision+1,publishedAt:new Date().toISOString()});audit('Backup restored');store.save();return reply({ok:true});}
        if(path==='/api/account'&&req.method==='PUT'){throttle('sensitive');if(!verify(body.currentPassword,user))fail('Current password is incorrect.',403);const updated=credentials(body);if(users.some(u=>u!==user&&u.email===updated.email))fail('This email already has an account.',409);Object.assign(user,updated);for(const [key,value] of sessions)if(value.userId===user.id)sessions.delete(key);audit('Administrator account updated');store.save();return reply({ok:true});}
        if(path==='/api/rotate-display'&&req.method==='POST'){throttle('sensitive');if(!verify(body.password,user))fail('Administrator password is incorrect.',403);state.displayToken=randomBytes(32).toString('hex');audit('Display access renewed');store.save();await desktop?.reload(state.displayToken);return reply({ok:true});}
        if(path==='/api/exit'&&req.method==='POST'){throttle('sensitive');if(!verify(body.password,user))fail('Administrator password is incorrect.',403);if(!desktop)fail('The desktop app is not running.',409);audit('Desktop exit authorized');store.save();reply({ok:true});setTimeout(()=>desktop.exit(),250);return;}
        fail('Not found.',404);
      }
      const files={'/':'web/index.html','/control':'web/index.html','/display':'web/display.html','/app.js':'web/app.js','/display.js':'web/display.js','/i18n.js':'web/i18n.js','/styles.css':'web/styles.css','/display.css':'web/display.css','/schedule.mjs':'shared/schedule.mjs','/icon.svg':'assets/icon.svg','/images/student-break.png':'assets/student-break.png','/images/student-return.png':'assets/student-return.png'};
      if(req.method!=='GET'||!files[path])fail('Not found.',404);
      const data=await readFile(join(root,files[path]));res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'})[extname(files[path])]);res.end(data);
    }catch(error){reply({error:error.status?error.message:error.message?.includes('overlap')||error.message?.includes('time')||error.message?.includes('teacher')||error.message?.includes('timetable')||error.message?.includes('class')?error.message:'Could not complete the request.'},error.status||400);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
  return {server,origin,store,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}};
}
