import {randomBytes} from 'node:crypto';
import {publicFile} from './files.mjs';

// Teacher requests (leave, absence, timetable correction, maintenance, technical
// support) and the school resources library. Teachers only ever see their own
// requests and the resources addressed to them; managers see everything.

export const requestTypes=['leave','absence','correction','maintenance','technical'];
export const requestStatuses=['pending','approved','rejected','completed'];
export const resourceCategories=['policy','teaching','form','shared'];
const id=()=>randomBytes(16).toString('hex'),bad=(message,status=400)=>Object.assign(Error(message),{status});
const text=(value,max,label,required=true)=>{const v=typeof value==='string'?value.trim():'';if(required&&!v)throw bad(`Enter ${label}.`);if(v.length>max)throw bad(`Keep ${label} within ${max} characters.`);return v;};
const day=value=>{if(value===undefined||value===''||value===null)return '';if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T12:00:00Z')))throw bad('Use a valid date.');return value;};
const clientKey=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,64}$/.test(value)?value:null;
const ensure=state=>{state.teacherRequests ??= [];state.resources ??= [];state.files ??= [];};

function attach(state,files,list,owner,scope){
 if(list===undefined)return [];
 if(!Array.isArray(list)||list.length>3)throw bad('Attach up to 3 files.');
 return list.map(item=>files.store(state,item,owner,scope).id);
}

// ---------- Requests ----------
export function createRequest(state,files,user,body,now=Date.now()){
 ensure(state);
 const key=clientKey(body.clientId);if(!key)throw bad('Missing request reference.');
 const existing=state.teacherRequests.find(row=>row.clientId===key&&row.userId===user.id);if(existing)return existing;
 if(!requestTypes.includes(body.type))throw bad('Choose the type of request.');
 const from=day(body.from),to=day(body.to)||from;
 if(['leave','absence'].includes(body.type)&&!from)throw bad('Choose the dates.');
 if(from&&to<from)throw bad('The end date must be on or after the start date.');
 if(state.teacherRequests.filter(row=>row.userId===user.id&&row.status==='pending').length>=30)throw bad('You have too many open requests. Wait for the school to answer some first.',429);
 const rowId=id(),at=new Date(now).toISOString();
 const row={id:rowId,clientId:key,userId:user.id,userName:user.name,type:body.type,title:text(body.title,120,'a short title'),details:text(body.details,2000,'the details',false),from,to:from?to:'',status:'pending',comments:[],attachments:attach(state,files,body.attachments,user,{kind:'request',refId:rowId}),at,updatedAt:at,statusAt:null};
 state.teacherRequests.push(row);return row;
}
export function commentRequest(state,files,user,body,staff,now=Date.now()){
 ensure(state);
 const row=state.teacherRequests.find(item=>item.id===body.id&&(staff||item.userId===user.id));if(!row)throw bad('Request not found.',404);
 const key=clientKey(body.clientId);
 if(key&&row.comments.some(item=>item.clientId===key))return row;
 const at=new Date(now).toISOString();
 row.comments.push({id:id(),clientId:key,byId:user.id,byName:user.name,staff:Boolean(staff),text:text(body.text,1000,'a comment'),attachments:attach(state,files,body.attachments,user,{kind:'request',refId:row.id}),at});
 row.updatedAt=at;if(!staff)row.staffSeenAt=null;return row;
}
export function decideRequest(state,user,body,now=Date.now()){
 ensure(state);
 const row=state.teacherRequests.find(item=>item.id===body.id);if(!row)throw bad('Request not found.',404);
 if(!requestStatuses.includes(body.status)||body.status==='pending')throw bad('Choose approved, rejected or completed.');
 const at=new Date(now).toISOString(),note=text(body.comment,1000,'a comment',false);
 row.status=body.status;row.statusAt=at;row.statusBy=user.name;row.updatedAt=at;row.staffSeenAt=at;
 if(note)row.comments.push({id:id(),clientId:null,byId:user.id,byName:user.name,staff:true,text:note,attachments:[],at,status:body.status});
 else row.comments.push({id:id(),clientId:null,byId:user.id,byName:user.name,staff:true,text:'',attachments:[],at,status:body.status});
 return row;
}
const shapeRequest=(state,row)=>{const file=fid=>publicFile(state.files.find(item=>item.id===fid));return {...row,clientId:row.clientId,attachments:row.attachments.map(file).filter(Boolean),comments:row.comments.map(item=>({...item,attachments:(item.attachments||[]).map(file).filter(Boolean)}))};};
export const ownRequests=(state,user)=>{ensure(state);return state.teacherRequests.filter(row=>row.userId===user.id).slice(-60).map(row=>shapeRequest(state,row));};
export const allRequests=state=>{ensure(state);return state.teacherRequests.slice(-300).reverse().map(row=>shapeRequest(state,row));};

