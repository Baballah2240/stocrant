import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {defaultPhotos,validPhotoPath,imageRefs} from '../shared/media.mjs';
export {defaultPhotos,validPhotoPath};
const custom=/^\/api\/images\/([a-f0-9]{64}\.(png|jpg|webp))$/;
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
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
 const refs=imageRefs;
 function check(settings,available=new Set(),rows=[],specials=[]){const paths=refs(settings,rows,specials);if(paths.length>64)fail('Use up to 64 different photos across your schedules.');for(const ref of paths)if(!validPhotoPath(ref)||(!available.has(ref)&&!existsSync(join(root,custom.exec(ref)[1]))))fail('Upload the selected image before saving settings.');const bytes=paths.reduce((sum,ref)=>sum+(available.get?.(ref)??(existsSync(join(root,custom.exec(ref)[1]))?statSync(join(root,custom.exec(ref)[1])).size:0)),0);if(bytes>64*1024*1024)fail('Photos must total at most 64 MB.');}
 return {
  upload:data=>save(decode(data)),read,check,
  export:(settings,rows=[],specials=[])=>Object.fromEntries(refs(settings,rows,specials).map(ref=>{const image=read(ref);return [ref,`data:${image.type};base64,${image.bytes.toString('base64')}`];})),
  prepareRestore:(images={},settings,rows=[],specials=[])=>{if(!images||typeof images!=='object'||Array.isArray(images)||Object.keys(images).length>64)fail('Choose a School Display backup.');const decoded=Object.entries(images).map(([ref,value])=>{const image=decode(value);if(ref!=='/api/images/'+image.id)fail('Choose a School Display backup.');return image;});if(decoded.reduce((sum,image)=>sum+image.bytes.length,0)>64*1024*1024)fail('Backup photos must total at most 64 MB.');check(settings,new Map(decoded.map(image=>['/api/images/'+image.id,image.bytes.length])),rows,specials);return ()=>decoded.forEach(save);}
 };
}
