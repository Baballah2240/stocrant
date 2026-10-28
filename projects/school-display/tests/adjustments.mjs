import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {browserQa} from './browser-helper.mjs';
const directory=mkdtempSync(join(tmpdir(),'school-adjustments-')),app=await startServer({directory,port:0}),shots=resolve('.qa/adjustments');mkdirSync(shots,{recursive:true});let browser;
try{
 // Keep exercising the optional detailed-panel layout alongside the new lesson clock suite.
 Object.assign(app.store.get().settings,{lessonClock:false,lessonLeadSeconds:0,lessonStartSeconds:0,lessonFinishSeconds:0});app.store.save();
 const password=randomBytes(24).toString('hex');let cookie='';
 async function request(path,body,method='POST'){const r=await fetch(app.origin+'/api/'+path,{method,headers:{Origin:app.origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r;}
 await request('setup',{name:'Owner',email:'adjust@school.test',password});cookie=(await request('login',{email:'adjust@school.test',password})).headers.get('set-cookie').split(';')[0];await request('publish',{});
 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');await send('Network.enable');await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__qaTime=Date.parse('2026-10-25T04:40:00Z');const originalFetch=window.fetch;window.fetch=async(...args)=>{const r=await originalFetch(...args);if(String(args[0]).startsWith('/api/display')&&r.ok){const data=await r.json();data.serverTime=window.__qaTime;return new Response(JSON.stringify(data));}return r;};`});
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const fill=(name,value)=>evaluate(`(()=>{const input=document.querySelector('[name='+${JSON.stringify(name)}+']');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const change=(name,value)=>evaluate(`(()=>{const select=document.querySelector('[name='+${JSON.stringify(name)}+']');select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const shot=async name=>writeFileSync(join(shots,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("[data-tab=timetable]"))');await evaluate('window.confirm=()=>true');
 await click('[data-tab=timetable]');await click('[data-day="0"]');assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),5);
 await click('[data-action=add-class]');await fill('nameEn','Grade 6A');await fill('nameAr','الصف السادس أ');await evaluate('document.querySelector("#class-form").requestSubmit()');await until('!document.querySelector("dialog[open]")&&document.querySelector("[name=timetable-class]").value!=="default"');
 const group=await evaluate('document.querySelector("[name=timetable-class]").value');assert.equal(await evaluate('document.querySelectorAll("tbody [data-action=edit]").length'),0);
 await click('[data-action=add-lesson]');await fill('subjectEn','Art');await fill('subjectAr','الفنون');await fill('teacherEn','New Teacher');await fill('teacherAr','معلم الفنون');await evaluate('document.querySelector("#activity-form").requestSubmit()');await until('!document.querySelector("dialog[open]")');
 await change('timetable-class','default');assert.equal(await evaluate('document.querySelector("[name=timetable-class]").value'),group,'Unsaved class changes cannot be lost.');
 await click('[data-action=save-draft]');await until('document.querySelector("#draft-status").textContent==="All changes saved"');
 await click('[data-action=add-lesson]');assert.equal(await evaluate('document.querySelector("[name=start]").value'),'08:15');await fill('subjectEn','History');await fill('teacherEn','Another Teacher');await evaluate('document.querySelector("#activity-form").requestSubmit()');await until('!document.querySelector("dialog[open]")');await click('[data-action=save-draft]');await until('document.querySelector("#draft-status").textContent==="All changes saved"');
 await change('timetable-class','default');assert.equal(await evaluate('document.querySelectorAll("tbody [data-action=edit]").length'),5);await change('timetable-class',group);assert.equal(await evaluate('document.querySelectorAll("tbody [data-action=edit]").length'),2);await shot('class-timetable');
 await click('[data-action=publish]');await until('document.querySelector("#toast").textContent==="Timetable published."');await click('[data-tab=settings]');
 await change('classId',group);await fill('panelWidth','420');await fill('textScale','140');await fill('edgeMargin','64');await change('horizontal','right');await change('position','bottom');
 await until('document.querySelector(".adjustment-preview iframe").contentDocument?.body.style.getPropertyValue("--text-scale")==="1.4"');
 assert.equal(app.store.get().settings.panelWidth,680,'Live preview must not save settings.');await shot('live-adjustments');
 await evaluate('document.querySelector("#settings-form").requestSubmit()');await until('document.querySelector("#toast").textContent==="Saved successfully."');assert.equal(app.store.get().settings.panelWidth,420);assert.equal(app.store.get().settings.classId,group);
 await send('Page.navigate',{url:app.origin+'/display?token='+app.store.get().displayToken});await until('document.querySelector(".activity h1")?.textContent.includes("Art")');
 assert.ok(await evaluate('document.querySelector(".class-name").textContent.includes("Grade 6A")'));assert.ok(await evaluate('document.querySelector(".activity p").textContent.includes("New Teacher")'));assert.equal(await evaluate('getComputedStyle(document.querySelector(".activity h1")).fontSize'),'21px');
 for(const [width,height] of [[1920,1080],[1366,768],[800,600],[390,844]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
  const layout=await evaluate('(()=>{const r=document.querySelector(".ribbon").getBoundingClientRect();return {width:r.width,right:r.right,overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:[...document.querySelectorAll(".ribbon strong,.ribbon h1,.ribbon p")].some(n=>n.scrollWidth>n.clientWidth+1&&n.clientWidth>0)};})()');
  assert.equal(layout.overflow,false,JSON.stringify(layout));assert.equal(layout.clipped,false,JSON.stringify(layout));if(width>700){assert.equal(layout.width,420);assert.ok(Math.abs(width-layout.right-64)<2);}
  await shot('adjusted-'+width);
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await request('settings',{...app.store.get().settings,panelWidth:1200,textScale:80,edgeMargin:12,horizontal:'left',position:'top'},'PUT');await until('document.body.style.getPropertyValue("--panel-width")==="1200px"');
 assert.ok(await evaluate('(()=>{const r=document.querySelector(".ribbon").getBoundingClientRect();return r.width===1200&&Math.abs(r.left-12)<2;})()'));await shot('wide-left');
 await request('settings',{...app.store.get().settings,language:'ar'},'PUT');await until('document.documentElement.dir==="rtl"');assert.ok(await evaluate('document.querySelector(".class-name").textContent.includes("الصف السادس أ")'));await shot('arabic-class');
 console.log('Adjustments passed: class-group creation, additional periods, independent timetables, unsaved-draft protection, publication, selected-class display, live unsaved preview, width/text/alignment/margins at four screen sizes, maximum width and Arabic RTL.');
}catch(error){if(browser)console.log(await browser.evaluate('document.body.innerText'));throw error;}finally{await browser?.close();await app.close();}
