import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {browserQa} from './browser-helper.mjs';
const directory=mkdtempSync(join(tmpdir(),'school-background-')),app=await startServer({directory,port:0}),shots=resolve('.qa/background');mkdirSync(shots,{recursive:true});let browser;
try{
 // Keep exercising the optional detailed-panel layout alongside the new lesson clock suite.
 Object.assign(app.store.get().settings,{lessonClock:false,lessonLeadSeconds:0,lessonStartSeconds:0,lessonFinishSeconds:0});app.store.save();
 const password=randomBytes(24).toString('hex');let cookie='';
 const req=async(path,body,method='POST',session=cookie)=>{const response=await fetch(app.origin+'/api/'+path,{method,headers:{Origin:app.origin,'Content-Type':'application/json',Cookie:session},body:JSON.stringify(body)});return {status:response.status,response,data:await response.json()};};
 await req('setup',{name:'Owner',email:'background@school.test',password});cookie=(await req('login',{email:'background@school.test',password})).response.headers.get('set-cookie').split(';')[0];
 await req('draft',{schedule:[
  {id:'math',classId:'default',day:0,type:'lesson',start:'07:30',end:'08:15',subjectEn:'Mathematics',subjectAr:'',teacherEn:'Teacher',teacherAr:'',room:''},
  {id:'break',classId:'default',day:0,type:'break',start:'08:15',end:'08:30',subjectEn:'Break',subjectAr:'',teacherEn:'',teacherAr:'',room:''},
  {id:'english',classId:'default',day:0,type:'lesson',start:'08:30',end:'09:15',subjectEn:'English',subjectAr:'',teacherEn:'Teacher',teacherAr:'',room:''}
 ]},'PUT');await req('publish',{});
 assert.equal((await req('settings',{...app.store.get().settings,hideBar:true},'PUT','')).status,401);
 assert.equal((await req('settings',{...app.store.get().settings,hideBar:'true'},'PUT')).status,400);
 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');await send('Network.enable');await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__qaTime=Date.parse('2026-10-25T04:40:00Z');window.__qaSounds=0;window.__qaLayout=null;window.schoolDesktop={alert:()=>window.__qaSounds++,reportLayout:layout=>window.__qaLayout=layout,onPointer:()=>()=>{}};const realFetch=window.fetch;window.fetch=async(...args)=>{const response=await realFetch(...args);if(String(args[0]).startsWith('/api/display')&&response.ok){const value=await response.json();value.serverTime=window.__qaTime;return new Response(JSON.stringify(value));}return response;};`});
 await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("[data-tab=settings]"))');await evaluate('document.querySelector("[data-tab=settings]").click()');await until('Boolean(document.querySelector("[name=hideBar]"))');
 await evaluate(`(()=>{const f=document.querySelector('#settings-form');f.elements.hideBar.checked=true;f.elements.sound.checked=true;f.elements.notificationSeconds.value='3';f.requestSubmit();})()`);await until('document.querySelector("#toast").textContent==="Saved successfully."');assert.equal(app.store.get().settings.hideBar,true);assert.equal(app.store.get().settings.paused,false);
 await send('Page.navigate',{url:'about:blank'});await until('location.href==="about:blank"');await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("[data-tab=settings]"))');await evaluate('document.querySelector("[data-tab=settings]").click()');await until('document.querySelector("[name=hideBar]")?.checked');
 await until('Boolean(document.querySelector(".adjustment-preview iframe").contentDocument?.querySelector(".panel-shell"))');await until('getComputedStyle(document.querySelector(".adjustment-preview iframe").contentDocument.querySelector(".panel-shell")).visibility==="visible"');
 await evaluate('document.querySelector("[data-action=language]").click()');await until('document.documentElement.dir==="rtl"');assert.ok(await evaluate('document.querySelector("[name=hideBar]").closest("label").textContent.includes("إخفاء")'));
 writeFileSync(join(shots,'settings-arabic.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const url=app.origin+'/display?overlay=1&token='+app.store.get().displayToken;await send('Page.navigate',{url});await until('document.body.classList.contains("bar-hidden")');assert.equal(await evaluate('getComputedStyle(document.querySelector(".panel-shell")).visibility'),'hidden');assert.equal(await evaluate('document.querySelector(".activity h1").textContent'),'Mathematics');await until('window.__qaLayout?.width===0');
 await evaluate("window.__qaTime=Date.parse('2026-10-25T05:15:00Z')");await until('document.querySelector("#alert").classList.contains("show")');assert.equal(await evaluate('getComputedStyle(document.querySelector("#alert")).display'),'flex');assert.ok(await evaluate('window.__qaSounds>0'));await until('document.body.classList.contains("cinematic")');assert.equal(await evaluate('document.querySelector(".exit-fullscreen").hidden'),false);
 await evaluate('document.querySelector(".exit-fullscreen").click()');await until('!document.body.classList.contains("cinematic")');assert.equal(await evaluate('getComputedStyle(document.querySelector(".panel-shell")).visibility'),'hidden');
 await until('!document.querySelector("#alert").classList.contains("show")');await evaluate("window.__qaTime=Date.parse('2026-10-25T05:31:00Z')");await until('document.querySelector(".activity h1")?.textContent==="English"');await until('document.querySelector("#alert").classList.contains("show")');assert.equal(await evaluate('window.__qaLayout.centered'),false);
 await until('!document.querySelector("#alert").classList.contains("show")');await evaluate("window.__qaTime=Date.parse('2026-10-25T07:00:00Z')");await until('document.body.classList.contains("clock-only")');await until('document.querySelector("#alert").classList.contains("show")');assert.equal(await evaluate('getComputedStyle(document.querySelector("#alert")).display'),'flex');assert.equal(await evaluate('window.__qaLayout.clockOnly'),false,'Hidden idle clock must not shrink the native alert window.');
 writeFileSync(join(shots,'background-alert.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await req('settings',{...app.store.get().settings,hideBar:false},'PUT');await until('!document.body.classList.contains("bar-hidden")');assert.equal(await evaluate('getComputedStyle(document.querySelector(".panel-shell")).visibility'),'visible');
 const backup=(await fetch(app.origin+'/api/backup',{headers:{Cookie:cookie}}).then(r=>r.json()));assert.equal(backup.settings.hideBar,false);
 console.log('Background checks passed: admin-only settings, persistence, Arabic toggle, visible adjustment preview, hidden live bar, continuing lesson/break alerts and sound, break exit, idle notifications and restored bar.');
}finally{await browser?.close();await app.close();}
