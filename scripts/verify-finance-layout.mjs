import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { browserQa } from './browser-qa.mjs';
const root=mkdtempSync(join(tmpdir(),'stocrant-test-data-finance-layout-'));
process.env.STOCRANT_DATA_DIR=root;
process.env.NODE_ENV='development';
const {createApp}=await import('../dist/app.js');
const {getStore,saveStore}=await import('../dist/storage.js');
const server=createApp().listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`,password=randomBytes(24).toString('hex');
let browser;
try {
  const response=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Finance QA',email:'finance@example.test',password,setupKey:'local-setup'})});
  assert.equal(response.status,201);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const data=getStore();
  data.collections.financeAccounts.push({id:'qa-bank',organizationId:'company-primary',name:'Finance QA bank',currency:'QAR',type:'bank',openingBalance:'1000.00'});
  data.collections.sales.push({id:'qa-sale',organizationId:'company-primary',invoiceNo:'QA-SALE',date:'2026-01-01',total:'100.00',currency:'QAR',status:'completed'});
  data.collections.purchases.push({id:'qa-bill',organizationId:'company-primary',poNumber:'QA-BILL',date:'2026-01-01',total:'75.00',currency:'QAR',status:'ordered'});
  saveStore(data);
  browser=await browserQa(root);
  const {send,evaluate,until}=browser;
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCookie',{name:'stocrant_session',value:cookie.slice(cookie.indexOf('=')+1),url:base,path:'/'});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/finance'});
  await until('Boolean(document.querySelector(".app-lock-screen input"))');
  await evaluate(`(()=>{const input=document.querySelector('.app-lock-screen input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(password)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');
  await until('Boolean(document.querySelector(".finance-shortcuts"))');
  await until('Array.from(document.querySelectorAll(".finance-filters select option")).some(o=>o.value==="QAR")');
  await evaluate(`(()=>{const input=Array.from(document.querySelectorAll('.finance-filters label')).find(l=>l.firstChild.textContent==='Currency').querySelector('select');input.value='QAR';input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__errors=[];addEventListener("error",e=>__errors.push(e.message));addEventListener("unhandledrejection",e=>__errors.push(String(e.reason)));'});
  await evaluate('window.__errors=[]');
  const fill=(selector,value)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(n),'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const shots=resolve('.local-preview/qa/finance-layout');mkdirSync(shots,{recursive:true});
  async function navigate(path){
    await send('Page.navigate',{url:base+path});await until('Boolean(document.querySelector(".app-lock-screen input"))');
    await fill('.app-lock-screen input',password);await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');
    await until('Boolean(document.querySelector(".finance-shortcuts"))');
  }
  let layouts=0;
  for(const lang of ['en','ar'])for(const theme of ['light','dark'])for(const [width,height] of [[1920,1080],[1366,768],[390,844],[320,740]]){
    await evaluate(`localStorage.setItem('stocrant.language','${lang}');localStorage.setItem('stocrant-theme','${theme}')`);
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await navigate('/finance?currency=QAR&period=custom&from=2026-01-01&to=2026-12-31');
    assert.equal(await evaluate('document.documentElement.dir'),lang==='ar'?'rtl':'ltr');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),`${lang}/${theme}/${width} overflow`);
    assert.equal(await evaluate('document.querySelectorAll(".finance-tool-groups button").length'),4);
    assert.equal(await evaluate('document.querySelectorAll(".finance-tabs:not([hidden])").length'),1);
    await evaluate('document.querySelector(".finance-tool-groups button:nth-child(2)").click()');
    await until('new URLSearchParams(location.search).get("tab")==="All movements"');
    assert.equal(await evaluate('new URLSearchParams(location.search).get("from")'),'2026-01-01');
    await evaluate('document.querySelector("[role=tab][aria-selected=true]").focus()');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:lang==='ar'?'ArrowLeft':'ArrowRight',code:lang==='ar'?'ArrowLeft':'ArrowRight',windowsVirtualKeyCode:lang==='ar'?37:39});
    await until('new URLSearchParams(location.search).get("tab")==="Income"');
    await until('document.activeElement.matches("[role=tab][aria-selected=true]")');
    await evaluate('document.querySelector(".finance-tool-groups button:first-child").click()');
    await until('Boolean(document.querySelector(".finance-shortcuts"))');
    if(width===1366||width===390){await evaluate('document.querySelector(".finance-metrics").scrollIntoView({block:"start"})');writeFileSync(join(shots,`${lang}-${theme}-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
    await evaluate('document.querySelector(".page-head .inline-actions button:last-child").click()');await until('Boolean(document.querySelector("#finance-editor"))');
    await fill('#finance-editor input[type=text]','Unsubmitted layout draft');
    await evaluate('window.dispatchEvent(new Event("stocrant:finance-changed"))');
    await until('!document.querySelector(".finance-page").getAttribute("aria-busy")||document.querySelector(".finance-page").getAttribute("aria-busy")==="false"');
    assert.equal(await evaluate('document.querySelector("#finance-editor input[type=text]").value'),'Unsubmitted layout draft');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),'editor fits');
    assert.deepEqual(await evaluate('__errors'),[]);layouts++;
  }
  await send('Emulation.setEmulatedMedia',{media:'print'});
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".finance-tool-navigation")).display'),'none');
  writeFileSync(join(shots,'result.json'),JSON.stringify({passed:true,layouts,keyboard:true,filterContext:true,draftPreservation:true,print:true},null,2));
  console.log(`Finance layout: ${layouts} responsive bilingual/theme combinations, keyboard tabs, filter context, drafts and print passed.`);
} finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
