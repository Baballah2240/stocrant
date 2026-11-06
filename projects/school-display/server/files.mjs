import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';

// Protected attachments for teacher requests and school resources.
// Files are stored under random names outside the web root and are only
// returned through routes that check who is asking. The content is checked
// against its declared type, so a renamed executable is rejected.
export const maxFileBytes=5*1024*1024;
const types={
 pdf:{mime:'application/pdf',check:b=>b.subarray(0,5).toString()==='%PDF-'},
 png:{mime:'image/png',check:b=>b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'},
 jpg:{mime:'image/jpeg',check:b=>b[0]===255&&b[1]===216&&b[2]===255},
 webp:{mime:'image/webp',check:b=>b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'},
 docx:{mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',check:b=>b.subarray(0,4).toString('hex')==='504b0304'},
 xlsx:{mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',check:b=>b.subarray(0,4).toString('hex')==='504b0304'},
 pptx:{mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',check:b=>b.subarray(0,4).toString('hex')==='504b0304'},
 txt:{mime:'text/plain; charset=utf-8',check:b=>!b.includes(0)}
};
const bad=(message,status=400)=>Object.assign(Error(message),{status});
const cleanName=name=>String(name||'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').trim().slice(0,120)||'file';

export function createFiles(directory){
 const root=join(directory,'files');mkdirSync(root,{recursive:true});
 /** Accepts {name, data:'data:<mime>;base64,...'} and returns stored metadata. */
 function store(state,input,owner,scope){
  state.files ??= [];
  if(!input||typeof input.name!=='string'||typeof input.data!=='string')throw bad('Choose a file to attach.');
  const name=cleanName(input.name),ext=(name.split('.').pop()||'').toLowerCase().replace('jpeg','jpg'),type=types[ext];
  if(!type)throw bad('Attach a PDF, image, Word, Excel, PowerPoint or text file.');
  const match=/^data:[^;,]*(;[^,]*)?;base64,([A-Za-z0-9+/]*={0,2})$/.exec(input.data);if(!match)throw bad('The file could not be read.');
  const bytes=Buffer.from(match[2],'base64');
  if(!bytes.length||bytes.length>maxFileBytes)throw bad('Each file must be 5 MB or smaller.');
  if(!type.check(bytes))throw bad('The file content does not match its type.');
  if(state.files.length>=2000)throw bad('The school file storage is full. Remove old resources first.',507);
  const id=randomBytes(20).toString('hex'),file=join(root,id);
  writeFileSync(file+'.tmp',bytes,{mode:0o600});renameSync(file+'.tmp',file);
  const meta={id,name,ext,mime:type.mime,size:bytes.length,ownerId:owner.id,scope,at:new Date().toISOString()};
  state.files.push(meta);return meta;
 }
 function read(state,id){
  const meta=(state.files||[]).find(row=>row.id===id);
  if(!meta||!/^[a-f0-9]{40}$/.test(id)||!existsSync(join(root,id)))throw bad('File not found.',404);
  return {meta,bytes:readFileSync(join(root,id))};
 }
 function remove(state,ids){
  const drop=new Set(ids);state.files=(state.files||[]).filter(row=>!drop.has(row.id));
  for(const id of drop)if(/^[a-f0-9]{40}$/.test(id))try{unlinkSync(join(root,id));}catch{}
 }
 return {store,read,remove};
}
export const publicFile=meta=>meta?{id:meta.id,name:meta.name,ext:meta.ext,size:meta.size,at:meta.at}:null;
