import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {browserQa} from './browser-helper.mjs';
// Faslii phase 2: teacher requests with attachments and the school resources library, both sides.
const directory=mkdtempSync(join(tmpdir(),'school-teacher-requests-')),app=await startServer({directory,port:0,updateEnv:{}}),shots=resolve('.qa/teacher-requests');mkdirSync(shots,{recursive:true});let browser,cookie='';const password=randomBytes(24).toString('hex');
async function request(path,body,method='POST'){const r=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:app.origin,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(r.ok,await r.clone().text());return {data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const store=()=>app.store.get(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(test,message)=>{for(let i=0;i<100;i++){if(test())return;await wait(100);}assert.fail(message);};
const lesson=(id,classId,day)=>({id,classId,day,type:'lesson',start:'00:00',end:'23:59',subjectEn:'Science',subjectAr:'العلوم',teacherEn:'Sara Ali',teacherAr:'',room:'Lab 2',teacherImage:''});
const note=join(directory,'doctor-note.pdf'),policy1=join(directory,'behaviour-policy.pdf'),policy2=join(directory,'behaviour-policy-v2.pdf');
writeFileSync(note,'%PDF-1.4\n% note\n%%EOF');writeFileSync(policy1,'%PDF-1.4\n% policy v1\n%%EOF');writeFileSync(policy2,'%PDF-1.4\n% policy v2\n%%EOF');
try{
 await request('setup',{name:'Owner',email:'owner@school.test',password});cookie=(await request('login',{email:'owner@school.test',password})).cookie;
 const a=(await request('classes',{nameEn:'Grade 6A',nameAr:'السادس أ'})).data.group;
 await request('draft',{schedule:[0,1,2,3,4,5,6].map(day=>lesson('a'+day,a.id,day))},'PUT');await request('publish',{});
 await request('users',{name:'Sara',email:'sara@school.test',password,role:'teacher',classIds:[a.id],teacherName:'Sara Ali'});

 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');await send('Network.enable');await send('DOM.enable');
 const shot=async name=>writeFileSync(join(shots,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const fill=(selector,value)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const attach=async(selector,path)=>{const {root}=await send('DOM.getDocument',{depth:-1});const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector});await send('DOM.setFileInputFiles',{nodeId,files:[path]});};
 const noOverflow=()=>evaluate('document.documentElement.scrollWidth<=innerWidth+1');
 const refresh=()=>evaluate('document.dispatchEvent(new Event("visibilitychange"))');
 const phone=()=>send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 // Downloads are recorded instead of saved so the test can read what was opened.
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__cspErrors=[];document.addEventListener('securitypolicyviolation',e=>window.__cspErrors.push(e.violatedDirective+' '+e.blockedURI));window.__opened=[];const create=URL.createObjectURL;URL.createObjectURL=blob=>{blob.text().then(text=>window.__opened.push(text));return create(blob);};HTMLAnchorElement.prototype.click=function(){window.__lastDownload=this.download;};"});
 await phone();await send('Page.navigate',{url:app.origin+'/teacher'});await until('Boolean(document.querySelector("#login-form"))');
 await fill('#login-form [name=email]','sara@school.test');await fill('#login-form [name=password]',password);await evaluate('document.querySelector("#login-form").requestSubmit()');await until('Boolean(document.querySelector(".hero"))');

 // Quick access → new request with an attachment.
 assert.ok(await evaluate('Boolean(document.querySelector(".quick [data-tab=requests]"))&&Boolean(document.querySelector(".quick [data-tab=resources]"))'));await shot('today-quick');
 await click('.quick [data-tab=requests]');await until('Boolean(document.querySelector("[data-tab=request-new]"))');await click('[data-tab=request-new]');await until('Boolean(document.querySelector("#request-form"))');
 await fill('#request-form [name=type]','leave');await fill('#request-form [name=title]','Medical appointment');await fill('#request-form [name=from]','2026-12-01');await fill('#request-form [name=details]','Hospital visit in the morning');
 await attach('#request-form [name=files]',note);await shot('request-form');
 await evaluate('document.querySelector("#request-form").requestSubmit()');await waitFor(()=>store().teacherRequests?.length===1,'The request reaches the school.');
 const leave=store().teacherRequests[0];assert.equal(leave.type,'leave');assert.equal(leave.attachments.length,1);assert.equal(leave.to,'2026-12-01');
 await until('Boolean(document.querySelector("[data-request]"))');assert.ok(await evaluate('document.body.textContent.includes("Pending")'));

 // A request without attachments is queued while offline and sent once when back online.
 await send('Network.setBlockedURLs',{urls:['*/api/mobile/*']});
 await click('[data-tab=request-new]');await until('Boolean(document.querySelector("#request-form"))');await fill('#request-form [name=type]','maintenance');await fill('#request-form [name=title]','Projector is flickering');await evaluate('document.querySelector("#request-form").requestSubmit()');
 await until('document.body.textContent.includes("Waiting to send")');await shot('request-offline');
 await send('Network.setBlockedURLs',{urls:[]});await refresh();await waitFor(()=>store().teacherRequests.length===2,'The queued request is delivered.');
 await refresh();await wait(400);assert.equal(store().teacherRequests.filter(r=>r.title==='Projector is flickering').length,1,'Delivered exactly once.');

 // The teacher opens the request and downloads the attachment.
 await click(`[data-request="${leave.id}"]`);await until('Boolean(document.querySelector("#request-comment-form"))');
 await click('[data-file]');await until('window.__opened.length>0');assert.ok(await evaluate('window.__opened.at(-1).includes("% note")'));
 await fill('#request-comment-form textarea','I can be back by noon');await evaluate('document.querySelector("#request-comment-form").requestSubmit()');await waitFor(()=>store().teacherRequests.find(r=>r.id===leave.id).comments.length===1,'The comment is sent.');

 // Manager: answer the request and upload a policy in the control panel.
 await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("[data-tab=calendar]"))');await click('[data-tab=calendar]');
 await until('Boolean(document.querySelector(`#requests-panel .request-decide`))');assert.ok(await evaluate('document.querySelector("#requests-panel").textContent.includes("I can be back by noon")'));
 await fill(`.request-decide[data-request="${leave.id}"] textarea`,'Approved. Get well soon.');await evaluate(`(()=>{const f=document.querySelector('.request-decide[data-request="${leave.id}"]');f.requestSubmit(f.querySelector('[value=approved]'));})()`);
 await waitFor(()=>store().teacherRequests.find(r=>r.id===leave.id).status==='approved','The decision is saved.');
 await until('Boolean(document.querySelector("#resource-form"))');await fill('#resource-form [name=title]','Behaviour policy');await fill('#resource-form [name=description]','Rules for classrooms and phones');await fill('#resource-form [name=category]','policy');
 await evaluate('document.querySelector("#resource-form [name=important]").checked=true');await attach('#resource-form [name=file]',policy1);await evaluate('document.querySelector("#resource-form").requestSubmit()');
 await waitFor(()=>store().resources?.length===1,'The document is uploaded.');await until('Boolean(document.querySelector("[data-edit-resource]"))');await shot('control-requests-resources');

 // Teacher: answer appears with feedback and a notification; resources search, bookmark, open, offline copy.
 await send('Network.deleteCookies',{name:'school_session',url:app.origin});await phone();await send('Page.navigate',{url:app.origin+'/teacher'});await until('Boolean(document.querySelector(".hero"))');
 await click('[data-tab=alerts]');await until('document.body.textContent.includes("Request answered")');
 await click('[data-tab=today]');await click('.quick [data-tab=requests]');await click(`[data-request="${leave.id}"]`);await until('document.body.textContent.includes("Get well soon")');assert.ok(await evaluate('document.body.textContent.includes("Approved")'));await shot('request-approved');
 await click('[data-tab=today]');await click('.quick [data-tab=resources]');await until('Boolean(document.querySelector("#resource-search"))');
 await fill('#resource-search','phones');await until('document.querySelector("#resource-list").textContent.includes("Behaviour policy")');
 await fill('#resource-search','zzz');await until('document.querySelector("#resource-list").textContent.includes("No documents match.")');await fill('#resource-search','');
 await until('Boolean(document.querySelector("[data-bookmark]"))');await click('[data-bookmark]');await until('document.querySelector("[data-bookmark]").classList.contains("on")');
 await evaluate('(()=>{const n=document.querySelector("#bookmarked-only");n.checked=true;n.dispatchEvent(new Event("change",{bubbles:true}));})()');await until('document.querySelectorAll(".resource").length===1');
 await click('[data-save-file]');await until('document.body.textContent.includes("Saved on this phone")');await shot('resources');
 await send('Network.setBlockedURLs',{urls:['*/api/mobile/*']});const before=await evaluate('window.__opened.length');
 await click('.resource [data-file]');await until(`window.__opened.length>${before}`);assert.ok(await evaluate('window.__opened.at(-1).includes("policy v1")'),'A saved document opens offline.');
 await send('Network.setBlockedURLs',{urls:[]});

 // A revision of an important document is announced and explained.
 await click('[data-tab=today]');
 const id=store().resources[0].id;await request('resources',{id,title:'Behaviour policy',category:'policy',audience:'all',important:true,changeNote:'Phones must stay in lockers',file:{name:'behaviour-policy.pdf',data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4\n% policy v2\n%%EOF').toString('base64')}});
 await refresh();await until('document.querySelector(".quick [data-tab=resources]").textContent.includes("1")');
 await click('[data-tab=alerts]');await until('document.body.textContent.includes("Document updated")');
 await click('[data-tab=today]');await click('.quick [data-tab=resources]');await until('document.body.textContent.includes("Phones must stay in lockers")');
 await evaluate('(()=>{const n=document.querySelector("#bookmarked-only");if(n.checked){n.checked=false;n.dispatchEvent(new Event("change",{bubbles:true}));}})()');
 await evaluate('(()=>{const n=document.querySelector("#resource-search");})()');
 // Arabic layout at phone width.
 await click('[data-tab=settings]');await fill('#language','ar');await until('document.documentElement.dir==="rtl"');
 for(const view of ['requests','resources']){await click('[data-tab=today]');await click(`.quick [data-tab=${view}]`);await wait(250);assert.ok(await noOverflow(),view+' fits in Arabic.');await shot(view+'-arabic');}
 assert.deepEqual(await evaluate('window.__cspErrors'),[],'Works under the page security policy.');
 console.log('Teacher requests checks passed: quick access, request with attachment, offline queue, comments, attachment download, manager decision and feedback, resource upload, search, bookmarks, offline copy, revision notice and Arabic layout.');
}catch(error){if(browser)console.log(await browser.evaluate('document.body.innerText').catch(()=>''));throw error;}finally{await browser?.close();await app.close();}
