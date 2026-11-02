import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {start} from '../server.mjs';
test('portfolio serves only public files and correct asset types',async()=>{
 const server=await start(0),origin='http://127.0.0.1:'+server.address().port;
 try{
  for(const [path,type]of [['/','text/html'],['/style.css','text/css'],['/app.js','text/javascript'],['/favicon.svg','image/svg+xml']]){const response=await fetch(origin+path);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').includes(type));}
  for(const path of ['/package.json','/server.mjs','/.openai/hosting.json','/../README.md'])assert.equal((await fetch(origin+path)).status,404);
  assert.equal((await fetch(origin+'/',{method:'POST'})).status,405);
  assert.equal((await fetch(origin+'/',{method:'HEAD'})).status,200);
 }finally{await new Promise(r=>server.close(r));}
});
test('section links and modal controls refer to actual content',async()=>{
 const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.has(match[1]),'Missing anchor '+match[1]);
 assert.equal((html.match(/data-project=/g)||[]).length,3);assert.equal((html.match(/data-category=/g)||[]).length,3);
 assert.ok(html.includes('Mohammed Baballah Alsiddig Mohammed'));assert.ok(html.includes('github.com/Baballah2240'));
});
