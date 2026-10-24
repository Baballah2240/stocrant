import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { browserQa } from './browser-qa.mjs';
const root=mkdtempSync(join(tmpdir(),'stocrant-test-data-finance-connected-'));
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
  data.collections.sales.push({id:'qa-sale',organizationId:'company-primary',invoiceNo:'QA-SALE',date:'2026-01-01',total:'100.00',currency:'QAR',status:'approved'});
  saveStore(data);
  browser=await browserQa(root);
  const {send,evaluate,until}=browser;
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
  async function tab(label) { await evaluate(`Array.from(document.querySelectorAll('.finance-tabs button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`); }
  await tab('Sales');await until('document.querySelector(".finance-report")?.textContent.includes("QA-SALE")');
  assert.equal(await evaluate(`document.querySelector('.finance-report a[href$="/sales/new"]')?.getAttribute('href')`),'/stores/sales/new');
  await tab('Banking');await until('document.querySelector(".finance-report")?.textContent.includes("Finance QA bank")');
  await tab('Salaries & payroll');await until('Boolean(document.querySelector(".payroll-page"))');
  await tab('Profit & loss');await until('Boolean(document.querySelector(".finance-connected table"))');
  await evaluate('document.querySelector(".finance-connected").scrollIntoView({block:"start"})');
  const shots=resolve('.local-preview/qa');mkdirSync(shots,{recursive:true});
  for (const [width,height,mobile] of [[1440,1000,false],[390,844,true]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),'Finance fits viewport');
    writeFileSync(join(shots,`finance-connected-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  await evaluate('localStorage.setItem("stocrant.language","ar");localStorage.setItem("stocrant-theme","dark")');
  await send('Page.reload');
  await until('Boolean(document.querySelector(".app-lock-screen input"))');
  await evaluate(`(()=>{const input=document.querySelector('.app-lock-screen input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(password)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');
  await until('document.documentElement.dir==="rtl" && Boolean(document.querySelector(".finance-connected"))');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),'Arabic finance fits viewport');
  writeFileSync(join(shots,'finance-connected-arabic.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  console.log('Connected Finance browser checks passed: overview, sales source, banking, embedded payroll, P&L, desktop/mobile and Arabic dark layout.');
} finally {
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
