// Records real motion clips of School Display and Faslii for the presentation video.
// Usage: node output/video/capture.mjs   (writes clips/<name>/NNNN.jpg + clips.json; prints layout problems)
import {randomBytes} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startServer} from '../../server/server.mjs';
import {browserQa} from '../../tests/browser-helper.mjs';
import {schoolClock} from '../../shared/schedule.mjs';

const here=dirname(fileURLToPath(import.meta.url)),out=join(here,'clips');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
const directory=mkdtempSync(join(tmpdir(),'school-video-'));
const app=await startServer({directory:join(directory,'data'),port:0,updateEnv:{},pushSender:null});
const password=randomBytes(24).toString('hex');let cookie='';const problems=[],clips=[];
async function api(path,body,{method='POST'}={}){
 const r=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:app.origin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+': '+JSON.stringify(data));
 cookie=r.headers.get('set-cookie')?.split(';')[0]||cookie;return data;
}
const hm=s=>{s=Math.max(0,Math.min(86340,s));return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s%3600/60)).padStart(2,'0');};
const clock=schoolClock(new Date(),'Asia/Qatar'),base=Math.floor(clock.seconds/60)*60-5400-240;
const wait=ms=>new Promise(r=>setTimeout(r,ms));let pointer=null,clipStart=0;
let browser;
try{
 // ---------- A realistic school ----------
 await api('setup',{name:'Fatima Al-Kuwari',email:'principal@school.test',password});await api('login',{email:'principal@school.test',password});
 const g6=(await api('classes',{nameEn:'Grade 6A',nameAr:'السادس أ'})).group,g7=(await api('classes',{nameEn:'Grade 7B',nameAr:'السابع ب'})).group;
 const subjects=[['Mathematics','الرياضيات','Sara Ali','سارة علي','Room 12'],['Science','العلوم','Omar Hassan','عمر حسن','Lab 2'],['Arabic','اللغة العربية','Noor Salem','نور سالم','Room 12'],['English','اللغة الإنجليزية','Huda Omar','هدى عمر','Room 14'],['Islamic Studies','التربية الإسلامية','Ahmed Yousef','أحمد يوسف','Room 12'],['Art','الفنون','Mariam Khalid','مريم خالد','Art studio']];
 const week=[];
 for(let day=0;day<7;day++)for(const [k,group] of [[0,g6],[1,g7]]){
  let t=day===clock.day?base:8*3600;
  for(let p=0;p<6;p++){
   if(p===2){week.push({id:`${group.id}-${day}-br`,classId:group.id,day,type:'break',start:hm(t),end:hm(t+1200),subjectEn:'Break',subjectAr:'استراحة',teacherEn:'',teacherAr:'',room:''});t+=1200;}
   const s=subjects[(p+day+k*3)%subjects.length];
   week.push({id:`${group.id}-${day}-${p}`,classId:group.id,day,type:'lesson',start:hm(t),end:hm(t+2700),subjectEn:s[0],subjectAr:s[1],teacherEn:s[2],teacherAr:s[3],room:k?s[4].replace('12','21'):s[4]});t+=2700;
  }
 }
 await api('draft',{schedule:week},{method:'PUT'});await api('publish',{});
 await api('settings',{...(await api('state')).settings,schoolEn:'Al Noor Primary School',schoolAr:'مدرسة النور الابتدائية',classId:g6.id},{method:'PUT'});
 await api('users',{name:'Sara Ali',email:'sara@school.test',password,role:'teacher',classIds:[g6.id,g7.id],teacherName:'Sara Ali'});
 await api('announcements',{classIds:[g6.id,g7.id],textEn:'Science fair entries are due on Thursday.',textAr:'آخر موعد لمشاركات معرض العلوم يوم الخميس.',expiresAt:new Date(Date.now()+86400000).toISOString()});
 await api('community/settings',{teacher:true,parent:true,posts:true,classwork:true,showParentComments:false});
 await api('community/notice',{audience:'both',title:'Parent meeting on Wednesday',text:'Parents of Grade 6 are invited to meet the teachers at 4:00 pm in the main hall.'});
 const sara=app.store.get().users.find(u=>u.email==='sara@school.test');
 await api('teacher-messages',{userId:sara.id,text:'Please cover Grade 7B Science in Lab 2 tomorrow at 9:00.',priority:'important'});
 const ali=(await api('students',{nameEn:'Ali Hassan',nameAr:'علي حسن',classId:g6.id})).student;
 await api('students/import',{rows:[{nameEn:'Noor Salem',nameAr:'نور سالم',className:'Grade 6A'},{nameEn:'Yousef Khalid',nameAr:'يوسف خالد',className:'Grade 6A'},{nameEn:'Huda Omar',nameAr:'هدى عمر',className:'Grade 7B'}]});
 const inviteCode=(await api('parent-invites',{studentId:ali.id})).code;
 const teacherToken=(await api('mobile/login',{email:'sara@school.test',password,audience:'teacher'})).token;
 const asTeacher=async(path,body)=>{const r=await fetch(app.origin+'/api/mobile/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+teacherToken},body:JSON.stringify(body)});if(!r.ok)problems.push(path+': '+await r.text());};
 const inDays=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
 await asTeacher('work',{classId:g6.id,type:'homework',dueDate:inDays(2),title:'Fractions practice',details:'Workbook page 42, questions 1 to 8.'});
 await asTeacher('work',{classId:g6.id,type:'exam',dueDate:inDays(5),title:'Science unit test',details:'Chapter 3: plants and energy.'});
 const g6students=app.store.get().students.filter(row=>row.classId===g6.id);
 await asTeacher('attendance',{classId:g6.id,date:clock.date,entries:g6students.map(row=>({studentId:row.id,status:'present'}))});
 const displayUrl=(await api('state')).displayUrl;

 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');await send('Network.enable');
 // A soft pointer that glides to each target, so viewers can follow the action.
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.confirm=()=>true;addEventListener('DOMContentLoaded',()=>{if(window!==top)return;const s=document.createElement('style');s.textContent='*{caret-color:transparent!important}';document.head.append(s);});`});
 const viewport=async(width,height,scale,mobile)=>{await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile});};
 const desk=()=>viewport(1600,900,1,false),phone=()=>viewport(390,844,2,true);
 const doc=frame=>frame?'document.querySelector("#community-frame").contentDocument':'document';
 const rectOf=(sel,frame)=>evaluate(`(()=>{const n=${doc(frame)}.querySelector(${JSON.stringify(sel)});if(!n)return null;let r=n.getBoundingClientRect();let fixed=false;for(let a=n;a&&a!==document.body;a=a.parentElement)if(['fixed','sticky'].includes(getComputedStyle(a).position))fixed=true;if(!fixed&&(r.top<70||r.bottom>innerHeight-90)){scrollBy(0,r.top-innerHeight/2);r=n.getBoundingClientRect();}r=n.getBoundingClientRect(),f=${frame?'document.querySelector("#community-frame").getBoundingClientRect()':'{left:0,top:0}'};return {x:f.left+r.left+Math.min(r.width/2,60),y:f.top+r.top+r.height/2}})()`);
 async function point(sel,frame){const r=await rectOf(sel,frame);if(!r)throw new Error('Missing '+sel);pointer?.push({t:Date.now()-clipStart,x:r.x,y:r.y,kind:'move'});await wait(800);}
 async function tap(sel,frame){await point(sel,frame);pointer?.push({t:Date.now()-clipStart,kind:'tap'});await wait(180);await evaluate(`${doc(frame)}.querySelector(${JSON.stringify(sel)}).click()`);await wait(500);}
 async function type(sel,text,frame){await point(sel,frame);const n=`${doc(frame)}.querySelector(${JSON.stringify(sel)})`;await evaluate(`${n}.focus()`);
  for(let i=1;i<=text.length;i+=2){await evaluate(`(()=>{const n=${n};n.value=${JSON.stringify(text)}.slice(0,${i});n.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(45);}
  await evaluate(`(()=>{const n=${n};n.value=${JSON.stringify(text)};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(250);}
 async function choose(sel,value,frame){await point(sel,frame);await evaluate(`(()=>{const n=${doc(frame)}.querySelector(${JSON.stringify(sel)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(600);}
 const smoothTo=async(expr,ms=1400)=>{await evaluate(`(async()=>{const y0=scrollY,y1=Math.max(0,${expr});const t0=performance.now();await new Promise(done=>{const step=now=>{const k=Math.min(1,(now-t0)/${ms});const e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;scrollTo(0,y0+(y1-y0)*e);k<1?requestAnimationFrame(step):done()};requestAnimationFrame(step)})})()`);};
 const layoutCheck=async name=>{const r=await evaluate(`(()=>{const w=innerWidth,bad=[];if(document.documentElement.scrollWidth>w+1)bad.push('page scrolls sideways ('+document.documentElement.scrollWidth+'px > '+w+'px)');for(const n of document.querySelectorAll('button,a,h1,h2,h3,label,strong')){const r=n.getBoundingClientRect();if(r.width&&r.right>w+2&&getComputedStyle(n).position!=='fixed'&&!n.closest('[style*=overflow],.chips,.tabs,nav,table,.table-wrap,.week-grid,.board'))bad.push('cut off: '+(n.textContent||'').trim().slice(0,40));}return bad.slice(0,5)})()`);for(const b of r)problems.push(name+': '+b);};
 // Records screenshots continuously while the actions run.
 async function clip(name,kind,meta,actions){
  const dir=join(out,name);mkdirSync(dir,{recursive:true});const frames=[];let running=true;const t0=Date.now();clipStart=t0;pointer=[];
  const loop=(async()=>{while(running){const t=Date.now()-t0;try{const {data}=await send('Page.captureScreenshot',{format:'jpeg',quality:82,optimizeForSpeed:true});const file=String(frames.length).padStart(4,'0')+'.jpg';writeFileSync(join(dir,file),Buffer.from(data,'base64'));frames.push({t,file});}catch{await wait(50);}}})();
  try{await actions();}catch(error){problems.push(name+': '+error.message);console.log('PROBLEM',name,error.message);}
  running=false;await loop;clips.push({name,kind,...meta,duration:Date.now()-t0,frames,pointer});pointer=null;console.log('clip',name,frames.length,'frames',((Date.now()-t0)/1000).toFixed(1)+'s');
 }

 // ---------- Control room ----------
 await desk();await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});
 await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("#live-board .live-card"))');await wait(800);await layoutCheck('overview');
 await clip('overview','desk',{},async()=>{await wait(1500);await smoothTo('document.querySelector("#live-board").getBoundingClientRect().top+scrollY-140',1800);await wait(2200);await smoothTo('0',1200);await wait(600);});
 await clip('timetable','desk',{},async()=>{await tap('[data-tab=timetable]');await until('Boolean(document.querySelector("#board-view"))');await wait(400);await choose('[name=timetable-class]',g6.id);await wait(700);await layoutCheck('timetable');
  await smoothTo('[...document.querySelectorAll("h2")].find(n=>n.textContent==="Week board").getBoundingClientRect().top+scrollY-130',1800);await wait(1200);
  await choose('#board-view',await evaluate('[...document.querySelector("#board-view").options].find(o=>o.textContent==="Sara Ali").value'));await wait(1800);});
 await clip('cover','desk',{},async()=>{await smoothTo('0',600);await tap('[data-tab=calendar]');await until('Boolean(document.querySelector("#cover-find"))');await wait(500);
  await smoothTo('document.querySelector("#cover-find").getBoundingClientRect().top+scrollY-200',1200);
  const omar=await evaluate('[...document.querySelector("#cover-find [name=teacher]").options].find(o=>o.textContent==="Omar Hassan")?.value');
  const d=new Date(Date.now()+86400000).toISOString().slice(0,10);await choose('#cover-find [name=date]',d);await choose('#cover-find [name=teacher]',omar);
  await tap('#cover-find button');await until('Boolean(document.querySelector("#cover-form"))');await wait(500);await layoutCheck('cover');
  await smoothTo('document.querySelector("#cover-find").getBoundingClientRect().top+scrollY-200',500);
  const select='#cover-form select';await point(select);await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(select)});n.selectedIndex=1;n.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(2000);});
 await clip('notify','desk',{},async()=>{await smoothTo('0',500);await tap('[data-tab=community]');await until('document.querySelector("#community-frame")?.contentDocument?.querySelector("#workspace")?.hidden===false');await wait(800);
  await smoothTo('document.querySelector("#community-frame").getBoundingClientRect().top+scrollY+document.querySelector("#community-frame").contentDocument.querySelector("#notice").getBoundingClientRect().top-150',1200);
  await choose('[name=audience]','both',true);await type('#notice [name=title]','Early dismissal on Thursday',true);await type('#notice [name=text]','School ends at 12:30 pm on Thursday for the national day celebration.',true);await wait(700);
  await tap('#send-notice',true);await until(doc(true)+'.body.textContent.includes("Early dismissal on Thursday")&&!'+doc(true)+'.querySelector("#notice [name=title]").value');await wait(1800);await layoutCheck('notifications');});
 // ---------- Classroom display ----------
 await send('Network.deleteCookies',{name:'school_session',url:app.origin});
 await viewport(1920,1080,1,false);await send('Page.navigate',{url:displayUrl.startsWith('http')?displayUrl:app.origin+displayUrl});await wait(3000);await layoutCheck('display');
 await clip('display','full',{},async()=>{await wait(7000);});
 // ---------- Faslii teacher ----------
 await phone();await send('Page.navigate',{url:app.origin+'/teacher'});await until('Boolean(document.querySelector("#login-form"))');await layoutCheck('teacher sign-in');
 await clip('teacher','phone',{},async()=>{await wait(500);await type('#login-form [name=email]','sara@school.test');await type('#login-form [name=password]',password.slice(0,14));
  await evaluate(`(()=>{const n=document.querySelector('#login-form [name=password]');n.value=${JSON.stringify(password)}})()`);await tap('#login-form button.primary');await until('Boolean(document.querySelector(".hero"))');await wait(2200);await layoutCheck('teacher today');
  await tap('[data-tab=alerts]');await wait(2600);await layoutCheck('teacher notifications');
  await tap('[data-tab=messages]');await wait(1200);const thread=await evaluate('!!document.querySelector("[data-thread]")');if(thread){await tap('[data-thread]');await wait(2200);}await layoutCheck('teacher messages');
  await tap('[data-tab=today]');await wait(1000);});
 await evaluate('localStorage.clear()');
 // ---------- Faslii parent ----------
 await send('Page.navigate',{url:app.origin+'/teacher'});await until('Boolean(document.querySelector("#login-form"))');
 await clip('parent','phone',{},async()=>{await wait(400);await tap('[data-action=join]');await until('Boolean(document.querySelector("#join-form"))');await wait(400);
  await type('#join-form [name=code]',inviteCode);await type('#join-form [name=name]','Mariam Hassan');await type('#join-form [name=email]','mariam@home.test');
  await evaluate(`(()=>{for(const k of ['password','confirm']){const n=document.querySelector('#join-form [name='+k+']');n.value=${JSON.stringify(password)};n.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
  await tap('#join-form button.primary');await until('Boolean(document.querySelector(".hero"))');await wait(2400);await layoutCheck('parent today');
  await tap('[data-tab=homework]');await wait(1800);await layoutCheck('parent homework');await tap('[data-tab=attendance]');await wait(1500);await layoutCheck('parent attendance');
  if(await evaluate('!!document.querySelector("#absence-form [name=reason]")'))await type('#absence-form [name=reason]','Doctor appointment in the morning');await wait(1500);});
 // ---------- Arabic ----------
 await desk();await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});
 await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("#live-board .live-card"))');await wait(600);
 await clip('arabic','desk',{},async()=>{await wait(900);const lang=await evaluate('[...document.querySelectorAll("button")].findIndex(b=>b.textContent.trim()==="العربية")');if(lang<0)throw new Error('Arabic button not found');
  await evaluate(`[...document.querySelectorAll("button")][${lang}].id='lang-switch'`);await tap('#lang-switch');await wait(2600);await layoutCheck('arabic overview');});
 console.log('PROBLEMS',JSON.stringify(problems,null,1));
}catch(error){console.log('FATAL',error.stack);problems.push('fatal: '+error.message);}finally{writeFileSync(join(here,'clips.json'),JSON.stringify({clips,problems},null,1));await browser?.close();await app.close?.();process.exit(0);}
