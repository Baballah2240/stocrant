import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const assets = {'/':['index.html','text/html; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
export function start(port=4330) {
  const server=createServer(async(req,res)=>{
    const item=assets[new URL(req.url,'http://127.0.0.1').pathname];
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
    if(!item){res.writeHead(404);res.end('Not found');return;}
    try{const data=await readFile(new URL('./dist/'+item[0],import.meta.url));res.writeHead(200,{'Content-Type':item[1]});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(500);res.end('Unable to serve portfolio');}
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server));});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){const server=await start(Number(process.env.PORT||4330));console.log(`Portfolio: http://127.0.0.1:${server.address().port}`);}
