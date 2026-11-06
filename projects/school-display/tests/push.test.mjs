import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {startServer} from '../server/server.mjs';
import {fcmSender,quietUntil} from '../server/push.mjs';

const lesson=(id,classId,day,room)=>({id,classId,day,type:'lesson',start:'08:00',end:'08:45',subjectEn:'Science',subjectAr:'',teacherEn:'Sara Ali',teacherAr:'',room,teacherImage:''});

test('push: queued per item, privacy, quiet hours, urgent policy, retries, dead tokens and report',async()=>{
 const sent=[];let mode='ok';
 const sender={send:async(token,message)=>{if(mode==='down')return {ok:false,retry:true,code:'UNAVAILABLE'};if(token==='dead-token-000000000000')return {ok:false,unregistered:true,code:'UNREGISTERED'};sent.push({token,...message});return {ok:true};}};
 const directory=mkdtempSync(join(tmpdir(),'school-push-')),app=await startServer({directory,port:0,pushSender:sender}),password=randomBytes(24).toString('hex');
 const api=async(path,{body,cookie='',bearer='',method}={})=>{const r=await fetch(app.origin+'/api/'+path,{method:method||(body===undefined?'GET':'POST'),headers:{Origin:bearer?'https://localhost':app.origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json().catch(()=>null),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
  await api('setup',{body:{name:'Owner',email:'owner@school.test',password}});const cookie=(await api('login',{body:{email:'owner@school.test',password}})).cookie;
  const a=(await api('classes',{body:{nameEn:'Class A',nameAr:''},cookie})).data.group;
  await api('draft',{body:{schedule:[0,1,2,3,4,5,6].map(d=>lesson('a'+d,a.id,d,'R1'))},cookie,method:'PUT'});await api('publish',{body:{},cookie});
  await api('users',{body:{name:'Sara',email:'sara@school.test',password,role:'teacher',classIds:[a.id],teacherName:'Sara Ali'},cookie});
  const sara=app.store.get().users.find(u=>u.email==='sara@school.test');
  const token=(await api('mobile/login',{body:{email:'sara@school.test',password},bearer:'x'})).data.token;
  assert.equal((await api('mobile/push-token',{body:{token:'bad'},bearer:token})).status,400);
  const phone='phone-token-aaaaaaaaaaaaaaaaaaaa';
  assert.equal((await api('mobile/push-token',{body:{token:phone,deviceId:'d1'},bearer:token})).data.enabled,true);
  assert.equal((await api('mobile/push-token',{body:{token:phone,deviceId:'d1'},bearer:token})).status,200);assert.equal(app.store.get().pushTokens.length,1,'Re-registering the same phone keeps one token.');

  // A message is pushed once; the lock-screen text is hidden by default.
  await api('teacher-messages',{body:{userIds:[sara.id],subject:'Exam duty',text:'Secret details',category:'meeting',priority:'important'},cookie});
  await app.pushNow();assert.equal(sent.length,1);assert.equal(sent[0].title,'Meeting invitation');assert.equal(sent[0].body,'Open Faslii to read it.');assert.equal(sent[0].data.tab,'thread');
  await app.pushNow();assert.equal(sent.length,1,'A sent job is never repeated.');
  let report=(await api('teacher-messages',{cookie})).data;assert.equal(report.channels.push,true);assert.equal(report.batches[0].recipients[0].push,'sent');

  // Preview allowed → the text is shown. Category turned off → skipped.
  await api('mobile/preferences',{body:{hidePreview:false,categories:{event:false}},bearer:token});
  await api('teacher-messages',{body:{userIds:[sara.id],text:'Bring the projector',category:'message'},cookie});await api('teacher-messages',{body:{userIds:[sara.id],text:'Sports day',category:'event'},cookie});
  await app.pushNow();assert.equal(sent.at(-1).body,'Bring the projector');assert.ok(!sent.some(m=>m.body==='Sports day'));
  assert.equal(app.store.get().pushJobs.find(j=>j.text==='Sports day').status,'skipped');

  // Quiet hours hold normal messages; urgent alerts follow the administrator policy.
  const qatar=offset=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Qatar',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(Date.now()+offset));
  await api('mobile/preferences',{body:{quietEnabled:true,quietStart:qatar(-3600000),quietEnd:qatar(3600000)},bearer:token});
  const before=sent.length;await api('teacher-messages',{body:{userIds:[sara.id],text:'Tomorrow plan',category:'message'},cookie});await api('teacher-messages',{body:{userIds:[sara.id],text:'Evacuate now',category:'urgent'},cookie});
  await app.pushNow();assert.equal(sent.length,before+1);assert.equal(sent.at(-1).body,'Evacuate now');assert.equal(app.store.get().pushJobs.find(j=>j.text==='Tomorrow plan').status,'held');
  await api('message-policy',{body:{urgentBypassQuiet:false},cookie,method:'PUT'});await api('teacher-messages',{body:{userIds:[sara.id],text:'Second alarm',category:'urgent'},cookie});
  await app.pushNow();assert.equal(app.store.get().pushJobs.find(j=>j.text==='Second alarm').status,'held','Without the exception, quiet hours apply to urgent alerts too.');
  await api('mobile/preferences',{body:{quietEnabled:false},bearer:token});

  // Temporary Firebase errors are retried with backoff; then delivered.
  mode='down';await api('teacher-messages',{body:{userIds:[sara.id],text:'Retry me',category:'message'},cookie});await app.pushNow();
  const job=app.store.get().pushJobs.find(j=>j.text==='Retry me');assert.equal(job.status,'retry');assert.ok(job.nextAt>Date.now());
  mode='ok';job.nextAt=Date.now();await app.pushNow();assert.equal(app.store.get().pushJobs.find(j=>j.text==='Retry me').status,'sent');

  // Timetable changes: one push per teacher per publication, not per date.
  const count=sent.length;await api('draft',{body:{schedule:[0,1,2,3,4,5,6].map(d=>lesson('a'+d,a.id,d,'Lab 5'))},cookie,method:'PUT'});await api('publish',{body:{},cookie});await app.pushNow();
  assert.equal(sent.length,count+1);assert.equal(sent.at(-1).title,'Timetable change');assert.match(sent.at(-1).body,/changes to your timetable/);

  // Request answers are pushed; dead tokens are removed.
  await api('mobile/push-token',{body:{token:'dead-token-000000000000',deviceId:'d2'},bearer:token});
  const id=(await api('mobile/requests',{body:{type:'technical',title:'Wi-Fi is down',clientId:'req-wifi-0001'},bearer:token})).data.id;
  await api('teacher-requests/decide',{body:{id,status:'completed'},cookie});await app.pushNow();
  assert.equal(sent.at(-1).title,'Request answered');assert.ok(!app.store.get().pushTokens.some(t=>t.token==='dead-token-000000000000'),'Unregistered tokens are dropped.');

  // Signing out removes this phone's token.
  await api('mobile/logout',{body:{pushToken:phone},bearer:token});assert.equal(app.store.get().pushTokens.length,0);
 }finally{await app.close();}
});

test('push: quiet window maths and the real FCM request format',async()=>{
 const prefs={quietEnabled:true,quietStart:'21:00',quietEnd:'06:30'};
 const at=iso=>Date.parse(iso);
 assert.equal(quietUntil(prefs,'Asia/Qatar',at('2026-11-05T15:00:00Z')),null,'18:00 in Qatar is outside 21:00–06:30.');
 const until=quietUntil(prefs,'Asia/Qatar',at('2026-11-05T19:00:00Z'));assert.equal(new Date(until).toISOString(),'2026-11-06T03:30:00.000Z','22:00 waits until 06:30 Qatar time.');
 // A throwaway key: checks the signed JWT exchange and the HTTP v1 payload without contacting Google.
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048}),file=join(mkdtempSync(join(tmpdir(),'fcm-')),'sa.json');
 writeFileSync(file,JSON.stringify({type:'service_account',project_id:'demo-project',client_email:'push@demo-project.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}),token_uri:'https://oauth2.googleapis.com/token'}));
 const calls=[];const fake=async(url,options)=>{calls.push({url,options});return url.includes('oauth2')?new Response(JSON.stringify({access_token:'ya29.test',expires_in:3600})):url.endsWith(':send')&&JSON.parse(options.body).message.token==='gone'?new Response(JSON.stringify({error:{status:'NOT_FOUND',details:[{errorCode:'UNREGISTERED'}]}}),{status:404}):new Response('{}');};
 const sender=fcmSender(file,fake);assert.equal(sender.projectId,'demo-project');
 assert.deepEqual(await sender.send('device-token',{title:'T',body:'B',data:{tab:'thread'},urgent:true,tag:'x'}),{ok:true});
 const assertion=new URLSearchParams(calls[0].options.body).get('assertion');assert.equal(assertion.split('.').length,3,'A signed JWT is exchanged for an access token.');
 const send=calls[1];assert.equal(send.url,'https://fcm.googleapis.com/v1/projects/demo-project/messages:send');assert.equal(send.options.headers.Authorization,'Bearer ya29.test');
 const message=JSON.parse(send.options.body).message;assert.equal(message.token,'device-token');assert.equal(message.android.priority,'HIGH');assert.equal(message.android.notification.visibility,'PRIVATE');
 assert.equal((await sender.send('gone',{title:'T',body:'B',data:{}})).unregistered,true);assert.equal(calls.filter(c=>c.url.includes('oauth2')).length,1,'The access token is reused.');
 assert.equal(fcmSender(undefined),null,'Without a key, push stays off.');
});
