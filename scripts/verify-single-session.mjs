import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {browserQa} from './browser-qa.mjs';
import {seedAmal} from './storefront-fixture.mjs';
const root=mkdtempSync(join(tmpdir(),'stocrant-test-data-single-session-'));
process.env.STOCRANT_DATA_DIR=root;process.env.NODE_ENV='development';
const {createApp}=await import('../dist/app.js');const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 const fixture=await seedAmal(base),email='manager@single-session.test',temporary=randomUUID()+randomUUID(),password=randomUUID()+randomUUID();
 await fixture.req('/workspace/access/users','POST',{name:'Session Manager',email,password:temporary,roleId:'role-shop-manager',organizationIds:[fixture.company.id]});
 async function post(path,body,cookie=''){const response=await fetch(base+'/api'+path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(response.ok,await response.clone().text());return response;}
 let login=await post('/auth/login',{email,password:temporary}),cookie=login.headers.get('set-cookie').split(';')[0];await post('/auth/password',{currentPassword:temporary,newPassword:password},cookie);login=await post('/auth/login',{email,password});cookie=login.headers.get('set-cookie').split(';')[0];
 browser=await browserQa(root);const {send,evaluate,until}=browser;await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/shops'});await until('Boolean(document.querySelector(".auth-card form"))');
 async function fill(selector,value){await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
 await fill('input[autocomplete=username]',email);await fill('input[autocomplete=current-password]',password);await evaluate('document.querySelector(".auth-card form").requestSubmit()');await until('Boolean(document.querySelector(".auth-session-conflict button"))');
 assert.equal((await fetch(base+'/api/auth/me',{headers:{Cookie:cookie}})).status,200,'A denied second login keeps the first session');
 const shots=resolve('.local-preview/qa/single-session');mkdirSync(shots,{recursive:true});writeFileSync(join(shots,'conflict-desktop.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});await evaluate(`document.querySelector('[aria-label="Switch to Arabic"]').click()`);await until('document.documentElement.dir==="rtl"');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
 writeFileSync(join(shots,'conflict-ar-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await evaluate('document.querySelector(".auth-session-conflict button").click()');await until('Boolean(document.querySelector(".shop-workspace"))');assert.equal((await fetch(base+'/api/auth/me',{headers:{Cookie:cookie}})).status,401,'Explicit close revokes the old session');
 assert.equal(await evaluate('fetch("/api/auth/me").then(response=>response.status)'),200);
 // Replace the browser session from another client, then focus it to verify
 // the old screen returns to sign-in without waiting for another write.
 await post('/auth/login',{email,password,closeOtherSessions:true});await evaluate('window.dispatchEvent(new Event("focus"))');await until('Boolean(document.querySelector(".auth-card form"))');
 console.log('Single-session browser checks passed: conflict recovery, responsive form, explicit replacement, old-session revocation and sign-in refresh on focus.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
