import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { browserQa } from './browser-qa.mjs';
const temporary=mkdtempSync(join(tmpdir(),'stocrant-test-data-brand-'));
const browser=await browserQa(temporary);
try {
  await browser.send('Page.enable');
  await browser.send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  async function render(svg,width,height,path){
    await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await browser.send('Page.navigate',{url:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});
    await browser.until('document.readyState==="complete"');
    const shot=await browser.send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width,height,scale:1}});
    mkdirSync(resolve(path,'..'),{recursive:true});writeFileSync(path,Buffer.from(shot.data,'base64'));
  }
  for(const name of ['stocrant-app-icon','stocrant-adaptive-foreground'])await render(readFileSync(`mobile/branding/${name}.svg`,'utf8'),1024,1024,`mobile/branding/${name}.png`);
  const logo=readFileSync('public/branding/stocrant-logo-dark.svg','utf8');const width=Number(logo.match(/viewBox="0 0 (\d+) 292"/)[1]);
  await render(logo,width,292,'mobile/branding/stocrant-logo-dark.png');
  const icon=readFileSync('public/branding/stocrant-icon.svg','utf8');
  for(const size of [16,24])await render(icon,size,size,`.local-preview/qa/branding/icon-${size}.png`);
  console.log('Rendered native icon masters and path wordmark from the canonical SVGs.');
}finally{await browser.close();rmSync(temporary,{recursive:true,force:true,maxRetries:4,retryDelay:250});}
