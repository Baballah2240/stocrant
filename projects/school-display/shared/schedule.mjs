export function schoolClock(now, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23', weekday:'short'}).formatToParts(now).map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`, day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday), seconds:Number(parts.hour)*3600+Number(parts.minute)*60+Number(parts.second)};
}
export const minutes = time => Number(time.slice(0,2))*60+Number(time.slice(3,5));
export function validateSchedule(input) {
  if (!Array.isArray(input) || input.length>300) throw new Error('Invalid timetable.');
  const ids=new Set();
  for (const row of input) {
    if (!row || typeof row.id!=='string' || row.id.length>80 || ids.has(row.id)) throw new Error('Each timetable entry needs a unique ID.');
    ids.add(row.id);
    if (!Number.isInteger(row.day) || row.day<0 || row.day>6 || !['lesson','break','event'].includes(row.type)) throw new Error('Choose a valid day and activity.');
    if (![row.start,row.end].every(t=>typeof t==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || minutes(row.end)<=minutes(row.start)) throw new Error('End time must be after start time on the same day.');
    for(const key of ['subjectEn','subjectAr','teacherEn','teacherAr','room']) if(typeof row[key]!=='string' || row[key].length>120) throw new Error('Keep timetable text within 120 characters.');
    if (!row.subjectEn.trim() && !row.subjectAr.trim()) throw new Error('Add an activity name in Arabic or English.');
    if (row.type==='lesson' && !row.teacherEn.trim() && !row.teacherAr.trim()) throw new Error('Add the lesson teacher.');
  }
  for(let day=0;day<7;day++) {
    const list=input.filter(r=>r.day===day).sort((a,b)=>a.start.localeCompare(b.start));
    for(let i=1;i<list.length;i++) if(list[i].start<list[i-1].end) throw new Error('Timetable entries cannot overlap on the same day.');
  }
  return input.map(({id,day,type,start,end,subjectEn,subjectAr,teacherEn,teacherAr,room})=>({id,day,type,start,end,subjectEn:subjectEn.trim(),subjectAr:subjectAr.trim(),teacherEn:teacherEn.trim(),teacherAr:teacherAr.trim(),room:room.trim()}));
}
export function scheduleState(schedule,settings,now=new Date()) {
  const clock=schoolClock(now,settings.timezone);
  if(settings.holidays.includes(clock.date)) return {phase:'holiday',current:null,next:null,remaining:0,clock};
  const list=schedule.filter(r=>r.day===clock.day).sort((a,b)=>a.start.localeCompare(b.start));
  const current=list.find(r=>minutes(r.start)*60<=clock.seconds && clock.seconds<minutes(r.end)*60) || null;
  const next=list.find(r=>minutes(r.start)*60>clock.seconds) || null;
  const phase=current?current.type:!list.length?'no-school':clock.seconds<minutes(list[0].start)*60?'before-school':next?'gap':'finished';
  return {phase,current,next,remaining:current?minutes(current.end)*60-clock.seconds:next?minutes(next.start)*60-clock.seconds:0,clock};
}
export function displayPresentation(state,settings,enabled=true){
  if(!enabled||settings.paused||state.current?.type==='lesson')return 'panel';
  if(state.phase==='break')return settings.fullscreenBreaks!==false?'break':'panel';
  return !state.current&&!state.next?'clock':'panel';
}
export function sampleSchedule() {
  return [0,1,2,3,4].flatMap(day=>[
    {id:`${day}-1`,day,type:'lesson',start:'07:30',end:'08:15',subjectEn:'Mathematics',subjectAr:'الرياضيات',teacherEn:'Ahmed Hassan',teacherAr:'أحمد حسن',room:'Grade 6 · A'},
    {id:`${day}-2`,day,type:'lesson',start:'08:15',end:'09:00',subjectEn:'English',subjectAr:'اللغة الإنجليزية',teacherEn:'Sara Ali',teacherAr:'سارة علي',room:'Grade 6 · A'},
    {id:`${day}-3`,day,type:'break',start:'09:00',end:'09:20',subjectEn:'Morning break',subjectAr:'الفسحة الصباحية',teacherEn:'',teacherAr:'',room:''},
    {id:`${day}-4`,day,type:'lesson',start:'09:20',end:'10:05',subjectEn:'Science',subjectAr:'العلوم',teacherEn:'Omar Khalid',teacherAr:'عمر خالد',room:'Grade 6 · A'},
    {id:`${day}-5`,day,type:'lesson',start:'10:05',end:'10:50',subjectEn:'Arabic',subjectAr:'اللغة العربية',teacherEn:'Noura Salem',teacherAr:'نورة سالم',room:'Grade 6 · A'}
  ]);
}