// ---------- Resources ----------
const audienceOk=(state,audience)=>audience==='all'||(Array.isArray(audience)&&audience.length&&audience.every(classId=>state.classes.some(group=>group.id===classId)));
export function saveResource(state,files,user,body,now=Date.now()){
 ensure(state);
 const at=new Date(now).toISOString(),existing=body.id?state.resources.find(row=>row.id===body.id):null;
 if(body.id&&!existing)throw bad('Resource not found.',404);
 if(!resourceCategories.includes(body.category))throw bad('Choose a category.');
 const audience=body.audience===undefined?'all':body.audience;if(!audienceOk(state,audience))throw bad('Choose who can see this resource.');
 const rowId=existing?.id||id();
 let fileId=existing?.fileId||null,version=existing?.version||0,revised=false;
 if(body.file){const meta=files.store(state,body.file,user,{kind:'resource',refId:rowId});if(fileId)files.remove(state,[fileId]);fileId=meta.id;version++;revised=true;}
 if(!fileId)throw bad('Attach the document.');
 const row={id:rowId,title:text(body.title,140,'a title'),description:text(body.description,600,'a description',false),category:body.category,audience,downloadable:body.downloadable!==false,important:body.important===true,fileId,version:version||1,createdAt:existing?.createdAt||at,updatedAt:revised||!existing?at:existing.updatedAt,editedAt:at,by:user.name,changeNote:text(body.changeNote,300,'the change note',false)};
 state.resources=existing?state.resources.map(item=>item.id===rowId?row:item):[...state.resources,row].slice(-500);
 return row;
}
export function removeResource(state,files,body){
 ensure(state);const row=state.resources.find(item=>item.id===body.id);if(!row)throw bad('Resource not found.',404);
 files.remove(state,[row.fileId]);state.resources=state.resources.filter(item=>item.id!==row.id);
}
const visibleTo=(row,classIds)=>row.audience==='all'||row.audience.some(classId=>classIds.has(classId));
export function teacherResources(state,user,classIds){
 ensure(state);
 return state.resources.filter(row=>visibleTo(row,classIds)).map(row=>({id:row.id,title:row.title,description:row.description,category:row.category,downloadable:row.downloadable,important:row.important,version:row.version,updatedAt:row.updatedAt,createdAt:row.createdAt,changeNote:row.changeNote,file:publicFile(state.files.find(item=>item.id===row.fileId))}));
}
export const allResources=state=>{ensure(state);return state.resources.map(row=>({...row,file:publicFile(state.files.find(item=>item.id===row.fileId))}));};

/** Can this user download this file? Teachers: own request files or resources addressed to them. */
export function canReadFile(state,user,meta,{staff,classIds}){
 if(staff)return true;
 if(meta.scope?.kind==='request'){const row=(state.teacherRequests||[]).find(item=>item.id===meta.scope.refId);return Boolean(row&&row.userId===user.id);}
 if(meta.scope?.kind==='resource'){const row=(state.resources||[]).find(item=>item.id===meta.scope.refId&&item.fileId===meta.id);return Boolean(row&&row.downloadable&&visibleTo(row,classIds));}
 return false;
}
