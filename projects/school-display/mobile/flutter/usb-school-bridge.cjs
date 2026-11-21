const http=require('node:http'), https=require('node:https'), fs=require('node:fs'), path=require('node:path');
const certificateDirectory=process.argv[2];
if(!certificateDirectory)throw Error('Pass the local USB certificate directory.');
const schoolPort=Number(process.argv[3]||4318);
if(!Number.isInteger(schoolPort)||schoolPort<1||schoolPort>65535)throw Error('Pass a valid local school port.');
const read=name=>fs.readFileSync(path.join(certificateDirectory,name));
https.createServer({key:read('key.pem'),cert:read('cert.pem')},(req,res)=>{
  if(!req.url.startsWith('/api/mobile/')) {res.writeHead(404).end();return;}
  const headers={...req.headers,host:'127.0.0.1:'+schoolPort};
  delete headers.cookie;
  const upstream=http.request({host:'127.0.0.1',port:schoolPort,path:req.url,method:req.method,headers},reply=>{
    res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
  req.pipe(upstream);
}).listen(4321,'127.0.0.1',()=>console.log('USB HTTPS bridge listening on 4321 and forwarding to '+schoolPort));
