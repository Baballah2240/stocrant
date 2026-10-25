import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {browserQa} from './browser-qa.mjs';
const root=mkdtempSync(join(tmpdir(),'stocrant-test-data-approval-rules-'));process.env.STOCRANT_DATA_DIR=root;process.env.NODE_ENV='development';
const {createApp}=await import('../dist/app.js');const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`,password=randomBytes(24).toString('hex');let browser,cookie='';
async function req(path,method='GET',body){const response=await fetch(base+'/api'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return {data,response};}
try{
  const setup=await req('/auth/setup','POST',{name:'Rules Main Admin',email:'rules@browser.test',password,setupKey:'local-setup'});cookie=setup.response.headers.get('set-cookie').split(';')[0];
  browser=await browserQa(root);const {send,evaluate,until}=browser;
  async function fill(selector,value){await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);}
  async function navigate(){await send('Page.navigate',{url:base+'/admin?tab=Approval%20rules'});await until('Boolean(document.querySelector(".app-lock-screen input"))');await fill('.app-lock-screen input',password);await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');await until('Boolean(document.querySelector(".approval-rule-management form"))');}
  await send('Network.enable');await send('Network.setCookie',{name:'stocrant_session',value:cookie.split('=').slice(1).join('='),url:base,path:'/'});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await navigate();
  await fill('.approval-rule-management form label:nth-child(1) select','customerService');await fill('.approval-rule-management form label:nth-child(2) select','delete');await evaluate('document.querySelector(".approval-rule-management form").requestSubmit()');
  await until('Array.from(document.querySelectorAll(".approval-rule-management .approval-row")).some(row=>row.textContent.includes("Customer Service"))');
  const created=(await req('/workspace/access/approval-rules')).data.items.find(rule=>rule.section==='customerService'&&rule.action==='delete');assert.ok(created.active);
  await evaluate('Array.from(document.querySelectorAll(".approval-rule-management .approval-row")).find(row=>row.textContent.includes("Customer Service")).querySelector("button").click()');
  await until('document.querySelector(".approval-rule-management h3")?.textContent==="Edit approval rule"');await fill('.approval-rule-management form label:nth-child(1) select','finance');await fill('.approval-rule-management form label:nth-child(2) select','edit');await evaluate('document.querySelector(".approval-rule-management form input[type=checkbox]").click();document.querySelector(".approval-rule-management form").requestSubmit()');
  await until('document.querySelector(".approval-rule-management h3")?.textContent==="Create approval rule"');const updated=(await req('/workspace/access/approval-rules')).data.items.find(rule=>rule.id===created.id);assert.equal(updated.section,'finance');assert.equal(updated.action,'edit');assert.equal(updated.active,false);
  const shots=resolve('.local-preview/qa/approval-rules');mkdirSync(shots,{recursive:true});
  for(const [language,theme,width] of [['en','light',1440],['ar','dark',390]]){
    await evaluate(`localStorage.setItem('stocrant.language',${JSON.stringify(language)});localStorage.setItem('stocrant-theme',${JSON.stringify(theme)})`);await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<700});await navigate();assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));writeFileSync(join(shots,`${language}-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  console.log('Approval rules browser checks passed: Main Admin creates a rule, edits its section/action/status, retains its ID, persists changes and fits English desktop/Arabic mobile.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true,force:true});}
