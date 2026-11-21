// Signs in to the Flutter teacher and parent apps against a demo school and saves screenshots.
// Usage: node output/video/flutter-check.mjs
import {randomBytes} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startServer} from '../../server/server.mjs';
import {browserQa} from '../../tests/browser-helper.mjs';
import {schoolClock} from '../../shared/schedule.mjs';

const here=dirname(fileURLToPath(import.meta.url)),out=join(here,'flutter-shots');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
const directory=mkdtempSync(join(tmpdir(),'faslii-check-'));
const app=await startServer({directory:join(directory,'data'),port:0,updateEnv:{},pushSender:null});
const password=randomBytes(16).toString('hex');let cookie='';const problems=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,body,{method='POST',token}={}){
 const r=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:app.origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{Cookie:cookie})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+': '+JSON.stringify(data));
 cookie=r.headers.get('set-cookie')?.split(';')[0]||cookie;return data;
}
let browser;
try{
 await api('setup',{name:'Fatima Al-Kuwari',email:'principal@school.test',password});await api('login',{email:'principal@school.test',password});
 const g6=(await api('classes',{nameEn:'Grade 6A',nameAr:'السادس أ'})).group;
 const clock=schoolClock(new Date(),'Asia/Qatar');const hm=s=>String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s%3600/60)).padStart(2,'0');
 const base=Math.max(0,Math.min(20*3600,Math.floor(clock.seconds/3600)*3600-3600));
 const subjects=[['Mathematics','الرياضيات'],['Science','العلوم'],['Arabic','اللغة العربية'],['English','اللغة الإنجليزية']];
 await api('draft',{schedule:[0,1,2,3,4,5,6].flatMap(day=>subjects.map(([en,ar],i)=>({id:`${day}-${i}`,classId:g6.id,day,type:'lesson',start:hm(base+i*2700),end:hm(base+i*2700+2700),subjectEn:en,subjectAr:ar,teacherEn:'Sara Ali',teacherAr:'سارة علي',room:'Room 12'})))},{method:'PUT'});
 await api('publish',{});
 await api('settings',{...(await api('state')).settings,schoolEn:'Al Noor Primary School',schoolAr:'مدرسة النور الابتدائية',classId:g6.id},{method:'PUT'});
 await api('users',{name:'Sara Ali',email:'sara@school.test',password,role:'teacher',classIds:[g6.id],teacherName:'Sara Ali'});
 const ali=(await api('students',{nameEn:'Ali Hassan',nameAr:'علي حسن',classId:g6.id})).student;
 const teacher=(await api('mobile/login',{email:'sara@school.test',password,audience:'teacher'})).token;
 const photo=f=>'data:image/png;base64,'+readFileSync(new URL('../../assets/'+f,import.meta.url)).toString('base64');
 await api('mobile/community/post',{title:'Science fair',text:'Our Grade 6 science fair projects are ready. Thank you, families!',photos:[photo('student-break.png'),photo('student-return.png'),photo('icon.png')]},{token:teacher});
 const work=(await api('mobile/work',{classId:g6.id,type:'homework',title:'Fractions practice',details:'Workbook page 42, questions 1 to 8.',dueDate:clock.date,community:true,photos:[]},{token:teacher})).item;
 await api('community/notice',{audience:'both',title:'Early dismissal on Thursday',text:'School ends at 12:30 pm on Thursday.'});
 const code=(await api('parent-invites',{studentId:ali.id})).code;
 const parent=(await api('mobile/parent/register',{code,name:'Mariam Hassan',email:'mariam@home.test',password,confirm:password})).token;
 await api('mobile/work/submit',{workId:work.id,studentId:ali.id,file:{name:'answers.pdf',data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4 demo').toString('base64')}},{token:parent});

 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 const shot=async name=>{await wait(900);writeFileSync(join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));console.log('shot',name);};
 // Flutter draws on a canvas; its accessibility tree gives us real buttons and fields to use.
 const semantics=async()=>{await evaluate('document.querySelector("flt-semantics-placeholder")?.click()');await wait(600);};
 const rect=async label=>evaluate(`(()=>{const want=${JSON.stringify(label)};const own=e=>(e.getAttribute('aria-label')||[...e.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join('')||'').trim();
  const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0};
  const n=[...document.querySelectorAll('input,textarea')].find(e=>visible(e)&&(own(e)===want||e.closest('flt-semantics')?.getAttribute('aria-label')===want))
   ||[...document.querySelectorAll('[role=button],[role=tab],[role=link],[role=img],flt-semantics')].filter(visible).find(e=>own(e)===want)
   ||[...document.querySelectorAll('flt-semantics,[role]')].filter(visible).find(e=>own(e).startsWith(want));
  if(!n)return null;window.__found=n;const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 const tap=async label=>{let r;for(let i=0;i<30&&!(r=await rect(label));i++)await wait(300);if(!r)throw new Error('Not found: '+label);
  // Flutter's accessibility layer turns a DOM click on the element into a real tap.
  await evaluate('window.__found.click()');await wait(1100);};
 const type=async(label,text)=>{await tap(label);
  await evaluate(`[...document.querySelectorAll('input,textarea')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)})?.focus()`);await wait(400);
  await send('Input.insertText',{text});await wait(300);
  console.log('VALUE',label,await evaluate('(document.activeElement.value||"").length'));};
 const open=async edition=>{await send('Page.navigate',{url:app.origin+'/faslii-'+edition+'/'});await wait(6000);await semantics();};
 const english=async()=>{try{await tap('English');}catch{}};

 for(const [edition,email] of [['teacher','sara@school.test'],['parent','mariam@home.test']]){
  await open(edition);
  const labels=await evaluate('[...document.querySelectorAll("flt-semantics")].map(e=>(e.getAttribute("aria-label")||e.textContent||"").trim()).filter(Boolean).slice(0,30)');
  console.log(edition,"inputs:",await evaluate("JSON.stringify([...document.querySelectorAll(\"input,textarea\")].map(e=>[e.getAttribute(\"aria-label\"),e.closest(\"flt-semantics\")?.getAttribute(\"aria-label\")]))"));
  await shot(edition+'-0-signin');
  try{
   await type('البريد الإلكتروني',email).catch(()=>type('Email',email));
   await type('كلمة المرور',password).catch(()=>type('Password',password));
   for(const type of ['rawKeyDown','char','keyUp'])await send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:type==='char'?'\r':undefined});
   await wait(3500);await semantics();
   await shot(edition+'-1-home');
   console.log('BOTTOM',await evaluate(`JSON.stringify([...document.querySelectorAll('flt-semantics,[role]')].map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.y),e.getAttribute('role'),(e.getAttribute('aria-label')||'').slice(0,30),(e.getAttribute('aria-selected')||'')]}).filter(x=>x[0]>740))`));
   await tap('الحصص').catch(()=>tap('Lessons'));await shot(edition+'-2-lessons');
   await tap('أعمال الصف').catch(()=>tap('Classwork'));await shot(edition+'-3-classwork');
   await tap('الرئيسية').catch(()=>tap('Home'));await wait(800);
   // The full-screen viewer, swiping and zoom are covered by the Flutter widget tests.
   if(!await evaluate(`Boolean(document.querySelector('[aria-label^="صور المنشور"]'))`))problems.push(edition+': photo gallery missing on Home');
   await tap('الإشعارات').catch(()=>tap('Notifications'));await shot(edition+'-5-notifications');
  }catch(error){problems.push(edition+': '+error.message);console.log('PROBLEM',edition,error.message);await shot(edition+'-error');}
 }
 // The dashboard's notifications and posts section, inside the control room.
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});
 await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("[data-tab=community]"))');
 await evaluate('document.querySelector("[data-tab=community]").click()');
 await until('document.querySelector("#community-frame")?.contentDocument?.querySelector("#workspace")?.hidden===false');await wait(1500);
 await shot('dashboard-1-notifications');
 await evaluate('(()=>{const f=document.querySelector("#community-frame");const p=f.contentDocument.querySelector("#posts");scrollTo(0,f.getBoundingClientRect().top+scrollY+p.getBoundingClientRect().top-160)})()');await wait(1200);
 await shot('dashboard-2-posts');
 console.log('PROBLEMS',JSON.stringify(problems));
}catch(error){console.log('FATAL',error.stack);}finally{await browser?.close();await app.close?.();process.exit(0);}
