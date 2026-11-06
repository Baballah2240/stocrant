import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';

const pdf=(text='Policy')=>'data:application/pdf;base64,'+Buffer.from('%PDF-1.4\n% '+text+'\n%%EOF').toString('base64');
const png='data:image/png;base64,'+Buffer.from('89504e470d0a1a0a0000000d49484452','hex').toString('base64');

test('teacher requests, school resources and protected files',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'school-requests-')),app=await startServer({directory,port:0}),password=randomBytes(24).toString('hex');
 const api=async(path,{body,cookie='',bearer='',method}={})=>{const response=await fetch(app.origin+'/api/'+path,{method:method||(body===undefined?'GET':'POST'),headers:{Origin:bearer?'https://localhost':app.origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const type=response.headers.get('content-type')||'';return {status:response.status,headers:response.headers,data:type.includes('json')?await response.json():Buffer.from(await response.arrayBuffer()),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 try{
  await api('setup',{body:{name:'Owner',email:'owner@school.test',password}});const cookie=(await api('login',{body:{email:'owner@school.test',password}})).cookie;
  const a=(await api('classes',{body:{nameEn:'Class A',nameAr:''},cookie})).data.group,b=(await api('classes',{body:{nameEn:'Class B',nameAr:''},cookie})).data.group;
  for(const [name,email,classId] of [['Sara','sara@school.test',a.id],['Omar','omar@school.test',b.id]])assert.equal((await api('users',{body:{name,email,password,role:'teacher',classIds:[classId],teacherName:name},cookie})).status,200);
  const sign=async email=>(await api('mobile/login',{body:{email,password},bearer:'x'})).data.token;
  const sara=await sign('sara@school.test'),omar=await sign('omar@school.test');

  // Requests: validation, attachments checked by content, idempotent submission.
  assert.equal((await api('mobile/requests',{body:{type:'leave',title:'Family event',clientId:'req-leave-001'},bearer:sara})).status,400,'Leave needs dates.');
  assert.equal((await api('mobile/requests',{body:{type:'party',title:'x',clientId:'req-bad-0001'},bearer:sara})).status,400);
  assert.equal((await api('mobile/requests',{body:{type:'maintenance',title:'Projector',clientId:'req-exe-0001',attachments:[{name:'tool.pdf',data:'data:application/pdf;base64,'+Buffer.from('MZ fake exe').toString('base64')}]},bearer:sara})).status,400,'Content must match the file type.');
  assert.equal((await api('mobile/requests',{body:{type:'maintenance',title:'Projector',clientId:'req-exe-0002',attachments:[{name:'tool.exe',data:pdf()}]},bearer:sara})).status,400,'Unsupported extensions are refused.');
  const body={type:'leave',title:'Family event',details:'Wedding',from:'2026-12-01',to:'2026-12-02',clientId:'req-leave-002',attachments:[{name:'note.pdf',data:pdf('note')},{name:'photo.png',data:png}]};
  const first=await api('mobile/requests',{body,bearer:sara});assert.equal(first.status,200,JSON.stringify(first.data));
  assert.equal((await api('mobile/requests',{body,bearer:sara})).data.id,first.data.id,'Retries return the same request.');
  assert.equal(app.store.get().teacherRequests.length,1);assert.equal(app.store.get().files.length,2);

  let mine=(await api('mobile/timetable',{bearer:sara})).data.requests;assert.equal(mine.length,1);assert.equal(mine[0].status,'pending');assert.equal(mine[0].attachments.length,2);
  assert.equal((await api('mobile/timetable',{bearer:omar})).data.requests.length,0,'Teachers only see their own requests.');
  const fileId=mine[0].attachments[0].id;
  const own=await api('mobile/files/'+fileId,{bearer:sara});assert.equal(own.status,200);assert.match(own.headers.get('content-type'),/pdf/);assert.match(own.headers.get('content-disposition'),/attachment/);assert.ok(own.data.toString().startsWith('%PDF-'));
  assert.equal((await api('mobile/files/'+fileId,{bearer:omar})).status,404,'Another teacher cannot download it.');
  assert.equal((await api('mobile/files/'+fileId)).status,401);
  assert.equal((await api('files/'+fileId,{cookie})).status,200,'Managers can open request attachments.');

  // Comments both ways, then a decision with feedback.
  assert.equal((await api('mobile/requests/comment',{body:{id:first.data.id,text:'I can swap with Omar',clientId:'cmt-sara-0001'},bearer:sara})).status,200);
  assert.equal((await api('mobile/requests/comment',{body:{id:first.data.id,text:'Not mine',clientId:'cmt-omar-0001'},bearer:omar})).status,404);
  const all=(await api('teacher-requests',{cookie})).data.requests;assert.equal(all[0].comments[0].text,'I can swap with Omar');
  assert.equal((await api('teacher-requests/decide',{body:{id:first.data.id,status:'pending'},cookie})).status,400);
  assert.equal((await api('teacher-requests/decide',{body:{id:first.data.id,status:'approved',comment:'Approved. Enjoy the wedding.'},cookie})).status,200);
  mine=(await api('mobile/timetable',{bearer:sara})).data.requests;assert.equal(mine[0].status,'approved');assert.ok(mine[0].statusAt);assert.equal(mine[0].comments.at(-1).text,'Approved. Enjoy the wedding.');assert.equal(mine[0].comments.at(-1).staff,true);

  // Resources: audience, versions on revision, downloads, removal.
  assert.equal((await api('resources',{body:{title:'Behaviour policy',category:'policy'},cookie})).status,400,'A document is required.');
  const policy=(await api('resources',{body:{title:'Behaviour policy',description:'School rules',category:'policy',audience:'all',important:true,file:{name:'behaviour.pdf',data:pdf('v1')}},cookie})).data.id;
  const sheet=(await api('resources',{body:{title:'Class B worksheet',category:'teaching',audience:[b.id],file:{name:'sheet.pdf',data:pdf('B')}},cookie})).data.id;
  assert.equal((await api('resources',{body:{title:'Bad',category:'policy',audience:['nope'],file:{name:'x.pdf',data:pdf()}},cookie})).status,400);
  let saraRes=(await api('mobile/timetable',{bearer:sara})).data.resources;assert.deepEqual(saraRes.map(r=>r.title),['Behaviour policy'],'Class-only resources are hidden from other classes.');
  assert.equal((await api('mobile/timetable',{bearer:omar})).data.resources.length,2);
  const v1=saraRes[0];assert.equal(v1.version,1);assert.ok(v1.important);
  assert.equal((await api('mobile/files/'+v1.file.id,{bearer:sara})).status,200);
  const sheetFile=app.store.get().resources.find(r=>r.id===sheet).fileId;assert.equal((await api('mobile/files/'+sheetFile,{bearer:sara})).status,404,'Files of hidden resources are refused.');
  await new Promise(r=>setTimeout(r,10));
  assert.equal((await api('resources',{body:{id:policy,title:'Behaviour policy',category:'policy',audience:'all',important:true,changeNote:'New phone rules',file:{name:'behaviour.pdf',data:pdf('v2')}},cookie})).status,200);
  saraRes=(await api('mobile/timetable',{bearer:sara})).data.resources;assert.equal(saraRes[0].version,2);assert.equal(saraRes[0].changeNote,'New phone rules');assert.ok(saraRes[0].updatedAt>v1.updatedAt);
  assert.equal((await api('mobile/files/'+v1.file.id,{bearer:sara})).status,404,'The previous version is removed.');
  assert.ok((await api('mobile/files/'+saraRes[0].file.id,{bearer:sara})).data.toString().includes('v2'));
  assert.equal((await api('resources',{body:{id:policy,title:'Behaviour policy',category:'policy',downloadable:false},cookie})).status,200);
  assert.equal((await api('mobile/files/'+saraRes[0].file.id,{bearer:sara})).status,404,'View-only resources cannot be downloaded.');
  assert.equal((await api('resources/remove',{body:{id:sheet},cookie})).status,200);assert.equal((await api('mobile/timetable',{bearer:omar})).data.resources.length,1);

  // Teachers using the control panel cannot reach manager routes.
  assert.equal((await api('mobile/requests',{body:{type:'technical',title:'Wi-Fi',clientId:'req-wifi-0001'}})).status,401);
 }finally{await app.close();}
});
