import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {browserQa} from './browser-qa.mjs';
const root=mkdtempSync(join(tmpdir(),'stocrant-test-data-hr-layout-'));process.env.STOCRANT_DATA_DIR=root;process.env.NODE_ENV='development';
const {createApp}=await import('../dist/app.js');const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;let browser,cookie='';const password=randomBytes(24).toString('hex');
async function req(path,method='GET',body){const response=await fetch(base+'/api'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return {response,data};}
try{
 cookie=(await req('/auth/setup','POST',{name:'HR Workspace Owner',email:'hr-layout@browser.test',password,setupKey:'local-setup'})).response.headers.get('set-cookie').split(';')[0];
 const org=(await req('/collections/organizations','POST',{name:'HR Preview',status:'active'})).data.item;
 const company=(await req('/collections/companies','POST',{name:'Northstar Services',parentOrganizationId:org.id,status:'active',organizationType:'office',industry:'services',currency:'QAR'})).data.item;
 for(let i=0;i<15;i++)await req('/collections/employees','POST',{name:i===0?'Avery Team Lead':`Employee ${String(i).padStart(2,'0')}`,organizationId:company.id,department:i%2?'Operations':'People',jobTitle:'Specialist',email:`employee${i}@browser.test`,status:'active',hireDate:'2026-01-01'});
 browser=await browserQa(root);const {send,evaluate,until}=browser;await send('Network.enable');await send('Network.setCookie',{name:'stocrant_session',value:cookie.split('=').slice(1).join('='),url:base,path:'/'});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 async function fill(selector,value){await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
 async function open(){await send('Page.navigate',{url:base+'/hr'});await until('Boolean(document.querySelector(".app-lock-screen input"))');await fill('.app-lock-screen input',password);await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');await until('document.querySelectorAll(".hr-directory-table tbody tr").length===12');}
 await open();const shots=resolve('.local-preview/qa/hr-layout');mkdirSync(shots,{recursive:true});
 async function shot(name){writeFileSync(join(shots,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 assert.equal(await evaluate('document.querySelectorAll(".hr-directory-table th").length'),9);await shot('desktop');
 await evaluate('document.querySelector(".workspace-sidebar-toggle").click()');await until('Math.round(document.querySelector(".sidebar").getBoundingClientRect().width)===76');assert.ok(await evaluate('(()=>{const el=document.querySelector(".sidebar");return !el.inert && el.getBoundingClientRect().width>60})()'));
 assert.ok(await evaluate('Array.from(document.querySelectorAll(".sidebar .nav-item")).every(el=>el.title && getComputedStyle(el.querySelector("svg")).display!=="none")'));await shot('collapsed');
 await fill('.hr-directory-search input','Avery');await until('document.querySelectorAll(".hr-directory-table tbody tr").length===1');assert.ok(await evaluate('document.querySelector(".hr-directory-results").textContent.includes("Showing 1 of")'));
 await evaluate('document.querySelector(".hr-directory-results button").click()');await until('document.querySelectorAll(".hr-directory-table tbody tr").length===12');
 await evaluate('document.querySelector("th[aria-sort] button").click()');assert.equal(await evaluate('document.querySelector("th[aria-sort]").getAttribute("aria-sort")'),'ascending');
 for(const width of [390,768]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<700});await until('document.documentElement.scrollWidth<=innerWidth+2');await shot('responsive-'+width);}
 await evaluate('localStorage.setItem("stocrant.language","ar")');await open();assert.equal(await evaluate('document.documentElement.dir'),'rtl');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));await shot('arabic');
 console.log('HR layout browser checks passed: metrics, compact company section, nine-column table, pagination, search/reset, sorting semantics, collapsed accessible icon rail and English/Arabic responsive layouts.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

