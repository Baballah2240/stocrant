import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {browserQa} from './browser-helper.mjs';
const directory=mkdtempSync(join(tmpdir(),'qatar-lesson-ui-')),app=await startServer({directory,port:0}),shots=resolve('.qa/lessons');mkdirSync(shots,{recursive:true});let browser,cookie='';
const password=randomBytes(24).toString('hex');
async function request(path,body,method='POST'){const r=await fetch(app.origin+'/api/'+path,{method,headers:{Origin:app.origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r;}
try{
 await request('setup',{name:'School Administrator',email:'lessons@school.test',password});cookie=(await request('login',{email:'lessons@school.test',password})).headers.get('set-cookie').split(';')[0];
 const base={day:0,classId:'default',subjectAr:'',teacherEn:'Teacher Ahmed',teacherAr:'',room:''};
 await request('draft',{schedule:[{...base,id:'math',type:'lesson',start:'07:30',end:'07:31',subjectEn:'Mathematics'},{...base,id:'break',type:'break',start:'07:31',end:'07:32',subjectEn:'Break'},{...base,id:'english',type:'lesson',start:'07:32',end:'07:33',subjectEn:'English'}]},'PUT');await request('publish',{});
 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');await send('Network.enable');await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__qaTime=Date.parse('2026-10-25T04:29:51Z');window.__qaSeen=0;window.__qaSetAt=performance.now();const realFetch=window.fetch;window.fetch=async(...args)=>{const r=await realFetch(...args);if(String(args[0]).startsWith('/api/display')&&r.ok){const value=await r.json();value.serverTime=window.__qaTime+performance.now()-window.__qaSetAt;window.__qaSeen=window.__qaTime;return new Response(JSON.stringify(value));}return r;};`});
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`),submit=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);
 const shot=async name=>writeFileSync(join(shots,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const seek=async time=>{await evaluate(`window.__qaTime=Date.parse('2026-10-25T${time}Z');window.__qaSetAt=performance.now()`);await until('window.__qaSeen===window.__qaTime');await new Promise(r=>setTimeout(r,400));};
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("[data-tab=settings]"))');assert.ok(await evaluate('document.querySelector(".identity").textContent.includes("Qatar School Time Table")'));
 await click('[data-tab=timetable]');await click('[data-day="0"]');await click('[data-action=edit][data-id=math]');await until('Boolean(document.querySelector("[data-lesson-photo=teacherImage]"))');
 const doc=await send('DOM.getDocument');for(const [key,file] of [['teacherImage','assets/icon.png'],['actionImage','assets/student-return.png']]){
  const node=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'[data-lesson-photo='+key+']'});await send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[resolve(file)]});await until(`document.querySelector('#activity-form [name=${key}]').value.startsWith('/api/images/')`);
 }
 await submit('#activity-form');await until('!document.querySelector("dialog[open]")');await click('[data-action=save-draft]');await until('document.querySelector("#draft-status").textContent==="All changes saved"');
 await evaluate('window.confirm=()=>true');await click('[data-action=publish]');await until('document.querySelector("#toast").textContent==="Timetable published."');
 const teacher=app.store.get().published.find(r=>r.id==='math').teacherImage,action=app.store.get().published.find(r=>r.id==='math').actionImage;assert.ok(teacher&&action&&teacher!==action);
 await click('[data-tab=settings]');await evaluate(`(()=>{const f=document.querySelector('#settings-form');f.elements.lessonFinishSeconds.value='3';f.elements.lessonStartSeconds.value='3';f.requestSubmit();})()`);await until('document.querySelector("#toast").textContent==="Saved successfully."');await shot('settings');
 await send('Page.navigate',{url:app.origin+'/display?overlay=1&token='+app.store.get().displayToken});await until('document.body.classList.contains("cinematic")');assert.ok(await evaluate('document.querySelector(".cinema-eyebrow").textContent.includes("starts soon")'));assert.ok(await evaluate(`document.querySelector('.cinema-photo img').getAttribute('src').startsWith(${JSON.stringify(teacher)})`));await shot('teacher-countdown');
 await seek('04:30:10');await until('document.body.classList.contains("lesson-clock")');assert.equal(await evaluate('document.querySelector(".ribbon").textContent.trim()'),'07:30');assert.equal(await evaluate('document.querySelector(".ribbon h1")'),null);
 await new Promise(r=>setTimeout(r,8500));assert.ok(await evaluate('document.querySelector(".ribbon").getBoundingClientRect().right>innerWidth-80'));await shot('docked-clock');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});for(const [width,height] of [[1920,1080],[1366,768],[390,844]]){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));assert.equal(await evaluate('getComputedStyle(document.querySelector(".panel-shell")).transitionDuration'),'0s');}
 await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
 await seek('04:30:52');await seek('04:31:00');await until('document.querySelector(".cinema-eyebrow")?.textContent.includes("Lesson finished")');assert.ok(await evaluate(`document.querySelector('.cinema-photo img').getAttribute('src').startsWith(${JSON.stringify(action)})`));await shot('lesson-finished');await until('document.querySelector(".cinema-eyebrow")?.textContent.includes("Time for a break")');
 await request('settings',{...app.store.get().settings,lessonLeadSeconds:0},'PUT');await seek('04:31:52');await seek('04:32:00');await until('document.querySelector(".cinema-eyebrow")?.textContent.includes("lesson is starting")');await until('document.body.classList.contains("lesson-clock")');
 await request('settings',{...app.store.get().settings,language:'ar',lessonLeadSeconds:10},'PUT');await seek('04:29:52');await until('document.documentElement.dir==="rtl"&&document.body.classList.contains("cinematic")');assert.ok(await evaluate('document.querySelector(".cinema-eyebrow").textContent.includes("قريباً")'));await shot('arabic-countdown');
 await click('.exit-fullscreen');await until('!document.body.classList.contains("cinematic")');
 console.log('Lesson screen checks passed: product name, editor photo uploads, adjustable controls, teacher countdown, only time during lessons, slow docking, reduced motion, responsive screens, full finish photo, break transition, zero lead, Arabic and exit.');
}finally{await browser?.close();await app.close();}
