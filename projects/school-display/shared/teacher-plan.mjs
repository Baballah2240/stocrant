import {effectiveRows,minutes,schoolClock,schoolInstant} from './schedule.mjs';
const addDays=(date,count)=>new Date(Date.parse(date+'T12:00:00Z')+count*86400000).toISOString().slice(0,10);
const byStart=(a,b)=>a.start.localeCompare(b.start);
export function dayPlan(data,date,day){
 const holiday=data.school.holidays.includes(date),specials=data.specialDays.filter(row=>row.date===date);
 return {date,day,holiday,specials,rows:holiday?[]:effectiveRows(data.schedule,data.specialDays,date,day).sort(byStart)};
}
export function weekPlan(data,now=new Date(),count=7){
 const clock=schoolClock(now,data.school.timezone);
 return Array.from({length:count},(_,i)=>dayPlan(data,addDays(clock.date,i),(clock.day+i)%7));
}
export function teacherNow(data,now=new Date()){
 const clock=schoolClock(now,data.school.timezone),week=weekPlan(data,now,14),today=week[0],mine=today.rows.filter(row=>row.mine);
 const current=mine.find(row=>minutes(row.start)*60<=clock.seconds&&clock.seconds<minutes(row.end)*60)||null;
 const next=mine.find(row=>minutes(row.start)*60>clock.seconds)||null;
 const later=next||current?null:week.slice(1).find(day=>day.rows.some(row=>row.mine))||null;
 const span=current?(minutes(current.end)-minutes(current.start))*60:0;
 return {clock,today,mine,current,next,later,laterLesson:later?.rows.find(row=>row.mine)||null,remaining:current?minutes(current.end)*60-clock.seconds:next?minutes(next.start)*60-clock.seconds:0,progress:current?1-(minutes(current.end)*60-clock.seconds)/span:0};
}
const reminderId=value=>{let hash=7;for(const char of value)hash=(hash*31+char.charCodeAt(0))%2147483647;return hash;};
// Android and iOS cap pending notifications, so only the nearest lessons are scheduled.
export function lessonReminders(data,now=new Date(),lead=10,limit=60){
 if(!lead)return [];
 return weekPlan(data,now,7).flatMap(day=>day.rows.filter(row=>row.mine).map(row=>({id:reminderId(day.date+row.classId+row.start),at:schoolInstant(day.date,row.start,data.school.timezone)-lead*60000,row,date:day.date}))).filter(item=>item.at>now.getTime()).sort((a,b)=>a.at-b.at).slice(0,limit);
}
