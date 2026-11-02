import {createHash,randomBytes} from 'node:crypto';
import {schoolClock} from '../shared/schedule.mjs';
import {validDate} from './planning.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const digest=value=>createHash('sha256').update(value).digest('hex');
const day=86400000,dateOf=(date,count)=>new Date(Date.parse(date+'T12:00:00Z')+count*day).toISOString().slice(0,10);
const today=(state,now)=>schoolClock(new Date(now),state.settings.timezone).date;
const text=(value,max)=>typeof value==='string'&&value.length<=max?value.trim():null;
const newId=()=>randomBytes(16).toString('hex');
function studentFields(state,body){
 const nameEn=text(body.nameEn,120),nameAr=text(body.nameAr,120);
 if(nameEn===null||nameAr===null||!nameEn&&!nameAr)fail('Enter the student name in Arabic or English.');
 if(!state.classes.some(row=>row.id===body.classId))fail('Choose a valid class group.');
 return {nameEn,nameAr,classId:body.classId};
}
export function saveStudent(state,body){
 if(body.id){const student=state.students.find(row=>row.id===body.id);if(!student)fail('Student not found.',404);return Object.assign(student,studentFields(state,body));}
 if(state.students.length>=5000)fail('Use up to 5000 students.');
 const student={id:newId(),...studentFields(state,body)};state.students.push(student);return student;
}
// All or nothing, so a mistake on one line cannot leave half a class imported.
export function importStudents(state,rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>2000||state.students.length+rows.length>5000)fail('Import between 1 and 2000 students at a time.');
 const key=value=>String(value||'').trim().toLowerCase();
 const students=rows.map((row,index)=>{const group=state.classes.find(item=>[key(item.nameEn),key(item.nameAr)].includes(key(row.className))&&key(row.className));if(!group)fail(`Line ${index+1}: class not found.`);try{return {id:newId(),...studentFields(state,{...row,classId:group.id})};}catch(error){fail(`Line ${index+1}: ${error.message}`);}});
 state.students.push(...students);return students.length;
}
export function removeStudent(state,id){
 if(!state.students.some(row=>row.id===id))fail('Student not found.',404);
 state.students=state.students.filter(row=>row.id!==id);state.attendance=state.attendance.filter(row=>row.studentId!==id);state.absenceRequests=state.absenceRequests.filter(row=>row.studentId!==id);state.parentInvites=state.parentInvites.filter(row=>row.studentId!==id);
 for(const user of state.users)if(user.role==='parent')user.studentIds=user.studentIds.filter(value=>value!==id);
}
// Easily confused letters and digits are left out because codes are read aloud and typed.
const alphabet='ABCDEFGHJKMNPQRSTUVWXYZ23456789',cleanCode=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,20);
export function createInvite(state,studentId,now=Date.now()){
 if(!state.students.some(row=>row.id===studentId))fail('Student not found.',404);
 const raw=[...randomBytes(10)].map(value=>alphabet[value%alphabet.length]).join('');
 state.parentInvites=state.parentInvites.filter(row=>row.expires>now).concat({hash:digest(raw),studentId,expires:now+30*day}).slice(-5000);
 return {code:raw.slice(0,5)+'-'+raw.slice(5),expiresAt:new Date(now+30*day).toISOString()};
}
export function findInvite(state,code,now=Date.now()){
 const hash=digest(cleanCode(code)),invite=state.parentInvites.find(row=>row.hash===hash&&row.expires>now);
 if(!invite||!state.students.some(row=>row.id===invite.studentId))fail('This invitation code is not valid. Ask the school for a new one.');
 return invite;
}
export function consumeInvite(state,invite,parent){
 state.parentInvites=state.parentInvites.filter(row=>row!==invite);
 if(!parent.studentIds.includes(invite.studentId))parent.studentIds.push(invite.studentId);
}
export function markAttendance(state,user,body,allowed,now=Date.now()){
 const current=today(state,now);
 if(!allowed.has(body.classId))fail('You cannot mark attendance for this class.',403);
 if(!validDate(body.date)||body.date>current||body.date<dateOf(current,-7))fail('Attendance can be marked for today or the last seven days.');
 if(!Array.isArray(body.entries)||!body.entries.length||body.entries.length>500)fail('Mark at least one student.');
 const ids=new Set(state.students.filter(row=>row.classId===body.classId).map(row=>row.id));
 for(const entry of body.entries)if(!ids.has(entry?.studentId)||!['present','absent','late'].includes(entry.status))fail('Check the attendance list.');
 const at=new Date(now).toISOString(),updated=new Set(body.entries.map(entry=>entry.studentId));
 state.attendance=state.attendance.filter(row=>!(row.date===body.date&&updated.has(row.studentId))&&row.date>=dateOf(current,-200)).concat(body.entries.map(({studentId,status})=>({studentId,classId:body.classId,date:body.date,status,by:user.name,at})));
 return body.entries.length;
}
export function addWork(state,user,body,allowed,now=Date.now()){
 if(!allowed.has(body.classId))fail('You cannot post work for this class.',403);
 const title=text(body.title,120),details=text(body.details??'',1000);
 if(!title||details===null)fail('Enter a title of up to 120 characters.');
 if(!['homework','exam'].includes(body.type))fail('Choose homework or exam.');
 if(!validDate(body.dueDate)||body.dueDate<today(state,now))fail('Choose a due date from today onwards.');
 const row={id:newId(),classId:body.classId,type:body.type,title,details,dueDate:body.dueDate,byId:user.id,byName:user.name,at:new Date(now).toISOString()};
 const cutoff=dateOf(today(state,now),-90);state.workItems=state.workItems.filter(item=>item.dueDate>=cutoff).concat(row);return row;
}
export function removeWork(state,user,id){
 const row=state.workItems.find(item=>item.id===id);if(!row)fail('Item not found.',404);
 if(user.role==='teacher'&&row.byId!==user.id)fail('You can remove only what you posted.',403);
 state.workItems=state.workItems.filter(item=>item!==row);
}
export function requestAbsence(state,parent,body,now=Date.now()){
 if(!parent.studentIds.includes(body.studentId))fail('Student not found.',404);
 const student=state.students.find(row=>row.id===body.studentId),reason=text(body.reason??'',300),current=today(state,now);if(!student)fail('Student not found.',404);
 if(reason===null)fail('Keep the reason within 300 characters.');
 if(!validDate(body.from)||!validDate(body.to)||body.to<body.from||body.from<current||(Date.parse(body.to)-Date.parse(body.from))/day>=14)fail('Choose dates from today onwards, up to 14 days.');
 if(state.absenceRequests.filter(row=>row.studentId===body.studentId&&row.status==='pending').length>=10)fail('This student already has too many pending requests.');
 const row={id:newId(),studentId:student.id,classId:student.classId,parentId:parent.id,from:body.from,to:body.to,reason,status:'pending',at:new Date(now).toISOString()};
 state.absenceRequests=state.absenceRequests.slice(-5000).concat(row);return row;
}
export function decideAbsence(state,user,body,allowed,now=Date.now()){
 const row=state.absenceRequests.find(item=>item.id===body.id);if(!row||row.status!=='pending')fail('This request has already been answered.',404);
 if(allowed&&!allowed.has(row.classId))fail('You cannot answer requests for this class.',403);
 if(!['approved','declined'].includes(body.status))fail('Choose approve or decline.');
 row.status=body.status;row.decidedBy=user.name;row.decidedAt=new Date(now).toISOString();
 if(body.status==='approved')for(let date=row.from;date<=row.to;date=dateOf(date,1))if(!state.attendance.some(item=>item.studentId===row.studentId&&item.date===date))state.attendance.push({studentId:row.studentId,classId:row.classId,date,status:'excused',by:user.name,at:row.decidedAt});
 return row;
}
export function setParentStatus(state,id,action,revoke){
 const parent=state.users.find(row=>row.id===id&&row.role==='parent');if(!parent)fail('Parent not found.',404);
 if(!['disable','enable','remove'].includes(action))fail('Choose an action.');
 revoke(state,id);
 if(action==='remove'){state.users=state.users.filter(row=>row!==parent);state.absenceRequests=state.absenceRequests.filter(row=>row.parentId!==id);state.teacherMessages=state.teacherMessages.filter(row=>row.userId!==id);}else parent.active=action==='enable';
}
export const staffRecords=state=>{const parents=state.users.filter(row=>row.role==='parent');return {students:state.students.map(row=>({...row,parents:parents.filter(parent=>parent.studentIds.includes(row.id)).length})),parents:parents.map(({id,name,email,active,studentIds})=>({id,name,email,active:active!==false,studentIds})),absenceRequests:state.absenceRequests.filter(row=>row.status==='pending')};};
export const backupRecords=state=>({students:state.students,attendance:state.attendance,workItems:state.workItems,absenceRequests:state.absenceRequests});
export function restoreRecords(backup,state,classes){
 if(!Array.isArray(backup.students))return {};
 const students=backup.students.filter(row=>typeof row?.id==='string'&&classes.some(group=>group.id===row.classId)&&typeof row.nameEn==='string'&&typeof row.nameAr==='string').map(({id,nameEn,nameAr,classId})=>({id,nameEn,nameAr,classId})),ids=new Set(students.map(row=>row.id)),list=value=>Array.isArray(value)?value:[];
 for(const user of state.users)if(user.role==='parent')user.studentIds=user.studentIds.filter(id=>ids.has(id));
 return {students,attendance:list(backup.attendance).filter(row=>ids.has(row?.studentId)),workItems:list(backup.workItems).filter(row=>classes.some(group=>group.id===row?.classId)),absenceRequests:list(backup.absenceRequests).filter(row=>ids.has(row?.studentId))};
}
