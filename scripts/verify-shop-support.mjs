import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { browserQa } from './browser-qa.mjs';
import { seedAmal } from './storefront-fixture.mjs';
const root=mkdtempSync(join(tmpdir(),'stocrant-test-data-support-browser-'));
process.env.STOCRANT_DATA_DIR=root;process.env.NODE_ENV='development';
const {createApp}=await import('../dist/app.js');
const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;let browser;
try {
  const fixture=await seedAmal(base);browser=await browserQa(root);const {send,evaluate,until}=browser;
  await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const shots=resolve('.local-preview/qa/shop-support');mkdirSync(shots,{recursive:true});
  async function fill(selector,value){await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);}
  async function field(label,value){await evaluate(`(()=>{const input=Array.from(document.querySelectorAll('.shop-customer-support label')).find(l=>l.firstChild.textContent===${JSON.stringify(label)}).querySelector('input,textarea,select');Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);}
  async function click(text,selector='button'){await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);}
  async function manager(){await send('Network.setCookie',{name:'stocrant_session',value:fixture.cookie.split('=').slice(1).join('='),url:base,path:'/'});await send('Page.navigate',{url:base+'/shops'});await until('Boolean(document.querySelector(".app-lock-screen input"))');await fill('.app-lock-screen input',fixture.password);await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');await until('Boolean(document.querySelector(".shop-tabs"))');await fill('.shop-workspace .page-header select',fixture.company.id);await click('Shop customer service','.shop-tabs button');await until('document.querySelector(".shop-support-thread")?.textContent.includes("Product question")');}
  await send('Page.navigate',{url:base+'/shop/amal/support'});await until('Boolean(document.querySelector(".shop-customer-support form button:not([disabled])"))');
  await field('Your name','Shop Browser Customer');await field('Email','customer@example.test');await field('Subject','Product question');await field('Your message','Is this product available for collection?');await click('Send support request');
  await until('document.querySelector(".support-conversation")?.textContent.includes("Is this product available")');
  assert.equal((await fixture.req(`/workspace/storefronts/${fixture.company.id}/support`)).data.total,1);
  await manager();await fill('.shop-support-thread textarea','Yes, collection is available.');await click('Send shop reply');await until('document.querySelector(".shop-support-thread")?.textContent.includes("Yes, collection is available.")');
  await evaluate('document.querySelector(".shop-support-inbox").scrollIntoView({block:"start"})');writeFileSync(join(shots,'shop-inbox-desktop.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await send('Page.navigate',{url:base+'/shop/amal/support'});await until('document.querySelector(".support-conversation")?.textContent.includes("Yes, collection is available.")');
  await fill('.support-conversation textarea','Thank you. What time can I collect?');await click('Send message');await until('document.querySelector(".support-conversation")?.textContent.includes("What time can I collect?")');
  assert.equal((await fixture.req(`/workspace/storefronts/${fixture.company.id}/support`)).data.open,1);
  await manager();await fill('.shop-support-thread textarea','Please collect during our opening hours.');await click('Reply & resolve');await until('document.querySelector(".shop-support-thread")?.textContent.includes("resolved")');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),'Shop support inbox fits phone');
  writeFileSync(join(shots,'shop-inbox-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  for(const [language,theme,width] of [['en','light',1440],['ar','dark',390],['en','light',320]]) {
    await evaluate(`localStorage.setItem('amal.language',JSON.stringify(${JSON.stringify(language)}));localStorage.setItem('amal.theme',JSON.stringify(${JSON.stringify(theme)}))`);
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<700});await send('Page.navigate',{url:base+'/shop/amal/support'});await until('document.querySelector(".support-conversation")?.textContent.includes("Please collect during our opening hours.")');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),`Customer support fits ${language}/${width}`);
    await evaluate('document.querySelector(".support-conversation").scrollIntoView({block:"center"})');writeFileSync(join(shots,`customer-${language}-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  console.log('Shop support browser checks passed: customer request, company inbox, staff reply, customer follow-up, resolution, persistence and responsive English/Arabic layouts.');
} finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
