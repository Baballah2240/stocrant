import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {browserQa} from './browser-qa.mjs';
import {seedAmal} from './storefront-fixture.mjs';
const root=mkdtempSync(join(tmpdir(),'stocrant-test-data-shop-management-'));
process.env.STOCRANT_DATA_DIR=root;process.env.NODE_ENV='development';
const {createApp}=await import('../dist/app.js');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 const fixture=await seedAmal(base),company=fixture.company,shop=`/workspace/shops/${company.id}`;
 const temporary=randomUUID()+randomUUID(),password=randomUUID()+randomUUID(),email='manager@shop-management.test';
 await fixture.req('/workspace/access/users','POST',{name:'Shop Manager',email,password:temporary,roleId:'role-shop-manager',organizationIds:[company.id]});
 async function post(path,body,cookie=''){const r=await fetch(base+'/api'+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r;}
 let login=await post('/auth/login',{email,password:temporary});let cookie=login.headers.get('set-cookie').split(';')[0];await post('/auth/password',{currentPassword:temporary,newPassword:password},cookie);login=await post('/auth/login',{email,password});cookie=login.headers.get('set-cookie').split(';')[0];
 let order=(await fixture.req(shop+'/orders','POST',{requestId:randomUUID(),customer:'QA Customer',phone:'123456789',lines:[{productId:fixture.products[0].id,quantity:1}]})).data;
 order=(await fixture.req(shop+`/orders/${order.id}/status`,'POST',{version:order.version,status:'preparing'})).data;
 order=(await fixture.req(shop+`/orders/${order.id}/status`,'POST',{version:order.version,status:'dispatched',tracking:'SHOP-QA'})).data;
 browser=await browserQa(root);const {send,evaluate,until}=browser;
 await send('Network.enable');await send('Network.setCookie',{name:'stocrant_session',value:cookie.split('=').slice(1).join('='),url:base,path:'/'});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 async function fill(selector,value){await evaluate(`(()=>{const i=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i),'value').set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event(i.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);}
 async function click(text,selector='button'){await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(i=>i.textContent.trim()===${JSON.stringify(text)}).click()`);}
 await send('Page.navigate',{url:base+'/shops?company='+company.id+'&tab=settings'});await until('Boolean(document.querySelector(".app-lock-screen input"))');await fill('.app-lock-screen input',password);await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');await until('Boolean(document.querySelector(".shop-operation-settings"))');
 assert.equal(await evaluate('document.querySelectorAll(".shop-settings-hub .shop-settings-tabs article").length'),4);
 await click('Customer storefront','.shop-settings-tabs button');await until('Boolean(document.querySelector(".storefront-settings"))');
 await click('Shop connections','.shop-settings-tabs button');await until('Boolean(document.querySelector(".shop-company-store-link"))');
 await click('Orders & payments','.shop-settings-tabs button');await until('Boolean(document.querySelector(".shop-operation-settings"))');
 await fill('.shop-operation-settings form + form input','Browser Shop Till');await evaluate('document.querySelector(".shop-operation-settings form + form").requestSubmit()');await until('document.querySelector(".shop-operation-settings")?.textContent.includes("Shop payment account created in Finance.")');
 const snapshot=(await fixture.req(shop)).data,account=snapshot.paymentAccounts.find(a=>a.name==='Browser Shop Till');assert.ok(account);
 await fill('.shop-operation-settings form select',account.id);await evaluate('document.querySelector(".shop-operation-settings form").requestSubmit()');await until('document.querySelector(".shop-operation-settings")?.textContent.includes("Shop settings saved.")');
 await click('Shop users','.shop-settings-tabs button');await until('Boolean(document.querySelector(".shop-staff-settings"))');await fill('.shop-staff-settings input','Browser Staff');await fill('.shop-staff-settings input[type=email]','staff@shop-management.test');await fill('.shop-staff-settings input[type=password]',randomUUID()+randomUUID());await evaluate('document.querySelector(".shop-staff-settings form").requestSubmit()');await until('document.querySelector(".shop-staff-settings .stack-list")?.textContent.includes("Browser Staff")');
 await click('Orders','.shop-tabs button');await until('Boolean(document.querySelector(".shop-orders button"))');await evaluate('document.querySelector(".shop-orders button").click()');await until('Boolean(document.querySelector(".shop-order-payment form"))');await evaluate('document.querySelector(".shop-order-payment form").requestSubmit()');await until('document.querySelector(".shop-order-payment")?.textContent.includes("Shop payment recorded in Finance.")');
 const paid=(await fixture.req(shop)).data;assert.equal(paid.orders.find(o=>o.id===order.id).settlement.outstanding,'0.00');assert.equal(paid.payments.filter(p=>p.sourceId===order.saleId).length,1);
 const shots=resolve('.local-preview/qa/shop-management');mkdirSync(shots,{recursive:true});writeFileSync(join(shots,'payments-desktop.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await click('Shop settings','.shop-tabs button');await until('Boolean(document.querySelector(".shop-operation-settings"))');
 for(const [language,width] of [['en',390],['ar',390]]){await evaluate(`localStorage.setItem('stocrant.language',${JSON.stringify(language)})`);await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url:base+'/shops?company='+company.id+'&tab=settings'});await until('Boolean(document.querySelector(".app-lock-screen input"))');await fill('.app-lock-screen input',password);await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');await until('Boolean(document.querySelector(".shop-operation-settings"))');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),language+' mobile fits');writeFileSync(join(shots,`settings-${language}-mobile.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
 console.log('Shop management browser checks passed: scoped manager, account creation, settings save, staff creation, order payment linked to Finance, English/Arabic phone layouts.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

