// Captures real screens of School Display and Faslii for the presentation video.
// Usage: node output/video/capture.mjs   (writes frames + shots.json next to this file)
import {randomBytes} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startServer} from '../../server/server.mjs';
import {browserQa} from '../../tests/browser-helper.mjs';
import {schoolClock} from '../../shared/schedule.mjs';

const here=dirname(fileURLToPath(import.meta.url)),out=join(here,'frames');
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
const directory=mkdtempSync(join(tmpdir(),'school-video-'));
const app=await startServer({directory:join(directory,'data'),port:0,updateEnv:{},pushSender:null});
const password=randomBytes(24).toString('hex');let cookie='';const problems=[],shots=[];
async function api(path,body,{method='POST',token}={}){
 const r=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:app.origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{Cookie:cookie})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+': '+JSON.stringify(data));
 cookie=r.headers.get('set-cookie')?.split(';')[0]||cookie;return data;
}
const hm=s=>{s=Math.max(0,Math.min(86340,s));return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s%3600/60)).padStart(2,'0');};
const clock=schoolClock(new Date(),'Asia/Qatar'),base=Math.floor(clock.seconds/60)*60-5400-300;
let browser;
try{
 await api('setup',{name:'Fatima Al-Kuwari',email:'principal@school.test',password});await api('login',{email:'principal@school.test',password});
 await api('settings',{...(await api('state')).settings,schoolEn:'Al Noor Primary School',schoolAr:'مدرسة النور الابتدائية'},{method:'PUT'}).catch(error=>problems.push('settings: '+error.message));
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
 await api('settings',{...(await api('state')).settings,schoolEn:'Al Noor Primary School',schoolAr:'مدرسة النور الابتدائية',classId:g6.id},{method:'PUT'}).catch(error=>problems.push('class: '+error.message));
 await api('users',{name:'Sara Ali',email:'sara@school.test',password,role:'teacher',classIds:[g6.id,g7.id],teacherName:'Sara Ali'});
 await api('announcements',{classIds:[g6.id,g7.id],textEn:'Science fair entries are due on Thursday.',textAr:'آخر موعد لمشاركات معرض العلوم يوم الخميس.',expiresAt:new Date(Date.now()+86400000).toISOString()});
 await api('community/settings',{teacher:true,parent:true,posts:true,classwork:true,showParentComments:true}).catch(error=>problems.push('community settings: '+error.message));
 await api('community/notice',{audience:'both',title:'Parent meeting on Wednesday',text:'Parents of Grade 6 are invited to meet the teachers at 4:00 pm in the main hall.'}).catch(error=>problems.push('notice: '+error.message));
 const sara=app.store.get().users.find(u=>u.email==='sara@school.test');
 await api('teacher-messages',{userId:sara.id,text:'Please cover Grade 7B Science in Lab 2 tomorrow at 9:00.',priority:'important'}).catch(error=>problems.push('message: '+error.message));
 const display=(await api('state')).displayUrl||null;

 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');await send('Network.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.confirm=()=>true;document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='*,*::before,*::after{caret-color:transparent!important;scroll-behavior:auto!important}';document.head.append(s)});"});
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const desk=()=>send('Emulation.setDeviceMetricsOverride',{width:1600,height:900,deviceScaleFactor:1.2,mobile:false});
 const phone=()=>send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 const click=sel=>evaluate(`document.querySelector(${JSON.stringify(sel)})?.click()`);
 const fill=(sel,v,doc='document')=>evaluate(`(()=>{const n=${doc}.querySelector(${JSON.stringify(sel)});if(!n)return false;n.value=${JSON.stringify(v)};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
 const shot=async(name,kind,opts={})=>{await wait(700);const {data}=await send('Page.captureScreenshot',{format:'jpeg',quality:92});writeFileSync(join(out,name+'.jpg'),Buffer.from(data,'base64'));shots.push({name,kind,...opts});console.log('shot',name);};
 const step=async(label,fn)=>{try{await fn();}catch(error){problems.push(label+': '+error.message);console.log('PROBLEM',label,error.message);}};

 await desk();await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});
 await step('overview',async()=>{await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("#live-board .live-card"))');await shot('overview','desk');});
 const tabs=await evaluate('[...document.querySelectorAll("[data-tab]")].map(n=>n.dataset.tab)');console.log('tabs',tabs.join(','));
 await step('timetable',async()=>{await click('[data-tab=timetable]');await until('Boolean(document.querySelector("#board-view"))');await fill('[name=timetable-class]',g6.id);await wait(900);await evaluate('[...document.querySelectorAll("h2")].find(n=>n.textContent==="Week board").scrollIntoView({block:"start"});scrollBy(0,-130)');await shot('timetable','desk');});
 await step('cover',async()=>{await click('[data-tab=calendar]');await until('Boolean(document.querySelector("#cover-find"))');
  const id=await evaluate('[...document.querySelector("#cover-find [name=teacher]").options].find(o=>o.textContent.includes("Omar"))?.value');
  const d=new Date(Date.now()+86400000*((clock.day+1)%7===5?3:1)).toISOString().slice(0,10);
  await fill('#cover-find [name=date]',d);await fill('#cover-find [name=teacher]',id);await evaluate('document.querySelector("#cover-find").requestSubmit()');await until('Boolean(document.querySelector("#cover-form"))');
  await evaluate('document.querySelector("#cover-find").scrollIntoView({block:"start"});scrollBy(0,-140)');const toCover='scrollTo(0,scrollY+document.querySelector("#cover-find").getBoundingClientRect().top-200)';await evaluate('(()=>{const n=document.querySelector("#cover-form select");if(n&&n.options.length>1){n.selectedIndex=1;n.dispatchEvent(new Event("change",{bubbles:true}))}})()');await wait(1200);await evaluate(toCover);await wait(300);await evaluate(toCover);console.log('COVER',await evaluate('document.querySelector("#cover-find").getBoundingClientRect().top'));await shot('cover','desk');});
 await step('community',async()=>{await click('[data-tab=community]');await until('document.querySelector("#community-frame")?.contentDocument?.querySelector("#workspace")?.hidden===false');
  const doc='document.querySelector("#community-frame").contentDocument';
  await fill('[name=audience]','both',doc);await fill('#notice [name=title]','Early dismissal on Thursday',doc);await fill('#notice [name=text]','School ends at 12:30 pm on Thursday for the national day celebration.',doc);
  await shot('community-compose','desk');
  await evaluate(doc+`.querySelector("#send-notice").click()`);await until(doc+'.body.textContent.includes("Early dismissal on Thursday")&&!'+doc+'.querySelector("#notice [name=title]").value');
  await evaluate('document.querySelector("#community-frame").scrollIntoView()');await shot('community-sent','desk');});
 await step('display',async()=>{const url=display||await evaluate('document.querySelector("a[href*=\'/display?token\']")?.href');if(!url)throw new Error('No display link found on the dashboard.');
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:url.startsWith('http')?url:app.origin+url});await wait(2500);await shot('display','full');});
 await send('Network.deleteCookies',{name:'school_session',url:app.origin});
 await step('teacher',async()=>{await phone();await send('Page.navigate',{url:app.origin+'/teacher'});await until('Boolean(document.querySelector("#login-form"))');
  await fill('#login-form [name=email]','sara@school.test');await fill('#login-form [name=password]',password);await evaluate('document.querySelector("#login-form").requestSubmit()');await until('Boolean(document.querySelector(".hero"))');await shot('teacher-today','phone');
  await click('[data-tab=alerts]');await wait(400);await shot('teacher-alerts','phone');
  await click('[data-tab=messages]');await wait(400);await shot('teacher-messages','phone');});
 console.log('PROBLEMS',JSON.stringify(problems));
}finally{writeFileSync(join(here,'shots.json'),JSON.stringify({shots,problems},null,1));await browser?.close();await app.close?.();process.exit(0);}
