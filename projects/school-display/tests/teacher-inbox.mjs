import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {browserQa} from './browser-helper.mjs';
// Faslii phase 1: tabs, notifications feed, change notices, threads, acknowledgements,
// offline outbox, preferences, theme and Arabic layout, plus the manager delivery report.
const directory=mkdtempSync(join(tmpdir(),'school-teacher-inbox-')),app=await startServer({directory,port:0,updateEnv:{}}),shots=resolve('.qa/teacher-inbox');mkdirSync(shots,{recursive:true});let browser,cookie='';const password=randomBytes(24).toString('hex');
async function request(path,body,method='POST'){const r=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:app.origin,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(r.ok,await r.clone().text());return {data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
// Lessons cover the whole day so a "current lesson" exists whenever the test runs.
const lesson=(id,classId,day,room)=>({id,classId,day,type:'lesson',start:'00:00',end:'23:59',subjectEn:'Science',subjectAr:'العلوم',teacherEn:'Sara Ali',teacherAr:'',room,teacherImage:''});
const store=()=>app.store.get();
try{
 await request('setup',{name:'Owner',email:'owner@school.test',password});cookie=(await request('login',{email:'owner@school.test',password})).cookie;
 const a=(await request('classes',{nameEn:'Grade 6A',nameAr:'السادس أ'})).data.group;
 await request('draft',{schedule:[0,1,2,3,4,5,6].map(day=>lesson('a'+day,a.id,day,'Lab 2'))},'PUT');await request('publish',{});
 await request('users',{name:'Sara',email:'sara@school.test',password,role:'teacher',classIds:[a.id],teacherName:'Sara Ali'});
 const saraId=store().users.find(row=>row.email==='sara@school.test').id;
 await request('teacher-messages',{userIds:[saraId],subject:'Exam duty',text:'Collect the exam papers at 9',category:'meeting',priority:'important',requireAck:true});
 await request('draft',{schedule:[0,1,2,3,4,5,6].map(day=>lesson('a'+day,a.id,day,'Lab 5'))},'PUT');await request('publish',{});
 assert.ok(store().scheduleNotices.length>0,'Publishing the room change creates notices.');

 browser=await browserQa(directory);const {send,evaluate,until}=browser;await send('Page.enable');await send('Network.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
 const shot=async name=>writeFileSync(join(shots,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const fill=(selector,value)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const noOverflow=()=>evaluate('document.documentElement.scrollWidth<=innerWidth+1');
 const refresh=()=>evaluate('document.dispatchEvent(new Event("visibilitychange"))');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__cspErrors=[];document.addEventListener('securitypolicyviolation',event=>window.__cspErrors.push(event.violatedDirective+' '+event.blockedURI));"});
 await send('Page.navigate',{url:app.origin+'/teacher'});await until('Boolean(document.querySelector("#login-form"))');
 await fill('#login-form [name=email]','sara@school.test');await fill('#login-form [name=password]',password);await evaluate('document.querySelector("#login-form").requestSubmit()');await until('Boolean(document.querySelector(".hero"))');

 // Today: four tabs, view switch, current lesson, room-change tag and the pending-changes card.
 assert.deepEqual(await evaluate('[...document.querySelectorAll(".tabs button")].map(b=>b.dataset.tab)'),['today','alerts','messages','settings']);
 assert.deepEqual(await evaluate('[...document.querySelectorAll(".segmented-nav button")].map(b=>b.dataset.tab)'),['today','week','month','class']);
 assert.ok(await evaluate('document.querySelector(".hero h1").textContent.includes("Science")'));
 assert.ok(await evaluate('document.body.textContent.includes("Room changed: Lab 2 → Lab 5")'),'Room changes are tagged on the lesson.');
 assert.ok(await evaluate('Boolean(document.querySelector("[data-open-notice]"))'));assert.ok(await noOverflow());await shot('today');
 await click('[data-tab=month]');await until('document.querySelectorAll(".month [data-month-day]").length===35');assert.ok(await evaluate('Boolean(document.querySelector(".month .has-change"))'));assert.ok(await noOverflow());await shot('month');
 await click('[data-month-day="3"]');await until('document.querySelector("[data-select-day=\\"3\\"]")?.classList.contains("selected")');
 await click('[data-week-shift="7"]');await until('Boolean(document.querySelector("[data-select-day=\\"7\\"]"))');assert.equal(await evaluate('document.querySelectorAll(".day-strip button").length'),7);

 // Notifications: filter, open a change, see before/after, acknowledge and report a conflict.
 await click('[data-tab=alerts]');await until('document.querySelectorAll(".feed-item").length>=2');
 await click('[data-filter-category=change]');await until('[...document.querySelectorAll(".feed-item")].every(n=>n.classList.contains("cat-change"))');
 await click('[data-filter-category=meeting]');await until('document.querySelectorAll(".feed-item").length===1&&document.body.textContent.includes("Exam duty")');
 await click('[data-filter-category=change]');await until('Boolean(document.querySelector(".feed-item.cat-change"))');
 await click('.feed-item.cat-change .feed-open');await until('Boolean(document.querySelector(".compare"))');
 assert.ok(await evaluate('document.querySelector(".compare").textContent.includes("Lab 2")&&document.querySelector(".compare").textContent.includes("Lab 5")'));await shot('change-detail');
 const noticeId=await evaluate('document.querySelector("[data-ack-notice]").dataset.ackNotice');
 await click('[data-ack-notice]');await until(`Boolean(${JSON.stringify(noticeId)})&&document.body.textContent.includes("Acknowledged")`);
 await new Promise(r=>setTimeout(r,600));for(let i=0;i<50&&!store().scheduleNotices.find(n=>n.id===noticeId)?.ackAt;i++)await new Promise(r=>setTimeout(r,100));
 assert.ok(store().scheduleNotices.find(n=>n.id===noticeId).ackAt,'The acknowledgement reached the server.');
 await click('[data-conflict]');await until('Boolean(document.querySelector("#conflict-form"))');await fill('#conflict-form textarea','Lab 5 is booked for exams');await evaluate('document.querySelector("#conflict-form").requestSubmit()');
 for(let i=0;i<50&&!store().scheduleNotices.find(n=>n.id===noticeId)?.conflict;i++)await new Promise(r=>setTimeout(r,100));
 assert.equal(store().scheduleNotices.find(n=>n.id===noticeId).conflict.text,'Lab 5 is booked for exams');

 // Messages: thread view, Acknowledged button, reply.
 await click('[data-tab=messages]');await until('Boolean(document.querySelector("[data-thread]"))');assert.ok(await evaluate('document.body.textContent.includes("Needs acknowledgement")'));
 const examThread=store().teacherMessages.find(m=>m.subject==='Exam duty').threadId;await click('[data-thread="'+examThread+'"]');await until('Boolean(document.querySelector(".bubble"))');await shot('thread');
 const messageId=store().teacherMessages.find(m=>m.subject==='Exam duty').id;
 assert.ok(store().teacherMessages.find(m=>m.id===messageId).readAt,'Opening the thread records it as read.');
 await click('[data-ack]');for(let i=0;i<50&&!store().teacherMessages.find(m=>m.id===messageId).ackAt;i++)await new Promise(r=>setTimeout(r,100));
 assert.ok(store().teacherMessages.find(m=>m.id===messageId).ackAt,'Acknowledged reaches the server.');

 // Offline: the reply waits in the outbox with a visible state, then sends once, when the connection returns.
 await send('Network.setBlockedURLs',{urls:['*/api/mobile/*']});
 await fill('#reply-form textarea','I will be there at 9');await evaluate('document.querySelector("#reply-form").requestSubmit()');
 await until('document.body.textContent.includes("Waiting to send")');await shot('reply-pending');
 assert.equal(store().teacherMessages.filter(m=>m.direction==='up'&&m.text==='I will be there at 9').length,0);
 await send('Network.setBlockedURLs',{urls:[]});await refresh();
 for(let i=0;i<80&&!store().teacherMessages.some(m=>m.text==='I will be there at 9');i++)await new Promise(r=>setTimeout(r,100));
 await refresh();await until('!document.body.textContent.includes("Waiting to send")');
 assert.equal(store().teacherMessages.filter(m=>m.text==='I will be there at 9').length,1,'The queued reply is delivered exactly once.');
 const threadId=store().teacherMessages.find(m=>m.id===messageId).threadId;
 await request('teacher-messages/reply',{threadId,text:'Thanks, see you there'});await refresh();await until('document.body.textContent.includes("Thanks, see you there")');

 // Profile: preferences reach the server; theme and Arabic layout.
 await click('[data-tab=settings]');await until('Boolean(document.querySelector("[data-pref=quietEnabled]"))');
 assert.equal(await evaluate('document.querySelector("[data-pref=hidePreview]").checked'),true,'Lock-screen previews are hidden by default.');
 assert.ok(await evaluate('document.body.textContent.includes("Science")'),'Subjects are listed.');
 await evaluate('(()=>{const n=document.querySelector("[data-pref=quietEnabled]");n.checked=true;n.dispatchEvent(new Event("change",{bubbles:true}));})()');
 for(let i=0;i<50&&!store().users.find(u=>u.id===saraId).preferences?.quietEnabled;i++)await new Promise(r=>setTimeout(r,100));
 assert.equal(store().users.find(u=>u.id===saraId).preferences.quietEnabled,true);
 await fill('#theme','dark');await until('document.documentElement.dataset.theme==="dark"');await shot('profile-dark');
 await fill('#language','ar');await until('document.documentElement.dir==="rtl"');assert.ok(await noOverflow());await shot('profile-arabic-dark');
 for(const tabName of ['today','alerts','messages']){await click(`[data-tab=${tabName}]`);await new Promise(r=>setTimeout(r,250));assert.ok(await noOverflow(),tabName+' fits the phone in Arabic.');await shot(tabName+'-arabic-dark');}
 await click('[data-thread="'+examThread+'"]');await until('Boolean(document.querySelector(".bubble.mine"))');assert.ok(await noOverflow());await shot('thread-arabic-dark');
 await fill('#theme','light').catch(()=>{});
 assert.deepEqual(await evaluate('window.__cspErrors'),[],'The page works under the server security policy.');

 // Manager view: delivery, read and acknowledgement results and the reply thread.
 const report=(await request('teacher-messages')).data;const batch=report.batches.find(b=>b.subject==='Exam duty');
 assert.ok(batch.recipients[0].deliveredAt&&batch.recipients[0].readAt&&batch.recipients[0].ackAt);
 assert.ok(report.conversations.some(c=>c.messages.some(m=>m.text==='I will be there at 9')));
 await send('Network.setCookie',{name:'school_session',value:cookie.split('=')[1],url:app.origin,path:'/'});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:app.origin+'/control'});await until('Boolean(document.querySelector("[data-tab=calendar]"))');await click('[data-tab=calendar]');
 await until('Boolean(document.querySelector("#message-report .report-row"))');assert.ok(await evaluate('document.querySelector("#message-report").textContent.includes("Exam duty")'));assert.ok(await evaluate('Boolean(document.querySelector("#policy-form"))'));
 await evaluate('document.querySelectorAll("#message-report details").forEach(d=>d.open=true)');await shot('control-report');
 console.log('Teacher inbox checks passed: tabs and views, month calendar, filters, change before/after, acknowledgements, conflict report, threads, offline outbox, preferences, dark theme, Arabic RTL and the manager report.');
}catch(error){if(browser)console.log(await browser.evaluate('document.body.innerText').catch(()=>''));throw error;}finally{await browser?.close();await app.close();}
