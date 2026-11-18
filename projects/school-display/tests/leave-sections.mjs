// A section with only confirmation passwords (System & recovery) never traps the user: a typed or
// browser-filled password is not an unsaved change. Real unsaved changes ask before leaving, and
// choosing to leave discards them. Browser check; run with: node tests/leave-sections.mjs
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {browserQa} from './browser-helper.mjs';
const directory=mkdtempSync(join(tmpdir(),'school-leave-')),app=await startServer({directory,port:0,updateEnv:{}});let browser,cookie='';const password=randomBytes(24).toString('hex');
async function request(path,body){const r=await fetch(app.origin+'/api/'+path,{method:'POST',headers:{Origin:app.origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});return {cookie:r.headers.get('set-cookie')?.split(';')[0]};}
try{
 await request('setup',{name:'Admin',email:'leave@school.test',password});cookie=(await request('login',{email:'leave@school.test',password})).cookie;
 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');await send('Network.enable');
 await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__asked=0;window.__answer=false;window.confirm=()=>{__asked++;return __answer};'});
 const active=()=>evaluate('document.querySelector("[data-tab][aria-current=page]")?.dataset.tab');
 const go=async tab=>{await evaluate(`document.querySelector("[data-tab=${tab}]").click()`);await new Promise(r=>setTimeout(r,500));};
 const type=(selector,value)=>evaluate(`(()=>{const i=document.querySelector(${JSON.stringify(selector)});i.value=${JSON.stringify(value)};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 for(const [width,mobile] of [[1440,false],[390,true]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile});
  await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("[data-tab=health]"))');
  await go('health');assert.equal(await active(),'health');
  await type('#install-update-form [name=password]','browser-filled');
  await go('timetable');assert.equal(await active(),'timetable',width+': a filled password does not block leaving System & recovery');
  assert.equal(await evaluate('__asked'),0,'no question for a password');
  // A real change asks; staying keeps it, leaving discards it.
  await go('settings');await type('[name=schoolEn]','Unsaved school');
  await go('overview');assert.equal(await active(),'settings');assert.equal(await evaluate('__asked'),1);
  await type('[name=schoolEn]',await evaluate('document.querySelector("[name=schoolEn]").defaultValue'));await go('overview');assert.equal(await active(),'overview','changing the field back is no longer unsaved');
  await go('settings');await type('[name=schoolEn]','Unsaved again');await evaluate('__answer=true');await go('overview');assert.equal(await active(),'overview','choosing to leave discards the change');
  await evaluate('__answer=false;__asked=0');
 }
 assert.notEqual(app.store.get().settings.schoolEn,'Unsaved again');
 console.log('Leave-section checks passed: passwords never trap System & recovery, real changes ask, staying keeps them, leaving discards them, desktop and phone widths.');
}finally{await browser?.close();await app.close();}
