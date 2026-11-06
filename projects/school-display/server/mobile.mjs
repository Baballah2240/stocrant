import {createHash,randomBytes} from 'node:crypto';
import {teacherKey} from '../shared/schedule.mjs';
import {rowTeacherKeys,teacherDirectory} from '../shared/teachers.mjs';
import {inboxPayload} from './inbox.mjs';
// The bundled Capacitor app loads from these origins. Authorization is a bearer token, never a cookie.
export const mobileOrigins=new Set(['https://localhost','capacitor://localhost']);
const lifetime=90*86400000,digest=value=>createHash('sha256').update(String(value)).digest('hex');
const bearer=header=>typeof header==='string'&&header.startsWith('Bearer ')?digest(header.slice(7)):null;
export function issueToken(state,user,now=Date.now()){
 const token=randomBytes(32).toString('hex'),own=state.mobileTokens.filter(row=>row.userId===user.id&&row.expires>now).slice(-4);
 state.mobileTokens=state.mobileTokens.filter(row=>row.userId!==user.id&&row.expires>now).concat(own,{hash:digest(token),userId:user.id,expires:now+lifetime});
 return {token,expiresAt:new Date(now+lifetime).toISOString()};
}
export function tokenUser(state,users,header,now=Date.now()){
 const value=bearer(header),row=value&&state.mobileTokens.find(item=>item.hash===value&&item.expires>now);
 return row?users.find(user=>user.id===row.userId&&user.active!==false)||null:null;
}
export const revokeToken=(state,header)=>{const value=bearer(header);state.mobileTokens=state.mobileTokens.filter(row=>row.hash!==value);};
export const revokeUserTokens=(state,userId)=>{state.mobileTokens=state.mobileTokens.filter(row=>row.userId!==userId);};
const messageLife=30*86400000;
export {sendTeacherMessage} from './inbox.mjs';
// Only the administrator-set timetable name reaches other classes. A self-edited
// account name can match lessons only inside classes already assigned to that person.
export function teacherPayload(state,user,now=Date.now()){
 const assigned=new Set(user.role==='teacher'?user.classIds:state.publishedClasses.map(row=>row.id)),declared=teacherKey(user.teacherName),allRows=[...state.published,...state.publishedSpecialDays.flatMap(row=>row.schedule)];
 const own=declared||teacherKey(user.name),keys=teacherDirectory(allRows).find(entry=>entry.keys.includes(own))?.keys||[own];
 const inScope=classId=>assigned.has(classId),allowed=classId=>Boolean(declared)||inScope(classId);
 const flag=(row,classId)=>{const {teacherImage,actionImage,...rest}=row,mine=row.type==='lesson'&&allowed(classId)&&rowTeacherKeys(row).some(key=>keys.includes(key)),coveredBy=!mine&&row.type==='lesson'&&allowed(classId)&&Boolean(row.substituteFor)&&keys.includes(teacherKey(row.substituteFor));return {...rest,substituteFor:mine&&keys.includes(teacherKey(row.substituteFor))?'':row.substituteFor||'',classId,mine,coveredBy};};
 const keep=row=>inScope(row.classId)||row.mine||row.coveredBy;
 const schedule=state.published.map(row=>flag(row,row.classId||'default')).filter(keep);
 const flagged=state.publishedSpecialDays.map(item=>({...item,schedule:item.schedule.map(row=>flag(row,item.classId))}));
 const classIds=new Set([...assigned,...schedule.map(row=>row.classId),...flagged.filter(item=>item.schedule.some(row=>row.mine||row.coveredBy)).map(item=>item.classId)]);
 const {settings}=state;
 const ownClasses=row=>classIds.has(row.classId),studentIds=new Set(state.students.filter(ownClasses).map(row=>row.id));
 return {format:'teacher-1',role:'teacher',students:state.students.filter(ownClasses),attendance:state.attendance.filter(row=>studentIds.has(row.studentId)&&now-Date.parse(row.at)<8*86400000),work:state.workItems.filter(ownClasses),absenceRequests:state.absenceRequests.filter(ownClasses).filter(row=>row.status==='pending'),school:{nameEn:settings.schoolEn,nameAr:settings.schoolAr,timezone:settings.timezone,holidays:settings.holidays,accent:settings.themeAccent,announcementEn:settings.announcementEn,announcementAr:settings.announcementAr},teacher:{name:user.name,email:user.email,timetableName:user.teacherName||''},classes:state.publishedClasses.filter(row=>classIds.has(row.id)).map(({id,nameEn,nameAr})=>({id,nameEn,nameAr})),schedule,specialDays:flagged.filter(item=>classIds.has(item.classId)).map(item=>({...item,schedule:item.schedule.filter(keep)})),announcements:state.announcements.filter(row=>Date.parse(row.expiresAt)>now&&row.classIds.some(id=>classIds.has(id))).map(({id,textEn,textAr,expiresAt})=>({id,textEn,textAr,expiresAt})),...inboxPayload(state,user,now),subjects:[...new Set(schedule.filter(row=>row.mine&&row.type==='lesson').map(row=>row.subjectEn||row.subjectAr).filter(Boolean))],revision:state.revision,publishedAt:state.publishedAt,serverTime:now};
}
// Parents see only the classes of their linked children, and never other students.
export function parentPayload(state,user,now=Date.now()){
 const children=state.students.filter(row=>user.studentIds.includes(row.id)),childIds=new Set(children.map(row=>row.id)),classIds=new Set(children.map(row=>row.classId)),ownClass=row=>classIds.has(row.classId||'default');
 const shape=(row,classId)=>{const {teacherImage,actionImage,substituteFor,...rest}=row;return {...rest,classId,mine:true,coveredBy:false,substituteFor:''};};
 const {settings}=state,cutoff=now-60*86400000;
 return {format:'teacher-1',role:'parent',children,students:children,school:{nameEn:settings.schoolEn,nameAr:settings.schoolAr,timezone:settings.timezone,holidays:settings.holidays,accent:settings.themeAccent,announcementEn:settings.announcementEn,announcementAr:settings.announcementAr},teacher:{name:user.name,email:user.email,timetableName:''},classes:state.publishedClasses.filter(row=>classIds.has(row.id)).map(({id,nameEn,nameAr})=>({id,nameEn,nameAr})),schedule:state.published.filter(ownClass).map(row=>shape(row,row.classId||'default')),specialDays:state.publishedSpecialDays.filter(ownClass).map(item=>({...item,schedule:item.schedule.map(row=>shape(row,item.classId))})),announcements:state.announcements.filter(row=>Date.parse(row.expiresAt)>now&&row.classIds.some(id=>classIds.has(id))).map(({id,textEn,textAr,expiresAt})=>({id,textEn,textAr,expiresAt})),messages:state.teacherMessages.filter(row=>row.userId===user.id&&row.direction!=='up'&&now-Date.parse(row.at)<messageLife).slice(-50).map(({id,text,fromName,at})=>({id,text,fromName,at})),attendance:state.attendance.filter(row=>childIds.has(row.studentId)&&Date.parse(row.at)>cutoff),work:state.workItems.filter(ownClass).map(({byId,...row})=>row),absenceRequests:state.absenceRequests.filter(row=>row.parentId===user.id),revision:state.revision,publishedAt:state.publishedAt,serverTime:now};
}
