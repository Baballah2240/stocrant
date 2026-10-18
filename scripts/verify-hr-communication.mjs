import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { browserQa } from "./browser-qa.mjs";
const root=mkdtempSync(join(tmpdir(),"stocrant-test-data-hr-communication-browser-"));
process.env.STOCRANT_DATA_DIR=root; process.env.NODE_ENV="development";
const {createApp}=await import("../dist/app.js");
const server=createApp().listen(0,"127.0.0.1"); await new Promise(resolve=>server.once("listening",resolve));
const base=`http://127.0.0.1:${server.address().port}`, password=randomBytes(24).toString("hex"), employeePassword=randomBytes(24).toString("hex");
let browser, cookie;
async function req(path,method="GET",body) { const response=await fetch(base+"/api"+path,{method,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return {response,result}; }
try {
  const setup=await req("/auth/setup","POST",{name:"HR Browser Owner",email:"hr-browser-owner@example.test",password,setupKey:"local-setup"}); cookie=setup.response.headers.get("set-cookie").split(";")[0];
  const employee=(await req("/collections/employees","POST",{employeeCode:"HR-BROWSER",name:"Browser Employee",email:"hr-browser-employee@example.test",organizationId:"company-primary",employmentType:"full-time",status:"active",hireDate:"2026-10-01",department:"Operations",jobTitle:"Associate"})).result.item;
  browser=await browserQa(root);const {send,evaluate,until}=browser;
  await send("Network.enable");
  async function setCookie(value) { await send("Network.setCookie",{name:"stocrant_session",value:value.slice(value.indexOf("=")+1),url:base,path:"/"}); }
  await setCookie(cookie);
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  async function fill(selector,value) {await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw Error("Missing form input");Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),"value").set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==="SELECT"?"change":"input",{bubbles:true}));})()`);}
  async function navigate(path,unlockPassword=password) {await send("Page.navigate",{url:base+path});await until('Boolean(document.querySelector(".app-lock-screen input[type=password]"))');await fill('.app-lock-screen input',unlockPassword);await evaluate('document.querySelector(".app-lock-screen form").requestSubmit()');await until('Boolean(document.querySelector(".topbar"))');}
  async function clickText(label) {await evaluate(`(()=>{const button=Array.from(document.querySelectorAll("button")).find(item=>item.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error("Button missing");button.click();})()`);}
  await navigate(`/hr/communication?employee=${employee.id}`);
  await until('document.querySelector(".hr-communication table")?.textContent.includes("Browser Employee")');
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".hr-communication tbody tr")).find(row=>row.textContent.includes("Browser Employee")).querySelector("input[type=checkbox]").checked'),true);
  assert.ok(await evaluate('document.querySelector(".hr-communication table").textContent.includes("invited")'));
  await clickText("Create activation invitation");await until('Boolean(document.querySelector(".hr-communication .alert input"))');
  const invitation=await evaluate('document.querySelector(".hr-communication .alert input").value');assert.ok(invitation.includes("#activate="));
  await fill('.hr-communication form input[maxlength="160"]',"Browser shift update");await fill('.hr-communication form textarea',"Please join the briefing before your shift.");
  await fill('.hr-communication form select',"Urgent Shift Change");
  await evaluate('(()=>{const select=document.querySelectorAll(".hr-communication form select")[1];Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,"Urgent");select.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await fill('.hr-communication form input[type=url]',"https://meet.google.com/abc-defg-hij");
  await evaluate('document.querySelector(".hr-communication form input[type=checkbox]").click()');
  await evaluate('document.querySelector(".hr-communication form").requestSubmit()');await until('Boolean(document.querySelector(".hr-message-preview"))');
  assert.ok(await evaluate('document.querySelector(".hr-message-preview").textContent.includes("Browser Employee")'));
  await clickText("Confirm & send");await until('document.querySelector(".hr-message-history")?.textContent.includes("Browser shift update")');
  assert.equal((await req("/workspace/hr/communication/messages")).result.items[0].recipients[0].status,"sent");
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('localStorage.setItem("stocrant.language","ar");localStorage.setItem("stocrant-theme","dark")');
  await navigate(`/hr/communication?employee=${employee.id}`);await until('document.documentElement.dir==="rtl" && document.querySelector(".hr-communication h1")?.textContent==="حسابات الموظفين والإشعارات"');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),"HR communication must fit a mobile viewport");
  if(process.env.STOCRANT_QA_SCREENSHOTS==="1"){const dir=resolve(".local-preview/qa");mkdirSync(dir,{recursive:true});writeFileSync(join(dir,"hr-communication-arabic.png"),Buffer.from((await send("Page.captureScreenshot",{format:"png"})).data,"base64"));}
  await send("Page.navigate",{url:invitation});await until('Boolean(document.querySelector(".auth-card input[type=email]"))');
  assert.equal(await evaluate('location.hash'),"","Invitation token must be removed from the address bar");
  await fill('.auth-card input[type=email]',"hr-browser-employee@example.test");await fill('.auth-card input[type=password]',employeePassword);
  await evaluate(`(()=>{const input=document.querySelectorAll(".auth-card input[type=password]")[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,${JSON.stringify(employeePassword)});input.dispatchEvent(new Event("input",{bubbles:true}));})()`);
  await evaluate('document.querySelector(".auth-card form")?.requestSubmit() || document.querySelector("form.auth-card").requestSubmit()');await until('Boolean(document.querySelector(".auth-card a"))');
  const login=await req("/auth/login","POST",{email:"hr-browser-employee@example.test",password:employeePassword});cookie=login.response.headers.get("set-cookie").split(";")[0];await setCookie(cookie);
  await navigate("/notifications",employeePassword);await until('Boolean(document.querySelector(".hr-urgent-banner")) && document.querySelector(".hr-inbox")?.textContent.includes("Browser shift update")');
  const link=await evaluate('document.querySelector(".hr-inbox a").getAttribute("rel")');assert.ok(link.includes("noopener"));
  await evaluate('document.querySelector(".hr-inbox article button").click()');
  await until('!document.querySelector(".hr-inbox article section button")');
  const history=(await req("/notifications")).result.items;assert.ok(history[0].acknowledgedAt);assert.ok(history[0].readAt);assert.ok(history[0].deliveredAt);
  console.log("HR communication browser checks passed: account status, employee selection, private invitation, preview/send, retained tracking, Arabic mobile dark layout, password activation, urgent banner, safe meeting link and acknowledgment.");
} finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&root.includes("stocrant-test-data-hr-communication-browser-"));try{rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:250});}catch{console.warn("Temporary browser profile remains locked; business data was not affected.");}}
