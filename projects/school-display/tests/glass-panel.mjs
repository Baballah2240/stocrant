import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {browserQa} from './browser-helper.mjs';
const directory=mkdtempSync(join(tmpdir(),'school-glass-')),app=await startServer({directory,port:0}),shots=resolve('.qa/glass');mkdirSync(shots,{recursive:true});let browser;
try{
 // Keep exercising the optional detailed-panel layout alongside the new lesson clock suite.
 Object.assign(app.store.get().settings,{lessonClock:false,lessonLeadSeconds:0,lessonStartSeconds:0,lessonFinishSeconds:0});app.store.save();
 const password=randomBytes(24).toString('hex');
 async function post(path,body,cookie=''){const response=await fetch(app.origin+'/api/'+path,{method:'POST',headers:{Origin:app.origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});assert.ok(response.ok,await response.clone().text());return response;}
 await post('setup',{name:'School Admin',email:'glass@school.test',password});const login=await post('login',{email:'glass@school.test',password});const cookie=login.headers.get('set-cookie').split(';')[0];await post('publish',{},cookie);
 Object.assign(app.store.get().settings,{schoolEn:'Al Noor International School',schoolAr:'مدرسة النور الدولية'});app.store.save();
 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');await send('Runtime.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__qaTime=Date.parse('2026-10-25T04:40:00Z');window.__qaOffline=false;const originalFetch=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).startsWith('/api/display')){if(window.__qaOffline)throw Error('offline');const r=await originalFetch(...args);if(r.ok){const data=await r.json();data.serverTime=window.__qaTime;return new Response(JSON.stringify(data));}return r;}return originalFetch(...args);};`});
 const url=app.origin+'/display?token='+app.store.get().displayToken;
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 async function shot(name){writeFileSync(join(shots,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 async function viewport(width,height,mobile=false){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});}
 async function layout(){return evaluate(`(()=>{const el=document.querySelector('.ribbon'),r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,clipped:[...el.querySelectorAll('strong,h1,p,small,time')].some(n=>n.scrollWidth>n.clientWidth+1&&n.clientWidth>0)};})()`);}
 await viewport(1920,1080);await send('Page.navigate',{url});await until('document.querySelector(".activity h1")?.textContent.includes("Mathematics")');
 for(const [width,height] of [[1920,1080],[1366,768],[800,600],[390,844]]){await viewport(width,height);await wait(100);const l=await layout();assert.equal(l.overflow,false,JSON.stringify(l));assert.equal(l.clipped,false,JSON.stringify(l));if(width>=1366){assert.equal(l.width,680);assert.equal(l.columns,3);assert.ok(l.height>=84&&l.height<=180,JSON.stringify(l));assert.ok(Math.abs(l.x-(width-680)/2)<1);assert.ok(l.y>=8&&l.y<=120);}await shot('bilingual-'+width);}
 await viewport(1366,768);
 // Record actual timer latency and preserve the same target over clock updates.
 await evaluate(`window.__panel=document.querySelector('.ribbon');window.__changes=[];new MutationObserver(()=>{if(__panel.classList.contains('is-hovered'))__changes.push(performance.now());}).observe(__panel,{attributes:true,attributeFilter:['class']});`);
 // Physical mouse events; fine-pointer capability is checked by the implementation.
 console.log('Hover capability:',await evaluate("matchMedia('(hover: hover) and (pointer: fine)').matches"));
 const point=await evaluate('(()=>{const r=__panel.getBoundingClientRect();return {x:r.x+50,y:r.y+40};})()');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await evaluate('window.__entered=performance.now()');await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await wait(250);assert.equal(await evaluate('__panel.classList.contains("is-hovered")'),false);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await wait(350);assert.equal(await evaluate('__panel.classList.contains("is-hovered")'),false,'Early leave must cancel activation.');
 await evaluate('window.__entered=performance.now()');await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await until('__panel.classList.contains("is-hovered")');const latency=await evaluate('__changes[0]-__entered');assert.ok(latency>=490&&latency<900,'Hover latency: '+latency);
 await wait(260);const matrix=await evaluate('getComputedStyle(__panel).transform');assert.match(matrix,/1\.015/);await wait(1100);assert.equal(await evaluate('__panel===document.querySelector(".ribbon")&&__panel.classList.contains("is-hovered")'),true,'Clock render must not replace hovered panel.');await shot('hover');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await wait(260);assert.equal(await evaluate('__panel.classList.contains("is-hovered")'),false);assert.match(await evaluate('getComputedStyle(__panel).transform'),/matrix\(1, 0, 0, 1, 0, 0\)/);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await wait(600);assert.match(await evaluate('getComputedStyle(__panel).transform'),/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);assert.equal(await evaluate('getComputedStyle(__panel).transitionDuration'),'0s');await send('Emulation.setEmulatedMedia',{features:[]});
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await evaluate('__panel.dispatchEvent(new PointerEvent("pointerenter",{pointerType:"touch"}))');await wait(600);assert.equal(await evaluate('__panel.classList.contains("is-hovered")'),false);
 app.store.get().settings.language='ar';app.store.save();await until('document.documentElement.dir==="rtl"');await viewport(1366,768);assert.equal((await layout()).clipped,false);await shot('arabic-1366');
 app.store.get().settings.language='en';app.store.save();await until('document.documentElement.dir==="ltr"&&!document.querySelector(".activity .secondary-language")');await shot('english-1366');
 await evaluate('window.__qaOffline=true');await until('document.querySelector(".display-status.offline")');assert.ok(await evaluate('document.querySelector(".publication").textContent.includes("Published")'));assert.ok(await evaluate('document.querySelector(".last-sync").textContent.includes("Last sync")'));await shot('offline');
 console.log('Glass panel checks passed: 1920/1366/800/390 layouts, three sections, live content, publication/network/sync status, measured hover '+Math.round(latency)+'ms, cancellation, stable target, touch, RTL/LTR and reduced motion.');
}finally{await browser?.close();await app.close();}
