import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chrome} from './support/chrome.mjs';
import {start} from '../server.mjs';
mkdirSync('.qa',{recursive:true});
const server=await start(0),url='http://127.0.0.1:'+server.address().port;
const browser=await chrome(mkdtempSync(join(tmpdir(),'portfolio-'))),{send,evaluate,until}=browser;
try{
 await send('Page.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__errors=[];addEventListener("error",e=>__errors.push(e.message));addEventListener("unhandledrejection",e=>__errors.push(String(e.reason)));'});
 await send('Page.navigate',{url});await until('document.readyState==="complete" && Boolean(document.querySelector("[data-project]"))');
 await evaluate('document.querySelector("[data-filter=transport]").click()');assert.equal(await evaluate('document.querySelectorAll(".project-card:not([hidden])").length'),1);
 await evaluate('document.querySelector("[data-project=safeer]").click()');assert.equal(await evaluate('document.querySelector("dialog").open'),true);assert.ok((await evaluate('document.querySelector("#project-details").textContent')).includes('local development'));
 await send('Page.bringToFront');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await until('!document.querySelector("dialog").open');
 await evaluate('document.querySelector("[data-filter=all]").click()');assert.equal(await evaluate('document.querySelectorAll(".project-card:not([hidden])").length'),3);
 for(const width of [1920,1366,768,390,320])for(const theme of ['dark','light']){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Overflow '+width+' '+theme);
  await writeFileSync(`.qa/${width}-${theme}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate('document.querySelector(".menu-toggle").click()');assert.equal(await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded")'),'true');
 await evaluate('document.querySelector(".nav-links a").click()');assert.equal(await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded")'),'false');
 await evaluate('document.documentElement.dataset.theme="dark";document.querySelector(".theme-toggle").click()');assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');
 await send('Page.reload');await until('document.documentElement.dataset.theme==="light"');
 assert.deepEqual(await evaluate('window.__errors'),[]);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await evaluate('getComputedStyle(document.documentElement).scrollBehavior'),'auto');
 console.log('PASS: filters, dialogs/Escape, mobile navigation, persistent theme, reduced motion, runtime errors and 10 responsive layouts.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
