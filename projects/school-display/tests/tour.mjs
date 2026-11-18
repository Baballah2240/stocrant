import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {schoolClock} from '../shared/schedule.mjs';
import {browserQa} from './browser-helper.mjs';

const directory=mkdtempSync(join(tmpdir(),'qatar-tour-')),app=await startServer({directory,port:0,updateEnv:{}});
const shots=resolve('.qa/tour');mkdirSync(shots,{recursive:true});
let browser,cookie='';const password=randomBytes(24).toString('hex');
async function request(path,body,method='POST'){
 const response=await fetch(app.origin+'/api/'+path,{method,headers:{Origin:app.origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.ok(response.ok,await response.clone().text());return {data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
try{
 await request('setup',{name:'Tour administrator',email:'tour@school.test',password});cookie=(await request('login',{email:'tour@school.test',password})).cookie;
 const clock=schoolClock(new Date(),'Asia/Qatar');
 const row={id:'weekly',classId:'default',day:clock.day,type:'event',start:'00:00',end:'23:59',subjectEn:'Weekly activity',subjectAr:'',teacherEn:'',teacherAr:'',room:''};
 await request('draft',{schedule:[row]},'PUT');
 await request('special-days',{specialDays:[{id:'special',classId:'default',date:clock.date,nameEn:'Special day',nameAr:'',mode:'replace',schedule:[{...row,id:'replacement',subjectEn:'Special activity'}]}]},'PUT');await request('publish',{});
 browser=await browserQa(directory);const {send,evaluate,until}=browser;
 await send('Page.enable');await send('Network.enable');
 const setCookie=()=>send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});await setCookie();
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__writes=0;const realFetch=window.fetch;window.fetch=(input,options)=>{if(options?.method&&options.method!=='GET')window.__writes++;return realFetch(input,options);};`});
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const shot=async name=>writeFileSync(join(shots,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const navigate=async()=>{await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("[data-start-tour]"))');};
 await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await navigate();
 assert.equal(await evaluate('document.querySelector(".timeline").textContent.includes("Special activity")'),true);
 assert.equal(await evaluate('document.querySelector(".timeline").textContent.includes("Weekly activity")'),false);
 await click('[data-start-tour]');await until('Boolean(document.querySelector("#app-tour[open]"))');await shot('english');
 assert.equal(await evaluate('document.querySelector("#app-tour progress").max'),7);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await evaluate('document.querySelector("#app-tour").contains(document.activeElement)'),true);
 await click('[data-tour-next]');assert.equal(await evaluate('document.querySelector("#tour-title").textContent'),'Classes and lessons');await click('[data-tour-back]');
 for(let i=0;i<6;i++)await click('[data-tour-next]');await click('[data-tour-next]');await until('!document.querySelector("#app-tour")');
 assert.equal(await evaluate('document.activeElement.matches("[data-start-tour]")'),true);assert.equal(await evaluate('window.__writes'),0,'Tour must never write data');
 await click('[data-start-tour]');await click('[data-tour-next]');await click('[data-tour-open]');await until('Boolean(document.querySelector("#draft-status"))');assert.equal(await evaluate('Boolean(document.querySelector(".tour-target"))'),false);
 await click('[data-tab=settings]');await evaluate(`(()=>{const input=document.querySelector('[name=schoolEn]');input.value='Unsaved school';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 // Leaving with real unsaved changes asks first; choosing to stay keeps them.
 await evaluate('window.__asked=0;window.confirm=()=>{__asked++;return false}');
 await click('[data-tab=overview]');assert.equal(await evaluate('document.querySelector("[name=schoolEn]").value'),'Unsaved school');
 assert.equal(await evaluate('window.__asked'),1,'Leaving asks whether to discard unsaved changes.');
 await click('[data-start-tour]');await click('[data-tour-open]');assert.ok(await evaluate('document.querySelector("#app-tour .hint").textContent.includes("save your changes")'));await click('[data-tour-close]');
 assert.equal(await evaluate('document.querySelector("[name=schoolEn]").value'),'Unsaved school');assert.notEqual(app.store.get().settings.schoolEn,'Unsaved school');
 await evaluate('document.querySelector("#settings-form").requestSubmit()');await until('document.querySelector("#toast").textContent==="Saved successfully."');
 await click('[data-action=language]');await click('[data-start-tour]');assert.equal(await evaluate('document.querySelector("#app-tour").dir'),'rtl');
 assert.equal(await evaluate('document.querySelector("#tour-title").textContent'),'مدرستك في لمحة');
 for(const [width,height] of [[1920,1080],[1366,768],[390,844]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
  assert.ok(await evaluate('(()=>{const r=document.querySelector("#app-tour").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+2;})()'));
 }
 await shot('arabic-mobile');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until('!document.querySelector("#app-tour")');
 await request('settings',{...app.store.get().settings,holidays:[clock.date]},'PUT');await navigate();assert.equal(await evaluate('document.querySelectorAll(".timeline-row").length'),0,'Holiday must not show normal lessons');
 for(const role of ['coordinator','teacher']){
  cookie=(await request('login',{email:'tour@school.test',password})).cookie;
  await request('users',{name:role,email:role+'@school.test',password,role,classIds:['default']});cookie=(await request('login',{email:role+'@school.test',password})).cookie;await setCookie();await navigate();
  await click('[data-start-tour]');assert.equal(await evaluate('document.querySelector("#app-tour progress").max'),role==='teacher'?3:4);
  assert.equal(await evaluate('Boolean(document.querySelector("[data-tab=settings]"))'),false);
  await click('[data-tour-close]');assert.equal(await evaluate('window.__writes'),0);
 }
 console.log('Tour checks passed: both languages, all roles, keyboard focus and Escape, completion/reopen, explicit navigation, no data writes, unsaved settings protection, three viewport sizes, special-day and holiday dashboard accuracy.');
}finally{await browser?.close();await app.close();}
