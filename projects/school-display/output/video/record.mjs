// Turns the captured frames into a WebM video with Chrome's own recorder.
// Usage: node output/video/record.mjs [preview]
import http from 'node:http';
import {readFileSync,writeFileSync,mkdtempSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserQa} from '../../tests/browser-helper.mjs';

const here=dirname(fileURLToPath(import.meta.url)),root=join(here,'..','..');
const types={'.html':'text/html','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 if(req.method==='POST'&&req.url==='/save'){const parts=[];req.on('data',d=>parts.push(d));req.on('end',()=>{writeFileSync(join(here,'School-Display-Presentation.webm'),Buffer.concat(parts));res.end('ok');});return;}
 const path=req.url==='/icon.svg'?join(root,'assets','icon.svg'):join(here,decodeURIComponent(req.url.split('?')[0]));
 if(!path.startsWith(root)||!existsSync(path)){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(readFileSync(path));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await browserQa(mkdtempSync(join(tmpdir(),'school-video-rec-')));
try{
 const {send,evaluate,until}=browser;await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/compose.html'});await until('typeof window.record==="function"');
 if(process.argv[2]==='preview'){
  await evaluate('prep()');
  for(const t of [3,10,18,26,33,40,49,56,63,70,77]){await evaluate(`preview(${t})`);writeFileSync(join(here,`preview-${t}.jpg`),Buffer.from((await send('Page.captureScreenshot',{format:'jpeg',quality:80})).data,'base64'));}
  console.log('previews written');
 }else{
  await evaluate('window.__done=null;window.__error=null;record().then(r=>window.__done=r,e=>window.__error=String(e));true');
  let result;for(let i=0;i<400&&!result;i++){await new Promise(r=>setTimeout(r,1000));result=await evaluate('window.__done||(window.__error?{error:window.__error}:null)');}
  console.log('recorded',JSON.stringify(result));
 }
}finally{await browser.close();server.close();}
