import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {browserQa} from './browser-qa.mjs';

const root=mkdtempSync(join(tmpdir(),'stocrant-test-data-mobile-layout-'));
process.env.STOCRANT_DATA_DIR=root;process.env.NODE_ENV='development';
const {createApp}=await import('../dist/app.js');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`,password=randomBytes(24).toString('hex');
let cookie='',browser;
async function req(path,body){
  const response=await fetch(base+'/api'+path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return {data,response};
}
try{
  cookie=(await req('/auth/setup',{name:'Mobile Layout Owner',email:'owner@mobile-layout.test',password,setupKey:'local-setup'})).response.headers.get('set-cookie').split(';')[0];
  const ownerCookie=cookie;
  const org=(await req('/collections/organizations',{name:'Mobile Demo Group',status:'active'})).data.item;
  const company=(await req('/collections/companies',{name:'Mobile Demo Company',parentOrganizationId:org.id,status:'active',organizationType:'office',industry:'services',currency:'QAR'})).data.item;
  let employee;
  for(let i=1;i<=3;i++){
    const row=(await req('/collections/employees',{name:`Demo Employee ${i}`,email:`employee${i}@mobile-layout.test`,organizationId:company.id,status:'active',hireDate:'2025-01-01',department:'Operations',jobTitle:'Coordinator',phone:'+974 0000 0000'})).data.item;
    employee??=row;
  }
  const invitation=(await req(`/workspace/hr/communication/employees/${employee.id}/invitation`,{})).data;
  await req('/auth/activate-employee',{token:invitation.token,email:'employee1@mobile-layout.test',password});
  const employeeCookie=(await req('/auth/login',{email:'employee1@mobile-layout.test',password})).response.headers.get('set-cookie').split(';')[0];
  browser=await browserQa(root);const {send,evaluate,until}=browser;
  await send('Page.enable');await send('Network.enable');
  await send('Page.bringToFront');
  // Pin even a native-configured bundle to this disposable API; never call a live server in QA.
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__errors=[];addEventListener("error",e=>window.__errors.push(e.message));localStorage.setItem('stocrant.serverUrl',${JSON.stringify(base)});`});
  const setCookie=value=>send('Network.setCookie',{name:'stocrant_session',value:value.slice(value.indexOf('=')+1),url:base,path:'/'});
  await setCookie(ownerCookie);
  const output=resolve('.local-preview/qa/mobile-layout');mkdirSync(output,{recursive:true});
  const fill=(selector,value)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(n),'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const shot=async name=>writeFileSync(join(output,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  async function navigate(path,selector){
    await send('Page.navigate',{url:base+path});
    await until('Boolean(document.querySelector(".app-lock-screen input[type=password]"))');
    await fill('.app-lock-screen input',password);await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');
    await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  }
  const viewport=async width=>{
    assert.ok(await evaluate(`innerWidth<=${width+2}&&document.documentElement.scrollWidth<=${width+2}`),'Page expands beyond device viewport');
    assert.deepEqual(await evaluate('window.__errors'),[]);
  };
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/workspace','.work-activity-dashboard');
  const routes=[['/workspace','.work-activity-dashboard'],['/hr','.hr-directory-table'],['/hr/employees/new','.entity-form'],['/finance','.finance-page'],['/shops','.shop-workspace'],['/organizations','.organization-workspace'],['/operations','.operations-page'],['/mobile-more','.mobile-services-grid']];
  let layouts=0;
  for(const language of ['en','ar'])for(const theme of ['light','dark'])for(const width of [360,390,700]){
    await evaluate(`localStorage.setItem('stocrant.language',${JSON.stringify(language)});localStorage.setItem('stocrant-theme',${JSON.stringify(theme)})`);
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    for(const [path,selector] of routes){
      await navigate(path,selector);await viewport(width);
      assert.equal(await evaluate('document.documentElement.dir'),language==='ar'?'rtl':'ltr');
      assert.ok(await evaluate('Boolean(document.querySelector(".mobile-header-title strong").textContent)'));
      if(path==='/workspace')assert.equal(await evaluate('document.querySelector(".mobile-header-back")'),null);
      if(width===390){
        if(path==='/hr')await evaluate('document.querySelector(".hr-directory").scrollIntoView({block:"start"});scrollBy(0,-80)');
        await shot(`${language}-${theme}-${path.replaceAll('/','_')}`);
      }
      layouts++;
    }
    console.log(`Verified ${language}/${theme}/${width}: ${routes.length} workspaces`);
  }
  await evaluate('localStorage.setItem("stocrant.language","en");localStorage.setItem("stocrant-theme","light")');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/hr','.hr-directory-table');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".hr-directory-table tbody tr")).display'),'grid');
  assert.ok(await evaluate('document.querySelectorAll(".hr-directory-table th .hr-sort").length===4'));
  await click('.hr-directory-table th:first-child button');
  assert.equal(await evaluate('document.querySelector(".hr-directory-table th").getAttribute("aria-sort")'),'ascending');
  await fill('.hr-directory-search input','Demo Employee 2');
  await until('document.querySelectorAll(".hr-directory-table tbody tr").length===1');
  await click('.hr-directory-person');await until('location.pathname.startsWith("/hr/employees/")');
  await navigate('/workspace','.work-activity-dashboard');
  await click('.mobile-header-control');await until('document.querySelector("#mobile-account-menu").open');
  assert.ok(await evaluate('document.querySelector("#mobile-account-menu").contains(document.activeElement)'));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await until('!document.querySelector("#mobile-account-menu").open');
  await click('.mobile-header-control');await until('document.querySelector("#mobile-account-menu").open');
  await click('#mobile-account-menu a[href="/finance"]');
  await until('Boolean(document.querySelector(".finance-page"))&&!document.querySelector("#mobile-account-menu").open');
  assert.equal(await evaluate('document.querySelector(".mobile-bottom-nav a.active").getAttribute("href")'),'/finance');
  await navigate('/mobile-more','.mobile-services-grid');await click('.mobile-more-page button.primary');
  await until('Boolean(document.querySelector(".profile-dialog[open]"))');
  assert.ok(await evaluate('document.querySelector(".profile-dialog").getBoundingClientRect().width<=innerWidth'));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await until('!document.querySelector(".profile-dialog[open]")');
  // Native tablet mode uses the same mobile component tree at a wider viewport.
  await navigate('/hr','.hr-directory-table');
  await evaluate('window.Capacitor.isNativePlatform=()=>true;document.documentElement.setAttribute("data-native","true")');
  await send('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:true});
  await until('Boolean(document.querySelector(".mobile-layout"))');await viewport(1024);await shot('native-tablet-hr');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  await navigate('/hr','.hr-directory-table');await viewport(1366);
  assert.equal(await evaluate('document.querySelector(".mobile-layout")'),null);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".hr-directory-table tbody tr")).display'),'table-row');
  await shot('desktop-hr');
  await setCookie(employeeCookie);await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/mobile-more','.mobile-services-grid');await viewport(390);
  assert.equal(await evaluate('document.querySelectorAll(".mobile-bottom-nav a").length'),4);
  assert.ok(await evaluate(`Boolean(document.querySelector('.mobile-bottom-nav a[href="/me/attendance"]'))&&Boolean(document.querySelector('.mobile-bottom-nav a[href="/me/leave"]'))`));
  assert.equal(await evaluate(`document.querySelector('.mobile-services-grid a[href="/finance"]')`),null);
  await shot('employee-more');
  writeFileSync(join(output,'result.json'),JSON.stringify({layouts,workflowChecks:'passed',desktop:'passed',nativeTabletLayout:'passed',employeeNavigation:'passed',at:new Date().toISOString()},null,2)+'\n');
  console.log(`Mobile layout checks passed: ${layouts} EN/AR light/dark phone layouts, employee cards/sort/search/profile, drawer focus/Escape/navigation, native tablet layout, desktop table and employee permissions.`);
}finally{
  await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));
  assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&root.includes('stocrant-test-data-mobile-layout-'));
  rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:250});
}
