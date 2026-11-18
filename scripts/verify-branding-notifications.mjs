import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';import {join,resolve} from 'node:path';import {browserQa} from './browser-qa.mjs';
const root=mkdtempSync(join(tmpdir(),'stocrant-test-data-branding-notifications-'));process.env.STOCRANT_DATA_DIR=root;process.env.NODE_ENV='development';
const {createApp}=await import('../dist/app.js'),{createNotification}=await import('../dist/notifications.js'),{getStore}=await import('../dist/storage.js');
const server=createApp().listen(0,'127.0.0.1');await new Promise(done=>server.once('listening',done));const base=`http://127.0.0.1:${server.address().port}`,password=randomBytes(24).toString('hex');let browser;
try{
 for(const name of ['dark','light']){const svg=readFileSync(`public/branding/stocrant-logo-${name}.svg`,'utf8');assert.ok(svg.includes('aria-label="Stocrant"'));assert.ok(!/<text|<image|<script|linearGradient/.test(svg));}
 const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Branding QA',email:'brand@qa.test',password,setupKey:'local-setup'})});assert.equal(setup.status,201);const cookie=setup.headers.get('set-cookie').split(';')[0];
 const owner=getStore().collections.accessUsers[0];const text='Full message start\n'+('A detailed message with Arabic تفاصيل الرسالة and <safe text>. '.repeat(40))+'\nFULL MESSAGE END';
 const notice=createNotification({userId:owner.id,user:owner.name,type:'message',severity:'info',message:text,target:null});
 createNotification({userId:'foreign-user',user:'Foreign',type:'message',severity:'info',message:'PRIVATE FOREIGN MESSAGE',target:null});
 browser=await browserQa(root);const {send,evaluate,until}=browser;await send('Page.enable');await send('Network.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('stocrant.serverUrl',${JSON.stringify(base)});window.__errors=[];addEventListener('error',e=>__errors.push(e.message));`});
 const shots=resolve('.local-preview/qa/branding-notifications');mkdirSync(shots,{recursive:true});
 async function navigate(path){await send('Page.navigate',{url:base+path});await until('Boolean(document.querySelector(".app-lock-screen input"))');await evaluate(`(()=>{const n=document.querySelector('.app-lock-screen input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(password)});n.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.app-lock-screen form').requestSubmit();})()`);await until('Boolean(document.querySelector(".topbar"))');}
 // Sign-in layout before assigning the isolated QA session cookie.
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url:base+'/workspace'});await until('Boolean(document.querySelector(".auth-brand .stocrant-logo"))');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
 await send('Network.setCookie',{name:'stocrant_session',value:cookie.slice(cookie.indexOf('=')+1),url:base,path:'/'});
 let count=0;
 for(const language of ['en','ar'])for(const theme of ['light','dark'])for(const [width,height] of [[1366,768],[390,844],[320,740]]){
  await evaluate(`localStorage.setItem('stocrant.language',${JSON.stringify(language)});localStorage.setItem('stocrant-theme',${JSON.stringify(theme)})`);await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
  await navigate('/notifications?open='+notice.id);await until('Boolean(document.querySelector(".notification-full-message"))');
  assert.equal(await evaluate('document.querySelector(".notification-full-message").textContent'),text);
  assert.ok(!await evaluate('document.querySelector(".notification-history").textContent.includes("PRIVATE FOREIGN MESSAGE")'));
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),`${language}/${theme}/${width} overflow`);
  if(width===1366){assert.ok(await evaluate(`[...document.querySelectorAll(".stocrant-logo")].every(box=>{const outer=box.getBoundingClientRect();return [...box.querySelectorAll("img")].every(img=>{const r=img.getBoundingClientRect();return Math.abs(r.top-outer.top)<1&&Math.abs(r.height-outer.height)<1;});})`),`${language}/${theme} logo image escapes its box`);assert.equal(await evaluate('document.querySelectorAll(".sidebar .stocrant-logo").length'),0);const logo=await evaluate('JSON.stringify(document.querySelector(".topbar-brand .stocrant-logo").getBoundingClientRect())');assert.equal(await evaluate(`getComputedStyle(document.querySelector('.topbar-brand .stocrant-logo-${theme==='dark'?'dark':'light'}')).visibility`),'visible');await evaluate('document.querySelector(".workspace-sidebar-toggle").click()');await until('document.querySelector(".ios-app").classList.contains("sidebar-collapsed")');assert.equal(await evaluate('JSON.stringify(document.querySelector(".topbar-brand .stocrant-logo").getBoundingClientRect())'),logo);assert.equal(await evaluate('getComputedStyle(document.querySelector(".topbar-brand .stocrant-logo-icon")).visibility'),'visible');await evaluate('document.querySelector(".workspace-sidebar-toggle").click()');}
  assert.deepEqual(await evaluate('window.__errors'),[]);if(width===390){const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(shots,`${language}-${theme}.png`),Buffer.from(shot.data,'base64'));}count++;
 }
 console.log(`Branding and notifications verified: ${count} bilingual/theme layouts, sign-in, fixed logo bounds on collapse, full long-message text, safe text rendering and account isolation.`);
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(done=>server.close(done));assert.ok(root.startsWith(join(tmpdir(),'stocrant-test-data-branding-notifications-')));rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:250});}
