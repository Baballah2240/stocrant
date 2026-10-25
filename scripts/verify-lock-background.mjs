import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {browserQa} from './browser-qa.mjs';
const root=mkdtempSync(join(tmpdir(),'stocrant-test-data-lock-background-'));
process.env.STOCRANT_DATA_DIR=root;process.env.NODE_ENV='development';
const {createApp}=await import('../dist/app.js');const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`,password=randomUUID()+randomUUID();let browser;
try{
 const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Preview Owner',email:'owner@lock-background.test',password,setupKey:'local-setup'})});assert.ok(setup.ok,await setup.clone().text());
 const cookie=setup.headers.get('set-cookie').split(';')[0];browser=await browserQa(root);const {send,evaluate,until}=browser;
 await send('Network.enable');await send('Network.setCookie',{name:'stocrant_session',value:cookie.split('=').slice(1).join('='),url:base,path:'/'});
 const shots=resolve('.local-preview/qa/lock-background');mkdirSync(shots,{recursive:true});
 for(const [theme,language,width] of [['dark','en',1440],['light','ar',390]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<700});
  await send('Page.navigate',{url:base+'/shops'});await until('Boolean(document.querySelector(".app-lock-card"))');
  await evaluate(`localStorage.setItem('stocrant.language',${JSON.stringify(language)});localStorage.setItem('stocrant-theme',${JSON.stringify(theme)})`);
  await send('Page.navigate',{url:base+'/shops'});await until('Boolean(document.querySelector(".lock-screen-background"))');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".lock-screen-background")).pointerEvents'),'none');
  assert.equal(await evaluate('document.querySelector(".app-lock-card input").type'),'password');
  assert.ok(await evaluate(`(async()=>{const c=document.querySelector('.lock-screen-background'),before=c.toDataURL();await new Promise(r=>setTimeout(r,140));return before!==c.toDataURL();})()`),'Background animates');
  writeFileSync(join(shots,`${theme}-${language}-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.ok(await evaluate(`(async()=>{await new Promise(r=>setTimeout(r,80));const c=document.querySelector('.lock-screen-background'),before=c.toDataURL();await new Promise(r=>setTimeout(r,140));return before===c.toDataURL();})()`),'Reduced motion is static');
 await evaluate(`(()=>{const input=document.querySelector('.app-lock-card input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(password)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await evaluate('document.querySelector(".app-lock-card form").requestSubmit()');await until('!document.querySelector(".app-lock-screen")');
 assert.ok(await evaluate('!document.querySelector(".lock-screen-background")'),'Canvas is removed after unlocking');
 console.log('Lock background browser checks passed: animated frames, reduced motion, light/dark desktop/mobile layouts, password input, unlock and animation cleanup.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
