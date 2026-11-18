import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {browserQa} from './browser-helper.mjs';
const directory=mkdtempSync(join(tmpdir(),'school-teacher-app-')),app=await startServer({directory,port:0,updateEnv:{}}),shots=resolve('.qa/teacher-app');mkdirSync(shots,{recursive:true});let browser,cookie='';const password=randomBytes(24).toString('hex');
async function request(path,body,method='POST'){const r=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:app.origin,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(r.ok,await r.clone().text());return {data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const lesson=(id,classId,day,start,end,teacherEn,subjectEn,room='')=>({id,classId,day,type:'lesson',start,end,subjectEn,subjectAr:subjectEn==='Science'?'العلوم':'',teacherEn,teacherAr:'',room});
try{
 await request('setup',{name:'Owner',email:'owner@school.test',password});cookie=(await request('login',{email:'owner@school.test',password})).cookie;
 const a=(await request('classes',{nameEn:'Grade 6A',nameAr:'السادس أ'})).data.group,b=(await request('classes',{nameEn:'Grade 7B',nameAr:'السابع ب'})).data.group;
 const week=[0,1,2,3,4,5,6].flatMap(day=>[lesson('a'+day,a.id,day,'00:00','23:00','Sara Ali','Science','Lab 2'),lesson('b'+day,b.id,day,'23:00','23:45','Omar','Art')]);
 await request('draft',{schedule:week},'PUT');await request('publish',{});
 await request('users',{name:'Sara',email:'sara@school.test',password,role:'teacher',classIds:[a.id],teacherName:'Sara Ali'});
 await request('announcements',{classIds:[a.id],textEn:'Staff meeting at noon',textAr:'اجتماع المعلمين ظهراً',expiresAt:new Date(Date.now()+3600000).toISOString()});
 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 const shot=async name=>writeFileSync(join(shots,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const fill=(selector,value)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const noOverflow=()=>evaluate('document.documentElement.scrollWidth<=innerWidth+1');
 // Control panel: live board, teacher week view, room clash warning and the cover planner.
 await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("#live-board .live-card"))');assert.ok(await evaluate('document.querySelector("#live-board").textContent.includes("Science")'));
 await click('[data-tab=timetable]');await until('Boolean(document.querySelector("#board-view"))');
 const sara=await evaluate('[...document.querySelector("#board-view").options].find(o=>o.textContent==="Sara Ali").value');await fill('#board-view',sara);await until('document.querySelector("#board-view").value==='+JSON.stringify(sara));
 assert.ok(await evaluate('document.querySelector(".week-chip").textContent.includes("Grade 6A")'),'The teacher view names the class.');assert.equal(await evaluate('document.querySelector(".week-chip").style.height==="1794px"'),true,'Chips are sized by lesson length under the page security policy.');await shot('board-teacher');
 await click('[data-tab=calendar]');await until('Boolean(document.querySelector("#cover-find"))');const coverDate='2026-11-01';await fill('#cover-find [name=date]',coverDate);await fill('#cover-find [name=teacher]',sara);await evaluate('document.querySelector("#cover-find").requestSubmit()');await until('Boolean(document.querySelector("#cover-form"))');
 const coverSelect=await evaluate('document.querySelector("#cover-form select").name');assert.deepEqual(await evaluate('[...document.querySelector("#cover-form select").options].map(o=>o.textContent)'),['Choose later','Omar (lessons that day: 1)']);await shot('cover-planner');
 await fill(`#cover-form select`,'omar');await evaluate('document.querySelector("#cover-form").requestSubmit()');await until('document.querySelector("#toast").textContent==="Special-day draft saved. Publish to update screens."');
 const planned=app.store.get().specialDays.find(row=>row.date===coverDate);assert.equal(planned.classId,coverSelect.split('|')[0]);assert.equal(planned.schedule[0].teacherEn,'Omar');assert.equal(planned.schedule[0].substituteFor,'Sara Ali');assert.equal(app.store.get().publishedSpecialDays.length,0,'Cover stays a draft until published.');assert.equal(app.store.get().draft.find(row=>row.id==='a0').teacherEn,'Sara Ali','The weekly timetable is unchanged.');
 const saraId=app.store.get().users.find(row=>row.email==='sara@school.test').id;await fill('#teacher-message-form [name=userId]',saraId);await fill('#teacher-message-form [name=text]','Welcome message');await evaluate('document.querySelector("#teacher-message-form").requestSubmit()');await until('document.querySelector("#toast").textContent==="Message sent."');assert.equal(app.store.get().teacherMessages[0].userId,saraId);
 await request('special-days',{specialDays:[]},'PUT');await send('Network.deleteCookies',{name:'school_session',url:app.origin});await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__cspErrors=[];document.addEventListener('securitypolicyviolation',event=>window.__cspErrors.push(event.violatedDirective+' '+event.blockedURI));"});
 await send('Page.navigate',{url:app.origin+'/teacher'});await until('Boolean(document.querySelector("#login-form"))');
 assert.equal(await evaluate('Boolean(document.querySelector("[name=server]"))'),false,'The browser version uses its own server.');await shot('login');
 await fill('#login-form [name=email]','sara@school.test');await fill('#login-form [name=password]','wrong-password-value');await evaluate('document.querySelector("#login-form").requestSubmit()');await until('document.querySelector("#login-error").textContent==="Email or password is incorrect."');
 await fill('#login-form [name=password]',password);await evaluate('document.querySelector("#login-form").requestSubmit()');await until('Boolean(document.querySelector(".hero"))');
 assert.ok(await evaluate('document.querySelector(".hero h1").textContent.includes("Science")'));assert.ok(await evaluate('document.body.textContent.includes("Staff meeting at noon")'));assert.ok(await noOverflow());await shot('today');
 assert.equal(await evaluate('document.body.textContent.includes("Art")'),false,'The Today view lists only this teacher.');
 assert.equal(await evaluate('localStorage.getItem("teacher-token")===null'),false);
 const before=await evaluate('document.querySelector("[data-countdown]").textContent');assert.match(before,/\d/);
 await click('[data-tab=week]');await until('Boolean(document.querySelector(".day-strip"))');assert.equal(await evaluate('document.querySelectorAll(".day-strip button").length'),7);assert.ok(await noOverflow());await shot('week');
 await click('[data-select-day="3"]');await until('document.querySelector("[data-select-day=\\"3\\"]").classList.contains("selected")');
 await fill('#week-view',a.id);await until('document.querySelector("#week-view").value==='+JSON.stringify(a.id));
 await click('[data-tab=settings]');await until('Boolean(document.querySelector("#language"))');assert.ok(await evaluate('document.body.textContent.includes("Sara Ali")'));assert.equal(await evaluate('Boolean(document.querySelector("#reminder"))'),false,'Reminders need the phone app.');
 await fill('#language','ar');await until('document.documentElement.dir==="rtl"');assert.ok(await noOverflow());await shot('settings-arabic');
 await click('[data-tab=today]');await until('Boolean(document.querySelector(".hero"))');assert.ok(await evaluate('document.querySelector(".hero h1").textContent.includes("العلوم")'));assert.ok(await noOverflow());await shot('today-arabic');
 // A published timetable change reaches the app on its next update without another sign-in.
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await request('special-days',{specialDays:[{id:'cover',date:today,classId:a.id,mode:'cancel',nameEn:'Exam day',nameAr:'يوم الاختبار',schedule:[]}]},'PUT');await request('publish',{});
 await evaluate('document.dispatchEvent(new Event("visibilitychange"))');await until('document.body.textContent.includes("يوم الاختبار")');await shot('change-arabic');
 // A new staff message raises an alert and badge; text is shown literally and opening the tab clears the badge.
 assert.equal(await evaluate('document.querySelector("[data-tab=messages] .tab-badge").textContent'),'1','A message sent before sign-in waits unread.');
 await request('teacher-messages',{userId:saraId,text:'<img src=x onerror=alert(1)> Collect the exam papers'});await evaluate('document.dispatchEvent(new Event("visibilitychange"))');await until('document.querySelector("[data-tab=messages] .tab-badge")?.textContent==="2"');assert.ok(await evaluate('document.querySelector("#toast").textContent.includes("رسالة جديدة")'));await shot('message-alert-arabic');
 await click('[data-tab=messages]');await until('document.body.textContent.includes("Collect the exam papers")');assert.equal(await evaluate('Boolean(document.querySelector(".message img"))'),false,'Message text is never treated as HTML.');assert.equal(await evaluate('Boolean(document.querySelector("[data-tab=messages] .tab-badge"))'),false);assert.ok(await noOverflow());await shot('messages-arabic');await click('[data-tab=today]');
 // The saved timetable still opens when the school server cannot be reached.
 await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*/api/mobile/*']});await evaluate('document.dispatchEvent(new Event("visibilitychange"))');await until('Boolean(document.querySelector(".offline"))');assert.ok(await evaluate('Boolean(document.querySelector(".hero"))'));await shot('offline-arabic');await send('Network.setBlockedURLs',{urls:[]});
 assert.deepEqual(await evaluate('window.__cspErrors'),[],'The page must work under the server security policy.');
 await evaluate('document.dispatchEvent(new Event("visibilitychange"))');await until('!document.querySelector(".offline")');
 // 2.5: Back returns to the previous screen instead of leaving the app; a password can be shown.
 await click('[data-tab=today]');await click('[data-tab=messages]');await until('document.querySelector("main").dataset.view==="messages"');
 await evaluate('history.back()');await until('document.querySelector("main").dataset.view==="today"');
 await evaluate('history.forward()');await until('document.querySelector("main").dataset.view==="messages"');
 await click('[data-tab=settings]');await click('[data-action=logout]');await until('Boolean(document.querySelector("#login-form"))');assert.equal(await evaluate('localStorage.getItem("teacher-data")'),null,'Signing out removes the saved timetable.');assert.equal(app.store.get().mobileTokens.length,0);
 await evaluate('document.querySelector("[data-show-password]").click()');assert.equal(await evaluate('document.querySelector("#login-form [name=password]").type'),'text','Show reveals the password.');
 console.log('Teacher app checks passed: Back between screens, show password, sign-in errors, today and week views, own-lesson filtering, Arabic RTL at phone width, live timetable changes, offline fallback and sign-out.');
}catch(error){if(browser)console.log(await browser.evaluate('document.body.innerText'));throw error;}finally{await browser?.close();await app.close();}
