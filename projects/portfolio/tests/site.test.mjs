import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {start} from '../server.mjs';
test('portfolio serves only public files and correct asset types',async()=>{
 const server=await start(0),origin='http://127.0.0.1:'+server.address().port;
 try{
  for(const [path,type]of [['/','text/html'],['/style.css','text/css'],['/app.js','text/javascript'],['/ambient.js','text/javascript'],['/cards.js','text/javascript'],['/contact.js','text/javascript'],['/favicon.svg','image/svg+xml']]){const response=await fetch(origin+path);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').includes(type));}
  for(const path of ['/package.json','/server.mjs','/.openai/hosting.json','/../README.md'])assert.equal((await fetch(origin+path)).status,404);
  assert.equal((await fetch(origin+'/',{method:'POST'})).status,405);
  assert.equal((await fetch(origin+'/',{method:'HEAD'})).status,200);
 }finally{await new Promise(r=>server.close(r));}
});
test('single-screen dashboard exposes its projects and focused sections',async()=>{
 const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.has(match[1]),'Missing anchor '+match[1]);
 assert.equal((html.match(/data-project=/g)||[]).length,3);
 for(const project of ['stocrant','safeer','school'])assert.match(html,new RegExp(`data-project=["']${project}["']`));
 for(const section of ['work','about','expertise','contact'])assert.match(html,new RegExp(`data-focus=["']${section}["']`));
 assert.match(html,/class="[^"]*app-shell/);assert.ok(ids.has('main'));
 assert.match(html,/<dialog\b[^>]*id="project-dialog"[^>]*aria-labelledby="dialog-title"/);
 assert.ok(ids.has('project-details'));assert.match(html,/class="[^"]*dialog-close/);
 assert.doesNotMatch(html,/class="[^"]*\bplanet\b/);assert.doesNotMatch(html,/data-filter=|class="[^"]*\bplay-button\b/);
 assert.ok(html.includes('Mohammed Baballah Alsiddig Mohammed'));assert.ok(html.includes('github.com/Baballah2240'));
});
test('background decoration and motion control preserve accessible local content',async()=>{
 const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.match(html,/<div\b[^>]*class="[^"]*\bambient\b[^"]*"[^>]*aria-hidden="true"/,'Background is explicitly decorative');
 assert.match(html,/<button\b[^>]*class="[^"]*\bmotion-toggle\b[^"]*"[^>]*aria-label="Pause page motion"[^>]*aria-pressed="true"|<button\b[^>]*class="[^"]*\bmotion-toggle\b[^"]*"[^>]*aria-pressed="true"[^>]*aria-label="Pause page motion"/,'Motion control exposes its initial action and state');
 assert.doesNotMatch(html,/<canvas\b|<iframe\b|https?:\/\/[^"']+\.(?:js|css)(?:[?"'])/i,'Background adds no canvas, embeds or external script/style dependency');
});
