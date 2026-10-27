import {validateSchedule,teacherConflicts,effectiveRows} from '../shared/schedule.mjs';
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function previewTime(date,time,timezone){
 if(!validDate(date)||typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail('Choose a valid preview date and time.');
 const target=Date.parse(date+'T'+time+':00Z');let guess=target;
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const localValue=instant=>{const p=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part=>[part.type,part.value]));return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);};
 for(let i=0;i<4;i++){const delta=target-localValue(guess);if(!delta)return guess;guess+=delta;}
 fail('This local time does not exist in the school timezone.');
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
export function validateAnnouncement(body,classes){
 if(!body||!Array.isArray(body.classIds)||!body.classIds.length||body.classIds.some(id=>!classes.some(c=>c.id===id)))fail('Choose announcement classes.');
 if(['textEn','textAr'].some(k=>typeof body[k]!=='string'||body[k].length>500)||!body.textEn.trim()&&!body.textAr.trim())fail('Enter an announcement in Arabic or English.');
 const expiresAt=Date.parse(body.expiresAt);if(!Number.isFinite(expiresAt)||expiresAt<=Date.now()||expiresAt>Date.now()+7*86400000)fail('Choose an expiry within seven days.');
 return {classIds:[...new Set(body.classIds)],textEn:body.textEn.trim(),textAr:body.textAr.trim(),expiresAt:new Date(expiresAt).toISOString()};
}
