import {effectiveRows,teacherKey} from './schedule.mjs';
const overlaps=(a,b)=>a.start<b.end&&b.start<a.end;
export const rowTeacherKeys=row=>[teacherKey(row.teacherEn),teacherKey(row.teacherAr)].filter(Boolean);
export const teachesRow=(row,keys)=>row.type==='lesson'&&rowTeacherKeys(row).some(key=>keys.includes(key));
export const dateDay=date=>new Date(date+'T12:00:00Z').getUTCDay();
// Arabic and English spellings on the same lesson identify one teacher.
export function teacherDirectory(rows){
 let entries=[];
 for(const row of rows){
  if(row.type!=='lesson')continue;
  const keys=rowTeacherKeys(row);if(!keys.length)continue;
  const matches=entries.filter(entry=>entry.keys.some(key=>keys.includes(key)));
  entries=entries.filter(entry=>!matches.includes(entry));
  entries.push({en:row.teacherEn||matches.find(entry=>entry.en)?.en||'',ar:row.teacherAr||matches.find(entry=>entry.ar)?.ar||'',keys:[...new Set([...matches.flatMap(entry=>entry.keys),...keys])]});
 }
 return entries;
}
export function roomConflicts(rows){
 const conflicts=[],lessons=rows.filter(row=>row.type==='lesson'&&teacherKey(row.room));
 for(let i=0;i<lessons.length;i++)for(let j=i+1;j<lessons.length;j++){
  const a=lessons[i],b=lessons[j];
  if(a.day===b.day&&(a.classId||'default')!==(b.classId||'default')&&teacherKey(a.room)===teacherKey(b.room)&&overlaps(a,b))conflicts.push({first:a.id,second:b.id,room:a.room,day:a.day,start:a.start>b.start?a.start:b.start,classIds:[a.classId||'default',b.classId||'default']});
 }
 return conflicts;
}
export function daySchedule(schedule,specialDays,date){return effectiveRows(schedule,specialDays,date,dateDay(date));}
export function teacherLessonsOn(schedule,specialDays,date,keys){return daySchedule(schedule,specialDays,date).filter(row=>teachesRow(row,keys)).sort((a,b)=>a.start.localeCompare(b.start));}
// Fewest lessons first, so cover is shared rather than falling on one teacher.
export function freeTeachers(schedule,specialDays,date,slot,exclude=[]){
 const today=daySchedule(schedule,specialDays,date);
 return teacherDirectory([...schedule,...today]).filter(entry=>!entry.keys.some(key=>exclude.includes(key))&&!today.some(row=>teachesRow(row,entry.keys)&&overlaps(row,slot))).map(entry=>({...entry,load:today.filter(row=>teachesRow(row,entry.keys)).length})).sort((a,b)=>a.load-b.load||(a.en||a.ar).localeCompare(b.en||b.ar));
}
export function applyCover({schedule,specialDays,date,assignments,makeId}){
 const day=dateDay(date);let next=[...specialDays];
 for(const classId of new Set(assignments.map(row=>row.classId))){
  const existing=next.find(row=>row.date===date&&row.classId===classId),base=existing?existing.schedule:schedule.filter(row=>row.day===day&&(row.classId||'default')===classId);
  const rows=base.map(row=>{const cover=assignments.find(item=>item.classId===classId&&item.id===row.id);return cover?{...row,teacherEn:cover.teacherEn,teacherAr:cover.teacherAr,teacherImage:'',substituteFor:row.substituteFor||row.teacherEn||row.teacherAr}:row;});
  const item={...(existing||{id:makeId(),date,classId,mode:'replace',nameEn:'Teacher cover',nameAr:'تغطية حصص'}),schedule:rows};
  next=existing?next.map(row=>row===existing?item:row):[...next,item];
 }
 return next;
}
