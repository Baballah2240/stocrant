import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {browserQa} from './browser-helper.mjs';
const directory=mkdtempSync(join(tmpdir(),'school-remote-browser-')),shots=resolve('.qa/remote');mkdirSync(shots,{recursive:true});
const central=await startServer({directory:join(directory,'central'),port:0}),local=await startServer({directory:join(directory,'local'),port:0,desktop:{monitors:()=>[],applyRemote:async()=>{}},remoteOptions:{allowLoopback:true,interval:3600000}});let browser;
const password=randomBytes(24).toString('hex');
async function setup(app){const body={name:'QA administrator',email:'owner@school.test',password},headers={Origin:app.origin,'Content-Type':'application/json'};await fetch(app.origin+'/api/setup',{method:'POST',headers,body:JSON.stringify(body)});const login=await fetch(app.origin+'/api/login',{method:'POST',headers,body:JSON.stringify(body)});return {...headers,Cookie:login.headers.get('set-cookie').split(';')[0]};}
try{
 const cloudHeaders=await setup(central);await setup(local);
 await fetch(central.origin+'/api/publish',{method:'POST',headers:cloudHeaders,body:'{}'});
 const response=await fetch(central.origin+'/api/devices',{method:'POST',headers:cloudHeaders,body:JSON.stringify({name:'School classroom',classId:'default',monitor:'browser',enabled:true})});const device=(await response.json()).device;
 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');await send('Page.navigate',{url:local.origin+'/control'});await until('Boolean(document.querySelector("#auth-form"))');
 await evaluate(`(()=>{const f=document.querySelector('#auth-form');f.elements.email.value='owner@school.test';f.elements.password.value=${JSON.stringify(password)};f.requestSubmit();})()`);await until('Boolean(document.querySelector(".metrics"))');
 await evaluate('document.querySelector("[data-tab=health]").click()');await until('Boolean(document.querySelector("#remote-form"))');
 await evaluate(`(()=>{const f=document.querySelector('#remote-form');f.elements.url.value=${JSON.stringify(central.origin+device.displayUrl)};f.elements.password.value=${JSON.stringify(password)};f.requestSubmit();})()`);await until('document.querySelector("#remote-status")?.textContent.includes("Synchronized")');
 assert.ok(await evaluate('!document.querySelector("#remote-form").elements.url.value'));
 writeFileSync(join(shots,'connected.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await evaluate('document.querySelector("[data-action=language]").click()');await until('document.documentElement.dir==="rtl"');await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));assert.ok(await evaluate('document.querySelector("#remote-form").textContent.includes("مزامنة")'));
 writeFileSync(join(shots,'arabic-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await evaluate(`window.confirm=()=>true;document.querySelector('#remote-form').elements.password.value=${JSON.stringify(password)};document.querySelector('#remote-disconnect').click()`);await until('!document.querySelector("#remote-disconnect")');assert.equal(local.remote.status().configured,false);
 console.log('Remote browser checks passed: authenticated connection, private link cleared, synchronized status, Arabic RTL, mobile width, protected disconnect.');
}finally{await browser?.close();await local.close();await central.close();}
