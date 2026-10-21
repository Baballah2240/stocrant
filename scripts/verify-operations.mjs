import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join,resolve,sep } from "node:path";
import { browserQa } from "./browser-qa.mjs";
const root=mkdtempSync(join(tmpdir(),"stocrant-test-data-operations-browser-"));
process.env.STOCRANT_DATA_DIR=root;process.env.NODE_ENV="development";
const {createApp}=await import("../dist/app.js"),{getStore,saveStore}=await import("../dist/storage.js");
const server=createApp().listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
const base=`http://127.0.0.1:${server.address().port}`,password=randomBytes(24).toString("hex");let browser;
try{
 const setup=await fetch(base+"/api/auth/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Operations browser reviewer",email:"operations-browser@example.test",password,setupKey:"local-setup"})});assert.equal(setup.status,201);const cookie=setup.headers.get("set-cookie").split(";")[0],owner=(await setup.json()).user;
 getStore().collections.employees.push({id:"ops-browser-worker",employeeCode:"OPS-BROWSER-1",name:"Browser Worker",organizationId:"company-primary",status:"active",accountId:owner.id});getStore().collections.accessUsers.find(a=>a.id===owner.id).employeeId="ops-browser-worker";saveStore(getStore());
 browser=await browserQa(root);const {send,evaluate,until}=browser;await send("Network.enable");await send("Network.setCookie",{name:"stocrant_session",value:cookie.slice(cookie.indexOf("=")+1),url:base,path:"/"});
 async function fill(label,value){await evaluate(`(()=>{const scope=document.querySelector('.task-dialog[open]')||document;const field=[...scope.querySelectorAll('label')].find(l=>l.querySelector(':scope > span')?.textContent===${JSON.stringify(label)});const input=field?.querySelector('input,select,textarea');if(!input)throw Error('Missing field '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);}
 async function click(label){await evaluate(`(()=>{const scope=document.querySelector('.task-dialog[open]')||document;const button=[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Missing action '+${JSON.stringify(label)});button.click();})()`);}
 async function navigate(){await send("Page.navigate",{url:base+"/operations"});await until('Boolean(document.querySelector(".app-lock-screen input[type=password]"))');await evaluate(`(()=>{const input=document.querySelector('.app-lock-screen input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(password)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');await until('Boolean(document.querySelector(".task-metrics"))');}
 await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await navigate();
 await click("Create task");await until('Boolean(document.querySelector(".task-dialog[open]"))');await fill("Company","company-primary");await fill("Title","Browser workflow task");await fill("Employee","ops-browser-worker");await fill("Description","Complete a real task flow in isolated test data.");await click("Create task");await until('document.querySelector(".operations-page h1")?.textContent==="Browser workflow task"');
 await fill("Progress update","Inspection finished");await fill("Status","Completed");await until('document.querySelector(".task-status")?.textContent==="Completed"');
 await fill("Add comment","Evidence recorded in the task discussion");await click("Add comment");await until('document.querySelector(".task-comments")?.textContent.includes("Evidence recorded")');
 const task=getStore().collections.workItems.find(t=>t.title==="Browser workflow task");assert.equal(task.assignments[0].status,"Completed");assert.equal(getStore().collections.workItems.filter(t=>t.title==="Browser workflow task").length,1);
 for(const width of [1024,390]){await send("Emulation.setDeviceMetricsOverride",{width,height:1000,deviceScaleFactor:1,mobile:width<700});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),"Task detail overflow");}
 await evaluate('localStorage.setItem("stocrant.language","ar");localStorage.setItem("stocrant-theme","dark")');await navigate();await until('document.documentElement.dir==="rtl"');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),"Arabic task list overflow");
 console.log("Operations browser checks passed: create, individual assignment, automatic completion, discussion, single parent persistence, desktop/mobile and Arabic RTL.");
}finally{
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&root.includes("stocrant-test-data-operations-browser-"));
 try{rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:250});}catch{console.warn("Temporary browser profile remained locked; no business data was changed.");}
}
