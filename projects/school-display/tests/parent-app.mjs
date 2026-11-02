import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {browserQa} from './browser-helper.mjs';
const directory=mkdtempSync(join(tmpdir(),'school-parent-app-')),app=await startServer({directory,port:0,updateEnv:{}}),shots=resolve('.qa/parent-app');mkdirSync(shots,{recursive:true});let browser,cookie='';const password=randomBytes(24).toString('hex');
async function request(path,body,method='POST'){const r=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:app.origin,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(r.ok,await r.clone().text());return {data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const lesson=(id,classId,day,start,end,teacherEn,subjectEn)=>({id,classId,day,type:'lesson',start,end,subjectEn,subjectAr:'',teacherEn,teacherAr:'',room:'Room 1'});
try{
 await request('setup',{name:'Owner',email:'owner@school.test',password});cookie=(await request('login',{email:'owner@school.test',password})).cookie;
 const a=(await request('classes',{nameEn:'Grade 6A',nameAr:'السادس أ'})).data.group,b=(await request('classes',{nameEn:'Grade 7B',nameAr:'السابع ب'})).data.group;
 await request('draft',{schedule:[0,1,2,3,4,5,6].flatMap(day=>[lesson('a'+day,a.id,day,'00:00','23:30','Sara Ali','Science'),lesson('b'+day,b.id,day,'00:00','23:30','Omar','Art')])},'PUT');await request('publish',{});
 await request('users',{name:'Sara',email:'sara@school.test',password,role:'teacher',classIds:[a.id],teacherName:'Sara Ali'});
 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');await send('Network.enable');
 const shot=async name=>writeFileSync(join(shots,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const fill=(selector,value)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const submit=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);
 const noOverflow=()=>evaluate('document.documentElement.scrollWidth<=innerWidth+1');const refresh=()=>evaluate('document.dispatchEvent(new Event("visibilitychange"))');
 const phone=()=>send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 // Staff add students in the control panel and create an invitation.
 await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.confirm=()=>true;window.__cspErrors=[];document.addEventListener('securitypolicyviolation',event=>window.__cspErrors.push(event.violatedDirective+' '+event.blockedURI));"});
 await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("[data-tab=students]"))');await click('[data-tab=students]');await until('Boolean(document.querySelector("#student-form"))');
 await fill('#student-form [name=nameEn]','Ali Hassan');await fill('#student-form [name=nameAr]','علي حسن');await fill('#student-form [name=classId]',a.id);await submit('#student-form');await until('document.body.textContent.includes("Ali Hassan")');
 await fill('#student-import [name=rows]','Noor Salem, نور سالم, Grade 6A\nHuda Omar, هدى عمر, Grade 7B');await submit('#student-import');await until('document.body.textContent.includes("Huda Omar")');assert.equal(app.store.get().students.length,3);
 const ali=app.store.get().students[0],huda=app.store.get().students[2];
 await click(`[data-work=invite-parent][data-id="${ali.id}"]`);await until('Boolean(document.querySelector("#invite-code"))');const code=await evaluate('document.querySelector("#invite-code").textContent');assert.match(code,/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);await shot('control-students');
 const hudaCode=(await request('parent-invites',{studentId:huda.id})).data.code;
 await send('Network.deleteCookies',{name:'school_session',url:app.origin});await phone();
 // Teacher marks attendance and posts an exam on a phone-sized screen.
 await send('Page.navigate',{url:app.origin+'/teacher'});await until('Boolean(document.querySelector("#login-form"))');assert.equal(await evaluate('document.body.textContent.includes("https://")||Boolean(document.querySelector("[type=url]"))'),false,'No server address appears on the sign-in screen.');await shot('signin');
 await fill('#login-form [name=email]','sara@school.test');await fill('#login-form [name=password]',password);await submit('#login-form');await until('Boolean(document.querySelector("[data-tab=class]"))');
 await click('[data-tab=class]');await until('Boolean(document.querySelector("#attendance-form"))');assert.equal(await evaluate('document.body.textContent.includes("Huda")'),false,'Teachers see only their classes.');
 await evaluate(`document.querySelector('[name="mark:${ali.id}"][value=absent]').click()`);await until(`document.querySelector('[name="mark:${ali.id}"][value=absent]').checked`);await shot('teacher-attendance');assert.ok(await noOverflow());
 await submit('#attendance-form');await until('document.querySelector("#toast").textContent==="Attendance saved."');assert.equal(app.store.get().attendance.find(row=>row.studentId===ali.id).status,'absent');
 await fill('#work-form [name=title]','Maths exam');await fill('#work-form [name=type]','exam');await fill('#work-form [name=details]','Chapter 3');await submit('#work-form');await until('document.querySelector("#toast").textContent==="Posted."');await until('document.body.textContent.includes("Maths exam")');
 await click('[data-tab=settings]');await until('Boolean(document.querySelector("#password-form"))');await click('[data-action=logout]');await until('Boolean(document.querySelector("#login-form"))');
 // Parent joins with the code, then adds a second child.
 await click('[data-action=join]');await until('Boolean(document.querySelector("#join-form"))');await fill('#join-form [name=code]',code);await fill('#join-form [name=name]','Mariam');await fill('#join-form [name=email]','mariam@home.test');await fill('#join-form [name=password]',password);await fill('#join-form [name=confirm]',password+'x');await submit('#join-form');await until('document.querySelector("#login-error").textContent==="Passwords do not match."');
 await fill('#join-form [name=confirm]',password);await shot('parent-join');await submit('#join-form');await until('Boolean(document.querySelector(".hero"))');
 assert.ok(await evaluate('document.querySelector(".hero .eyebrow").textContent==="In class now"'));assert.ok(await evaluate('document.body.textContent.includes("Absent")&&document.body.textContent.includes("Maths exam")'));assert.equal(await evaluate('Boolean(document.querySelector("[data-tab=class]"))'),false,'Parents have no Class tab.');await shot('parent-today');assert.ok(await noOverflow());
 await click('[data-tab=settings]');await until('Boolean(document.querySelector("#link-form"))');await fill('#link-form [name=code]',hudaCode);await submit('#link-form');await until('document.querySelector("#toast").textContent==="Child added."');
 await click('[data-tab=today]');await until('document.querySelectorAll(".child-strip button").length===2');await click(`[data-child="${huda.id}"]`);await until('document.querySelector(".hero h1").textContent.includes("Art")');await shot('parent-second-child');
 await click(`[data-child="${ali.id}"]`);await click('[data-tab=week]');await until('Boolean(document.querySelector(".day-strip"))');assert.equal(await evaluate('Boolean(document.querySelector("#week-view"))'),false);
 await click('[data-tab=homework]');await until('document.body.textContent.includes("Chapter 3")');await click('[data-tab=attendance]');await until('Boolean(document.querySelector("#absence-form"))');
 await fill('#absence-form [name=reason]','Doctor visit');await shot('parent-attendance');assert.ok(await noOverflow());await submit('#absence-form');await until('document.querySelector("#toast").textContent==="Request sent."');await until('document.body.textContent.includes("Waiting for the school")');
 // A background update must not wipe a form being typed.
 await fill('#absence-form [name=reason]','Still typing');await request('teacher-messages',{userId:'parents',text:'Trip on Thursday'});await refresh();await until('document.querySelector(".tab-badge")?.textContent==="1"||document.querySelector("#absence-form").dataset.dirty==="1"');assert.equal(await evaluate('document.querySelector("#absence-form [name=reason]").value'),'Still typing');
 const request0=app.store.get().absenceRequests[0];
 await click('[data-tab=today]');await until('document.querySelector(".tab-badge")?.textContent==="1"');await click('[data-tab=messages]');await until('document.body.textContent.includes("Trip on Thursday")');
 // Staff approval comes back to the parent; Arabic works at phone width.
 await request('absence-requests',{id:request0.id,status:'approved'});await click('[data-tab=attendance]');await refresh();await until('document.body.textContent.includes("Approved")');
 await click('[data-tab=settings]');await until('Boolean(document.querySelector("#language"))');await fill('#language','ar');await until('document.documentElement.dir==="rtl"');await click('[data-tab=attendance]');await until('document.body.textContent.includes("طلب غياب")');assert.ok(await noOverflow());await shot('parent-attendance-arabic');await click('[data-tab=today]');await until('Boolean(document.querySelector(".hero"))');assert.ok(await noOverflow());await shot('parent-today-arabic');
 assert.deepEqual(await evaluate('window.__cspErrors'),[],'Pages must work under the server security policy.');
 console.log('Parent app checks passed: student setup and import, one-time invitations, teacher attendance and exams, parent views, siblings, absence requests and decisions, messages, typing protection, Arabic at phone width.');
}catch(error){if(browser)console.log(await browser.evaluate('document.body.innerText'));throw error;}finally{await browser?.close();await app.close();}
