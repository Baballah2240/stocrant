import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {startServer} from '../server/server.mjs';
import {browserQa} from './browser-helper.mjs';
const directory=mkdtempSync(join(tmpdir(),'school-display-browser-')),app=await startServer({directory,port:0}),shots=resolve('.qa');mkdirSync(shots,{recursive:true});let browser;
try{
 // Keep exercising the optional detailed-panel layout alongside the new lesson clock suite.
 Object.assign(app.store.get().settings,{lessonClock:false,lessonLeadSeconds:0,lessonStartSeconds:0,lessonFinishSeconds:0});app.store.save();
 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
 const errors=[];await send('Runtime.enable');
 async function fill(name,value){await evaluate(`(()=>{const el=document.querySelector('[name="'+${JSON.stringify(name)}+'"]');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
 async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
 async function shot(name){writeFileSync(join(shots,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("#auth-form [name=name]"))');await shot('setup');
 await fill('name','Mohammed · School Administrator');await fill('email','admin@school.test');await fill('password','School-Browser-Test-1234');await fill('confirm','School-Browser-Test-1234');await evaluate('document.querySelector("#auth-form").requestSubmit()');await until('Boolean(document.querySelector("#auth-form")) && !document.querySelector("[name=confirm]")');
 await fill('email','admin@school.test');await fill('password','School-Browser-Test-1234');await evaluate('document.querySelector("#auth-form").requestSubmit()');await until('Boolean(document.querySelector(".metrics"))');
 await evaluate('window.confirm=()=>true');await click('[data-action=publish]');await until('document.querySelector(".metric strong").textContent==="25"');await shot('overview');
 await click('[data-tab=timetable]');assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),5);
 await click('[data-action=add]');await until('Boolean(document.querySelector("dialog[open]"))');await fill('start','11:00');await fill('end','11:45');await fill('subjectEn','History');await fill('subjectAr','التاريخ');await fill('teacherEn','Layla');await evaluate('document.querySelector("#activity-form").requestSubmit()');await until('!document.querySelector("dialog[open]")');await click('[data-action=save-draft]');await until('document.querySelector("#draft-status").textContent==="All changes saved"');await shot('timetable');
 await click('[data-action=publish]');await until('document.querySelector("#toast").textContent==="Timetable published."');
 await click('[data-tab=settings]');await fill('schoolEn','Al Noor International School');await fill('schoolAr','مدرسة النور الدولية');await evaluate('document.querySelector("#settings-form").requestSubmit()');await until('document.querySelector(".eyebrow").textContent.includes("Al Noor")');await shot('settings');
 await click('[data-action=language]');assert.equal(await evaluate('document.documentElement.dir'),'rtl');await shot('arabic-settings');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));await shot('mobile-arabic');
 const state=await evaluate('fetch("/api/state").then(r=>r.json())');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__qaTime=Date.parse('2026-10-25T04:40:00Z');window.__qaOffline=false;const originalFetch=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).startsWith('/api/display')){if(window.__qaOffline)throw Error('Simulated connection loss');const r=await originalFetch(...args);if(r.ok){const data=await r.json();data.serverTime=window.__qaTime;return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});}return r;}return originalFetch(...args);};`});
 await send('Page.navigate',{url:app.origin+state.displayUrl});await until('document.querySelector(".activity h1")?.textContent.includes("Mathematics")');await shot('display');
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await shot('display-1080p');
 await evaluate("window.__qaTime=Date.parse('2026-10-25T06:00:00Z')");await until('Boolean(document.querySelector(".ribbon.break"))');await until('document.querySelector("#alert strong")?.textContent.includes("Lesson finished")');await shot('display-break');await until('document.querySelector("#alert strong")?.textContent.includes("Break started")');
 await evaluate('window.__qaOffline=true');await until('Boolean(document.querySelector(".display-status.offline"))');assert.ok(await evaluate('Boolean(document.querySelector(".ribbon.break"))'));
 await evaluate('window.__qaOffline=false');app.store.get().displayToken='revoked-for-browser-test';app.store.save();await until('!document.querySelector(".ribbon")');
 console.log('Browser checks passed: setup, login, publish, editing, Arabic RTL, mobile width, live lesson and break states, offline retention and revoked display access. Screenshots in .qa.');
}catch(error){if(browser)console.log(await browser.evaluate('JSON.stringify({text:document.body.innerText,time:window.__qaTime,fetch:String(window.fetch).slice(0,160)})'));throw error;}finally{await browser?.close();await app.close();}
