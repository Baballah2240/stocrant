import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startServer} from '../server/server.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jO7cAAAAASUVORK5CYII=';
test('replacement photos require admin, enforce raster formats and survive backup restore',async()=>{
 const app=await startServer({directory:mkdtempSync(join(tmpdir(),'school-photo-')),port:0});let cookie='';const password=randomBytes(24).toString('hex');
 async function req(path,body,method='POST'){const res=await fetch(app.origin+'/api/'+path,{method:body===undefined?'GET':method,headers:{Origin:app.origin,'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});return {res,data:await res.json()};}
 try{
  assert.equal((await req('images',{data:png})).res.status,401);
  assert.equal((await req('videos',{data:png})).res.status,401);
  await req('setup',{name:'Owner',email:'photo@school.test',password});cookie=(await req('login',{email:'photo@school.test',password})).res.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('images',{data:'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='})).res.status,400);
  assert.equal((await req('images',{data:'data:image/png;base64,aGVsbG8='})).res.status,400);
  const image=(await req('images',{data:png})).data.image;assert.match(image,/^\/api\/images\/[a-f0-9]{64}\.png$/);
  const settings=(await req('state')).data.settings,displayToken=app.store.get().displayToken;
  assert.equal((await fetch(app.origin+image)).status,403);
  assert.equal((await fetch(app.origin+image+'?token='+displayToken)).status,404,'Unselected uploaded images remain private.');
  assert.equal((await req('settings',{...settings,breakImage:image},'PUT')).res.status,200);
  const publicImage=await fetch(app.origin+image+'?token='+displayToken);assert.equal(publicImage.status,200);assert.equal(publicImage.headers.get('content-type'),'image/png');
  assert.equal((await req('settings',{...settings,returnImage:'https://outside.test/image.jpg'},'PUT')).res.status,400);
  assert.equal((await req('videos',{data:'data:video/mp4;base64,aGVsbG8='})).res.status,400);
  // This fixture tests container identification and transport; the browser test decodes a real clip.
  const clip='data:video/mp4;base64,'+Buffer.from('00000018667479706d703432000000006d70343269736f6d','hex').toString('base64');
  assert.equal((await req('images',{data:clip})).res.status,400);
  const uploaded=await req('videos',{data:clip});
  assert.equal(uploaded.res.status,200);
  const video=uploaded.data.video,videoUrl=app.origin+video+'?token='+displayToken;
  assert.equal((await fetch(videoUrl)).status,404);
  assert.equal((await req('settings',{...settings,breakImage:image,breakVideo:video},'PUT')).res.status,200);
  const part=await fetch(videoUrl,{headers:{Range:'bytes=0-7'}});
  assert.equal(part.status,206);
  assert.equal(part.headers.get('content-type'),'video/mp4');
  assert.equal(part.headers.get('content-range'),'bytes 0-7/24');
  assert.equal((await part.arrayBuffer()).byteLength,8);
  const backup=(await req('backup')).data;assert.ok(backup.images[image]);assert.equal(backup.images[video],clip);
  const other=await startServer({directory:mkdtempSync(join(tmpdir(),'school-photo-restore-')),port:0});
  try{await fetch(other.origin+'/api/setup',{method:'POST',headers:{Origin:other.origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Owner',email:'photo@school.test',password})});const login=await fetch(other.origin+'/api/login',{method:'POST',headers:{Origin:other.origin,'Content-Type':'application/json'},body:JSON.stringify({email:'photo@school.test',password})});const restore=await fetch(other.origin+'/api/restore',{method:'POST',headers:{Origin:other.origin,'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0]},body:JSON.stringify({backup,password})});assert.equal(restore.status,200,await restore.text());assert.equal((await fetch(other.origin+image+'?token='+other.store.get().displayToken)).status,200);assert.equal((await fetch(other.origin+video+'?token='+other.store.get().displayToken)).status,200);}finally{await other.close();}
  await req('rotate-display',{password});assert.equal((await fetch(app.origin+image+'?token='+displayToken)).status,403);
 }finally{await app.close();}
});
