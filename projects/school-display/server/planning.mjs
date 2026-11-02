import {roomConflicts,daySchedule} from '../shared/teachers.mjs';
import {validateSchedule,teacherConflicts,effectiveRows,schoolInstant} from '../shared/schedule.mjs';
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function previewTime(date,time,timezone){
 if(!validDate(date)||typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail('Choose a valid preview date and time.');
 const instant=schoolInstant(date,time,timezone);if(instant===null)fail('This local time does not exist in the school timezone.');return instant;
}
export function validateSpecialDays(input,classes){
 if(!Array.isArray(input)||input.length>2000)fail('Use up to 2000 special days.');
 const keys=new Set(),ids=new Set();let entries=0;
 return input.map(item=>{
  if(!item||typeof item.id!=='string'||!/^[\w-]{1,80}$/.test(item.id)||!validDate(item.date)||!classes.some(c=>c.id===item.classId)||!['replace','cancel'].includes(item.mode)||ids.has(item.id))fail('Check the special day, date and class.');
  ids.add(item.id);const key=item.classId+':'+item.date;if(keys.has(key))fail('Use one special schedule per class and date.');keys.add(key);
  if(['nameEn','nameAr'].some(k=>typeof item[k]!=='string'||item[k].length>120)||!item.nameEn.trim()&&!item.nameAr.trim())fail('Name this special day in Arabic or English.');
  if(!Array.isArray(item.schedule)||item.schedule.length>100)fail('Use up to 100 activities per special day.');
  entries+=item.schedule.length;if(entries>20000)fail('Use up to 20000 special-day activities.');
  const day=new Date(item.date+'T12:00:00Z').getUTCDay();
  const schedule=item.mode==='cancel'?[]:validateSchedule(item.schedule.map(row=>({...row,day,classId:item.classId})));
  return {id:item.id,classId:item.classId,date:item.date,mode:item.mode,nameEn:item.nameEn.trim(),nameAr:item.nameAr.trim(),schedule};
 });
}
export function publicationIssues(schedule,specialDays,holidays=[]){
 const issues=teacherConflicts(schedule).map(issue=>({...issue,date:null}));
 for(const date of new Set(specialDays.map(row=>row.date))){
  if(holidays.includes(date))continue;
  const day=new Date(date+'T12:00:00Z').getUTCDay();
  issues.push(...teacherConflicts(effectiveRows(schedule,specialDays,date,day)).map(issue=>({...issue,date})));
 }
 return issues;
}
export const roomWarnings=(schedule,specialDays,holidays=[])=>[...roomConflicts(schedule).map(issue=>({...issue,date:null})),...[...new Set(specialDays.map(row=>row.date))].filter(date=>!holidays.includes(date)).flatMap(date=>roomConflicts(daySchedule(schedule,specialDays,date)).map(issue=>({...issue,date})))];
export function validateAnnouncement(body,classes){
 if(!body||!Array.isArray(body.classIds)||!body.classIds.length||body.classIds.some(id=>!classes.some(c=>c.id===id)))fail('Choose announcement classes.');
 if(['textEn','textAr'].some(k=>typeof body[k]!=='string'||body[k].length>500)||!body.textEn.trim()&&!body.textAr.trim())fail('Enter an announcement in Arabic or English.');
 const expiresAt=Date.parse(body.expiresAt);if(!Number.isFinite(expiresAt)||expiresAt<=Date.now()||expiresAt>Date.now()+7*86400000)fail('Choose an expiry within seven days.');
 return {classIds:[...new Set(body.classIds)],textEn:body.textEn.trim(),textAr:body.textAr.trim(),expiresAt:new Date(expiresAt).toISOString()};
}
