import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export const defaultPhotos=['/images/student-break.png','/images/student-return.png'];
const custom=/^\/api\/images\/([a-f0-9]{64}\.(png|jpg|webp))$/;
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export const validPhotoPath=value=>typeof value==='string'&&(defaultPhotos.includes(value)||custom.test(value));
export function createImages(directory){
 const root=join(directory,'images');mkdirSync(root,{recursive:true});
 function decode(data){
  if(typeof data!=='string'||data.length>2900000)fail('Choose a PNG, JPEG or WebP image up to 2 MB.');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!match)fail('Choose a PNG, JPEG or WebP image up to 2 MB.');
  const bytes=Buffer.from(match[2],'base64'),ext=match[1]==='jpeg'?'jpg':match[1];
  const valid=ext==='png'?bytes.length>=67&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&bytes.subarray(-8,-4).toString()==='IEND':ext==='jpg'?bytes.length>=32&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.subarray(-2).toString('hex')==='ffd9':bytes.length>=16&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)===bytes.length-8;
  if(!valid||bytes.length>2*1024*1024)fail('Choose a PNG, JPEG or WebP image up to 2 MB.');
  return {bytes,ext,id:createHash('sha256').update(bytes).digest('hex')+'.'+ext};
 }
 function save(decoded){const file=join(root,decoded.id);if(!existsSync(file)){writeFileSync(file+'.tmp',decoded.bytes,{mode:0o600});renameSync(file+'.tmp',file);}return '/api/images/'+decoded.id;}
 function read(path){const match=custom.exec(path);if(!match||!existsSync(join(root,match[1])))throw Object.assign(new Error('Image not found.'),{status:404});return {bytes:readFileSync(join(root,match[1])),type:'image/'+(match[2]==='jpg'?'jpeg':match[2])};}
 const refs=settings=>[...new Set([settings.breakImage,settings.returnImage].filter(path=>!defaultPhotos.includes(path)))];
 function check(settings,available=new Set()){for(const ref of refs(settings))if(!validPhotoPath(ref)||(!available.has(ref)&&!existsSync(join(root,custom.exec(ref)[1]))))fail('Upload the selected image before saving settings.');}
 return {
  upload:data=>save(decode(data)),read,check,
  export:settings=>Object.fromEntries(refs(settings).map(ref=>{const image=read(ref);return [ref,`data:${image.type};base64,${image.bytes.toString('base64')}`];})),
  prepareRestore:(images={},settings)=>{if(!images||typeof images!=='object'||Array.isArray(images)||Object.keys(images).length>2)fail('Choose a School Display backup.');const decoded=Object.entries(images).map(([ref,value])=>{const image=decode(value);if(ref!=='/api/images/'+image.id)fail('Choose a School Display backup.');return image;});check(settings,new Set(decoded.map(image=>'/api/images/'+image.id)));return ()=>decoded.forEach(save);}
 };
}
