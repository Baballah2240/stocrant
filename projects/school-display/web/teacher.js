import {t,language,setLanguage,dayName,escape as e} from './teacher-i18n.js';
import {teacherNow,weekPlan,lessonReminders} from './teacher-plan.mjs';
import {schoolClock} from './schedule.mjs';
const root=document.querySelector('#app'),native=Boolean(window.Capacitor?.isNativePlatform?.()),notifications=()=>window.capacitorLocalNotifications?.LocalNotifications;
const read=key=>{try{return localStorage.getItem(key);}catch{return null;}},write=(key,value)=>{try{value===null?localStorage.removeItem(key):localStorage.setItem(key,value);}catch{}};
const server=native?window.SCHOOL_APP_SERVER:'';
let token=read('teacher-token'),data=null,tab='today',online=true,selectedDay=0,weekView='mine',lastKey='',offset=0,syncing=false,authMode='login',childId=read('parent-child'),classId=null,marks={};
try{data=JSON.parse(read('teacher-data'));offset=Number(read('teacher-offset'))||0;}catch{data=null;}
const idList=key=>{try{return JSON.parse(read(key))||[];}catch{return [];}};
const isParent=()=>data?.role==='parent',messages=()=>data?.messages||[],unread=()=>{const seen=idList('teacher-read-messages');return messages().filter(row=>!seen.includes(row.id));};
const markRead=()=>write('teacher-read-messages',JSON.stringify(messages().map(row=>row.id)));
const now=()=>new Date(Date.now()+offset),pick=(row,key)=>language==='ar'?row[key+'Ar']||row[key+'En']:row[key+'En']||row[key+'Ar'],className=id=>{const group=data.classes.find(row=>row.id===id);return group?pick(group,'name'):'';};
const child=()=>(data.children||[]).find(row=>row.id===childId)||data.children?.[0]||null,studentName=id=>{const row=(data.students||[]).find(item=>item.id===id);return row?pick(row,'name'):'';};
const todayDate=()=>schoolClock(now(),data.school.timezone).date;
// A parent's timetable is the selected child's class, so the shared day logic applies unchanged.
const view=()=>{if(!isParent())return data;const classOf=child()?.classId;return {...data,schedule:data.schedule.filter(row=>row.classId===classOf),specialDays:data.specialDays.filter(row=>row.classId===classOf)};};
function toast(message,bad=false){const node=document.querySelector('#toast');node.textContent=t(message);node.className=bad?'show bad':'show';clearTimeout(toast.timer);toast.timer=setTimeout(()=>{node.className='';},4000);}
async function api(path,body){const res=await fetch(server+'/api/mobile/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await res.json();if(!res.ok)throw Object.assign(Error(result.error),{status:res.status});return result;}
function clearAccount(){token=null;data=null;tab='today';selectedDay=0;lastKey='';childId=null;classId=null;marks={};for(const key of ['teacher-token','teacher-data','teacher-offset','teacher-read-messages','teacher-notified-messages','parent-child'])write(key,null);scheduleReminders();}
function applyData(fresh){data=fresh;offset=fresh.serverTime-Date.now();write('teacher-data',JSON.stringify(fresh));write('teacher-offset',String(offset));write('teacher-synced',new Date().toISOString());if(/^#[a-f0-9]{6}$/i.test(fresh.school.accent))document.documentElement.style.setProperty('--accent',fresh.school.accent);}
// Unsaved typing is never replaced by a background update; the next update after saving shows it.
const softRender=()=>{if(!root.querySelector('form[data-dirty]'))render();};
async function sync(announce=false){
 if(!token||syncing)return;syncing=true;
 try{const fresh=await api('timetable');const changed=JSON.stringify({...fresh,serverTime:0})!==JSON.stringify({...data,serverTime:0});applyData(fresh);const was=online;online=true;if(tab==='messages')markRead();if(changed||!was)softRender();if(changed){await scheduleReminders();await announce_();}if(announce)toast('Updated.');}
 catch(error){if(error.status===401){clearAccount();render();toast('Your account was signed out. Sign in again.',true);}else{const was=online;online=false;if(was)softRender();if(announce)toast('Could not update. The saved timetable is still available.',true);}}
 finally{syncing=false;}
}
function alertItems(){
 const items=messages().map(row=>({id:row.id,title:t('New message from school'),body:row.text}));
 if(isParent()){
  for(const row of data.attendance||[])if(row.status==='absent'||row.status==='late')items.push({id:`a${row.studentId}${row.date}${row.status}`,title:`${studentName(row.studentId)}: ${t(row.status==='absent'?'Marked absent':'Marked late')}`,body:row.date});
  for(const row of data.work||[])items.push({id:'w'+row.id,title:`${t(row.type==='exam'?'New exam':'New homework')}: ${row.title}`,body:`${className(row.classId)} · ${row.dueDate}`});
  for(const row of data.absenceRequests||[])if(row.status!=='pending')items.push({id:`r${row.id}${row.status}`,title:t(row.status==='approved'?'Absence approved':'Absence declined'),body:`${studentName(row.studentId)} · ${row.from}`});
 }else for(const row of data?.absenceRequests||[])items.push({id:'r'+row.id,title:t('New absence request'),body:`${studentName(row.studentId)} · ${row.from}`});
 return items;
}
const markNotified=()=>write('teacher-notified-messages',JSON.stringify(alertItems().map(row=>row.id)));
const alertNumber=id=>{let hash=11;for(const char of id)hash=(hash*33+char.charCodeAt(0))%2147483647;return hash;};
// Shown while the app runs. A phone notification also appears if the app has been sent to the background.
async function announce_(){
 const known=idList('teacher-notified-messages'),fresh=alertItems().filter(row=>!known.includes(row.id));if(!fresh.length)return;markNotified();
 if(tab!=='messages'||fresh.some(row=>!messages().some(item=>item.id===row.id)))toast(fresh[0].title);
 const plugin=notifications();if(!native||!plugin)return;
 try{const permission=await plugin.requestPermissions();if(permission.display==='granted')await plugin.schedule({notifications:fresh.slice(0,10).map(row=>({id:alertNumber(row.id),title:row.title,body:row.body,schedule:{at:new Date(Date.now()+1000),allowWhileIdle:true}}))});}catch{}
}
async function scheduleReminders(){
 const plugin=notifications();if(!native||!plugin)return;
 try{
  const pending=await plugin.getPending();if(pending.notifications.length)await plugin.cancel({notifications:pending.notifications.map(({id})=>({id}))});
  const lead=Number(read('teacher-reminder')||0);if(!lead||!data||!token||isParent())return;
  await plugin.schedule({notifications:lessonReminders(data,now(),lead).map(item=>({id:item.id,title:`${t('Lesson in')} ${lead} ${t('minutes')}: ${pick(item.row,'subject')}`,body:[className(item.row.classId),item.row.room,item.row.start].filter(Boolean).join(' · '),schedule:{at:new Date(item.at-offset),allowWhileIdle:true}}))});
 }catch{toast('Allow notifications in your phone settings to get reminders.',true);}
}
const duration=seconds=>{const m=Math.ceil(seconds/60);return m>=60?`${Math.floor(m/60)} ${t('h')} ${m%60} ${t('min')}`:`${m} ${t('min')}`;};
const lessonMeta=row=>(isParent()?[row.type==='lesson'?pick(row,'teacher'):'',row.room]:[className(row.classId),row.room]).filter(Boolean).map(e).join(' · ');
function lessonRow(row,state){
 const current=state?.current===row,past=state&&!current&&row.end<=clockText(state.clock);
 return `<article class="lesson ${row.type} ${row.mine?'mine':''} ${row.coveredBy?'covered':''} ${current?'current':''} ${past?'past':''}"><time>${e(row.start)}<small>${e(row.end)}</small></time><div><strong>${e(pick(row,'subject'))}</strong><small>${lessonMeta(row)}</small>${row.type==='lesson'&&!row.mine?`<small>${e(pick(row,'teacher'))}</small>`:''}${row.mine&&row.substituteFor?`<span class="tag">${t('Cover for')} ${e(row.substituteFor)}</span>`:''}${row.coveredBy?`<span class="tag warn">${t('Covered by')} ${e(pick(row,'teacher'))}</span>`:''}</div></article>`;
}
const clockText=clock=>String(Math.floor(clock.seconds/3600)).padStart(2,'0')+':'+String(Math.floor(clock.seconds%3600/60)).padStart(2,'0');
function hero(state){
 const row=state.current||state.next,parent=isParent();
 if(row)return `<section class="hero ${state.current?'live':''}"><span class="eyebrow">${t(state.current?(parent?(row.type==='break'?'On a break now':'In class now'):'Teaching now'):'Next lesson')}</span><h1>${e(pick(row,'subject'))}</h1><p>${lessonMeta(row)||'&nbsp;'}</p><div class="hero-time"><strong data-countdown>${duration(state.remaining)}</strong><span>${t(state.current?'left':'starts in')}</span><time>${e(row.start)} – ${e(row.end)}</time></div>${state.current?`<progress data-progress max="1" value="${state.progress}"></progress>`:''}</section>`;
 const title=state.today.holiday?'School holiday':state.mine.length?(parent?'School has finished for today':'No more lessons today'):'No lessons today';
 return `<section class="hero quiet"><span class="eyebrow">${e(dayName(state.clock.day))}</span><h1>${t(title)}</h1>${state.laterLesson?`<p>${t(parent?'Next school day':'Your next lesson')}: ${e(pick(state.laterLesson,'subject'))}<br>${e(dayName(state.later.day))} · ${e(state.later.date)} · ${e(state.laterLesson.start)}</p>`:''}</section>`;
}
const childPicker=()=>isParent()&&data.children.length>1?`<nav class="child-strip" aria-label="${t('Children')}">${data.children.map(row=>`<button type="button" data-child="${e(row.id)}" class="${row.id===child().id?'selected':''}">${e(pick(row,'name'))}</button>`).join('')}</nav>`:'';
const statusTag=status=>`<span class="tag ${status==='present'?'':status==='excused'?'':'warn'}">${t({present:'Present',absent:'Absent',late:'Late',excused:'Excused',pending:'Waiting for the school',approved:'Approved',declined:'Declined'}[status])}</span>`;
const workRow=(row,canRemove=false)=>`<article class="lesson"><time>${e(row.dueDate.slice(5))}</time><div><strong>${e(row.title)}</strong><small>${e(className(row.classId))} · ${e(row.byName)}</small>${row.details?`<small class="pre">${e(row.details)}</small>`:''}<span class="tag ${row.type==='exam'?'warn':''}">${t(row.type==='exam'?'Exam':'Homework')}</span>${canRemove?`<button type="button" class="ghost danger small" data-remove-work="${e(row.id)}">${t('Remove')}</button>`:''}</div></article>`;
const upcomingWork=(classOf,list=data.work||[])=>list.filter(row=>row.classId===classOf&&row.dueDate>=todayDate()).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
function noticesCard(){const notices=[...data.announcements.map(row=>pick(row,'text')),pick(data.school,'announcement')].filter(Boolean);return notices.length?`<section class="card"><h2>${t('Announcements')}</h2>${notices.map(text=>`<p>${e(text)}</p>`).join('')}</section>`:'';}
function changesCard(state){return state.today.specials.length&&!state.today.holiday?`<section class="card change"><strong>${t('Timetable change today')}</strong>${state.today.specials.map(row=>`<p>${e(pick(row,'name'))} · ${e(className(row.classId))}</p>`).join('')}</section>`:'';}
function parentToday(){
 const kid=child();if(!kid)return `<section class="card notice"><strong>${t('No children are linked to this account.')}</strong><p>${t('Add a child in Settings with the code from your school.')}</p></section>`;
 const state=teacherNow(view(),now()),mark=(data.attendance||[]).find(row=>row.studentId===kid.id&&row.date===state.clock.date),due=upcomingWork(kid.classId).slice(0,3);
 return `${childPicker()}${hero(state)}${mark?`<section class="card status-line"><strong>${t('Attendance today')}</strong>${statusTag(mark.status)}</section>`:''}${changesCard(state)}<section class="card"><h2>${t('Today')} · ${e(pick(kid,'name'))}</h2>${state.mine.map(row=>lessonRow(row,state)).join('')||`<p class="empty">${t('No lessons are scheduled.')}</p>`}</section>${due.length?`<section class="card"><h2>${t('Coming up')}</h2>${due.map(row=>workRow(row)).join('')}</section>`:''}${noticesCard()}`;
}
function today(){
 if(isParent())return parentToday();
 const state=teacherNow(data,now()),covered=state.today.rows.filter(row=>row.coveredBy),hasLessons=weekPlan(data,now(),14).some(day=>day.rows.some(row=>row.mine||row.coveredBy));
 return `${hero(state)}${!hasLessons?`<section class="card notice"><strong>${t('None of your lessons were found.')}</strong><p>${t('Ask your administrator to set your name on the timetable under School users.')}</p></section>`:''}${changesCard(state)}<section class="card"><h2>${t('Your lessons today')}</h2>${[...state.mine,...covered].sort((a,b)=>a.start.localeCompare(b.start)).map(row=>lessonRow(row,state)).join('')||`<p class="empty">${t('No lessons are scheduled.')}</p>`}</section>${noticesCard()}`;
}
function week(){
 const scoped=view(),parent=isParent(),plan=weekPlan(scoped,now(),7),day=plan[selectedDay]||plan[0],rows=day.rows.filter(row=>parent||(weekView==='mine'?row.mine||row.coveredBy:row.classId===weekView));
 const count=item=>item.holiday?'—':item.rows.filter(row=>row.mine&&row.type==='lesson').length;
 return `${childPicker()}<nav class="day-strip" aria-label="${t('Week')}">${plan.map((item,i)=>`<button type="button" data-select-day="${i}" class="${i===selectedDay?'selected':''}" ${i===selectedDay?'aria-current="date"':''}><span>${e(dayName(item.day))}</span><strong>${Number(item.date.slice(8))}</strong><small>${count(item)}</small></button>`).join('')}</nav>${parent?'':`<label class="view-select">${t('Show')}<select id="week-view"><option value="mine">${t('My lessons')}</option>${data.classes.map(group=>`<option value="${e(group.id)}" ${weekView===group.id?'selected':''}>${e(pick(group,'name'))}</option>`).join('')}</select></label>`}${day.holiday?`<section class="card change"><strong>${t('School holiday')}</strong></section>`:''}${day.specials.filter(row=>parent||weekView==='mine'||row.classId===weekView).map(row=>`<section class="card change"><strong>${t('Timetable change')}</strong><p>${e(pick(row,'name'))} · ${e(className(row.classId))}${row.mode==='cancel'?' · '+t('No school'):''}</p></section>`).join('')}<section class="card"><h2>${e(dayName(day.day))} · ${e(day.date)}</h2>${rows.map(row=>lessonRow(row)).join('')||`<p class="empty">${t('No lessons are scheduled.')}</p>`}</section>`;
}
function inbox(){
 const stamp=value=>new Date(value).toLocaleString(language==='ar'?'ar-QA':'en-GB',{timeZone:data.school.timezone,dateStyle:'medium',timeStyle:'short'});
 return `<section class="card"><h2>${t('Messages')}</h2>${[...messages()].reverse().map(row=>`<article class="message"><p>${e(row.text)}</p><small>${e(row.fromName)} · ${e(stamp(row.at))}</small></article>`).join('')||`<p class="empty">${t('No messages yet.')}</p>`}</section>`;
}
function classTab(){
 if(!data.classes.length)return `<section class="card"><p class="empty">${t('No classes are assigned to you yet.')}</p></section>`;
 const group=data.classes.find(row=>row.id===classId)||data.classes[0],date=todayDate(),students=(data.students||[]).filter(row=>row.classId===group.id),saved=Object.fromEntries((data.attendance||[]).filter(row=>row.date===date&&row.classId===group.id).map(row=>[row.studentId,row.status])),requests=(data.absenceRequests||[]).filter(row=>row.classId===group.id);
 return `<label class="view-select">${t('Class')}<select id="class-select">${data.classes.map(row=>`<option value="${e(row.id)}" ${row.id===group.id?'selected':''}>${e(pick(row,'name'))}</option>`).join('')}</select></label>${requests.length?`<section class="card change"><strong>${t('Absence requests')}</strong>${requests.map(row=>`<div class="request"><p><b>${e(studentName(row.studentId))}</b> · ${e(row.from)}${row.to!==row.from?' – '+e(row.to):''}</p>${row.reason?`<p class="pre">${e(row.reason)}</p>`:''}<div class="row-buttons"><button type="button" class="secondary" data-decide="${e(row.id)}" data-status="approved">${t('Approve')}</button><button type="button" class="ghost danger" data-decide="${e(row.id)}" data-status="declined">${t('Decline')}</button></div></div>`).join('')}</section>`:''}<form id="attendance-form" class="card"><h2>${t('Attendance today')} · ${e(date)}</h2>${students.map(row=>{const fixed=saved[row.id]==='excused',value=marks[row.id]||saved[row.id]||'present';return `<div class="mark-row"><span>${e(pick(row,'name'))}</span>${fixed?statusTag('excused'):`<div class="segmented" role="radiogroup" aria-label="${e(pick(row,'name'))}">${[['present','Present'],['absent','Absent'],['late','Late']].map(([status,label])=>`<label class="${value===status?'on '+status:''}"><input type="radio" name="mark:${e(row.id)}" value="${status}" ${value===status?'checked':''}>${t(label)}</label>`).join('')}</div>`}</div>`;}).join('')||`<p class="empty">${t('No students in this class yet.')}</p>`}${students.length?`<p class="muted">${Object.keys(saved).length?t('Saved. You can change it and save again.'):t('Not saved yet. Everyone starts as present.')}</p><button class="primary">${t('Save attendance')}</button>`:''}</form><form id="work-form" class="card"><h2>${t('Post homework or exam')}</h2><label>${t('Type')}<select name="type"><option value="homework">${t('Homework')}</option><option value="exam">${t('Exam')}</option></select></label><label>${t('Title')}<input name="title" required maxlength="120"></label><label>${t('Due date')}<input name="dueDate" type="date" required min="${e(date)}" value="${e(date)}"></label><label>${t('Details')}<textarea name="details" rows="2" maxlength="1000"></textarea></label><button class="primary">${t('Post')}</button></form><section class="card"><h2>${t('Coming up')}</h2>${upcomingWork(group.id).map(row=>workRow(row,true)).join('')||`<p class="empty">${t('Nothing posted yet.')}</p>`}</section>`;
}
function homework(){const kid=child();return `${childPicker()}<section class="card"><h2>${t('Homework and exams')}</h2>${kid?upcomingWork(kid.classId).map(row=>workRow(row)).join('')||`<p class="empty">${t('Nothing posted yet.')}</p>`:''}</section>`;}
function attendanceTab(){
 const kid=child();if(!kid)return parentToday();
 const date=todayDate(),records=(data.attendance||[]).filter(row=>row.studentId===kid.id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30),requests=(data.absenceRequests||[]).filter(row=>row.studentId===kid.id).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,10);
 return `${childPicker()}<form id="absence-form" class="card"><h2>${t('Request an absence')}</h2><label>${t('From')}<input name="from" type="date" required min="${e(date)}" value="${e(date)}"></label><label>${t('To')}<input name="to" type="date" required min="${e(date)}" value="${e(date)}"></label><label>${t('Reason')}<textarea name="reason" rows="2" maxlength="300"></textarea></label><button class="primary">${t('Send request')}</button></form>${requests.length?`<section class="card"><h2>${t('Your requests')}</h2>${requests.map(row=>`<div class="status-line"><span>${e(row.from)}${row.to!==row.from?' – '+e(row.to):''}</span>${statusTag(row.status)}</div>`).join('')}</section>`:''}<section class="card"><h2>${t('Attendance')} · ${e(pick(kid,'name'))}</h2>${records.map(row=>`<div class="status-line"><span>${e(dayName(new Date(row.date+'T12:00:00Z').getUTCDay()))} · ${e(row.date)}</span>${statusTag(row.status)}</div>`).join('')||`<p class="empty">${t('No attendance recorded yet.')}</p>`}</section>`;
}
function settings(){
 const lead=read('teacher-reminder')||'0',synced=read('teacher-synced'),parent=isParent();
 return `<section class="card"><h2>${e(data.teacher.name)}</h2><p class="muted">${e(data.teacher.email)}</p><dl><dt>${t('School')}</dt><dd>${e(pick(data.school,'name'))}</dd>${parent?`<dt>${t('Children')}</dt><dd>${data.children.map(row=>e(pick(row,'name'))).join('، ')||'—'}</dd>`:`<dt>${t('Name on the timetable')}</dt><dd>${e(data.teacher.timetableName||t('Not set'))}</dd>`}<dt>${t('Last updated')}</dt><dd>${synced?e(new Date(synced).toLocaleString(language==='ar'?'ar-QA':'en-GB')):'—'}</dd></dl><button type="button" class="secondary" data-action="sync">${t('Update now')}</button></section>${parent?`<form id="link-form" class="card"><h2>${t('Add a child')}</h2><label>${t('Invitation code')}<input name="code" required maxlength="20" autocapitalize="characters" autocomplete="off"></label><button class="primary">${t('Add')}</button></form>`:''}<section class="card"><label>${t('Language')}<select id="language"><option value="ar" ${language==='ar'?'selected':''}>العربية</option><option value="en" ${language==='en'?'selected':''}>English</option></select></label>${native&&!parent?`<label>${t('Lesson reminders')}<select id="reminder">${[['0',t('Off')],...['5','10','15'].map(value=>[value,`${value} ${t('minutes before')}`])].map(([value,label])=>`<option value="${value}" ${lead===value?'selected':''}>${e(label)}</option>`).join('')}</select></label><p class="muted">${t('Reminders are on this phone and work offline after the app has updated once.')}</p>`:''}</section><form id="password-form" class="card"><h2>${t('Change password')}</h2><label>${t('Current password')}<input name="currentPassword" type="password" required autocomplete="current-password" maxlength="256"></label><label>${t('New password')}<input name="password" type="password" required minlength="12" autocomplete="new-password" maxlength="256"></label><p class="muted">${t('At least 12 characters. Other phones are signed out.')}</p><button class="secondary">${t('Change password')}</button></form><section class="card"><p class="muted">${t('Timetable times use the school timezone.')} ${e(data.school.timezone)}</p><button type="button" class="ghost danger" data-action="logout">${t('Sign out')}</button></section>`;
}
const passwordField=(name,label,auto)=>`<label>${t(label)}<input name="${name}" type="password" autocomplete="${auto}" required maxlength="256"></label>`;
const login=()=>`<main class="login"><img src="icon.svg" alt="" width="72" height="72"><h1>${t('School app')}</h1><p>${t('For teachers and parents')}</p>${authMode==='login'?`<form id="login-form"><label>${t('Email')}<input name="email" type="email" autocomplete="username" required maxlength="180"></label>${passwordField('password','Password','current-password')}<p id="login-error" role="alert"></p><button class="primary">${t('Sign in')}</button></form><button type="button" class="secondary" data-action="join">${t('I have an invitation code')}</button><p class="muted">${t('Teachers get their sign-in from the school. Parents get an invitation code.')}</p>`:`<form id="join-form"><label>${t('Invitation code')}<input name="code" required maxlength="20" autocapitalize="characters" autocomplete="off"></label><label>${t('Your name')}<input name="name" required maxlength="100" autocomplete="name"></label><label>${t('Email')}<input name="email" type="email" autocomplete="username" required maxlength="180"></label>${passwordField('password','Password','new-password')}${passwordField('confirm','Confirm password','new-password')}<p class="muted">${t('At least 12 characters. If you already have an account, use the same email and password to add this child.')}</p><p id="login-error" role="alert"></p><button class="primary">${t('Join')}</button></form><button type="button" class="ghost" data-action="login">${t('Back to sign in')}</button>`}<button type="button" class="ghost" data-action="language">${language==='en'?'العربية':'English'}</button></main>`;
function tabs(){
 const list=isParent()?[['today','Today','◷'],['week','Week','▦'],['homework','Homework','✎'],['attendance','Attendance','✓'],['messages','Messages','✉']]:[['today','Today','◷'],['week','Week','▦'],['class','Class','✓'],['messages','Messages','✉']];
 const badge=key=>{const count=key==='messages'?unread().length:key==='class'?(data.absenceRequests||[]).length:0;return count?`<b class="tab-badge">${count}</b>`:'';};
 return `<nav class="tabs" data-count="${list.length}">${list.map(([key,label,icon])=>`<button type="button" data-tab="${key}" class="${tab===key?'active':''}" ${tab===key?'aria-current="page"':''}><span aria-hidden="true">${icon}</span>${t(label)}${badge(key)}</button>`).join('')}</nav>`;
}
function render(){
 if(!token||!data){root.innerHTML=login();return;}
 const synced=read('teacher-synced'),scroll=window.scrollY;lastKey=viewKey();
 const body=tab==='today'?today():tab==='week'?week():tab==='messages'?inbox():tab==='class'?classTab():tab==='homework'?homework():tab==='attendance'?attendanceTab():settings();
 root.innerHTML=`<header class="top"><div><strong>${e(pick(data.school,'name'))}</strong><small data-clock>${clockText(schoolClock(now(),data.school.timezone))}</small><button type="button" class="gear ${tab==='settings'?'active':''}" data-tab="settings" aria-label="${t('Settings')}">⚙</button></div></header>${online?'':`<div class="offline" role="status">${t('Offline. Showing the last saved timetable.')}${synced?` ${t('Last updated')}: ${e(new Date(synced).toLocaleString(language==='ar'?'ar-QA':'en-GB'))}`:''}</div>`}<main class="content">${body}</main>${tabs()}`;
 window.scrollTo(0,scroll);
}
function viewKey(){if(!data)return '';const state=teacherNow(view(),now());return [state.clock.date,state.current?.id,state.next?.id].join('|');}
const saveAction=async(work,done)=>{try{await work();if(done)toast(done);await sync();render();}catch(failure){toast(failure.status?failure.message:'Could not reach the school. Check your connection.',true);}};
root.addEventListener('click',async event=>{
 const node=event.target.closest('button');if(!node)return;
 if(node.dataset.tab){tab=node.dataset.tab;if(tab==='messages')markRead();window.scrollTo(0,0);render();}
 if(node.dataset.selectDay){selectedDay=Number(node.dataset.selectDay);render();}
 if(node.dataset.child){childId=node.dataset.child;write('parent-child',childId);render();}
 if(node.dataset.action==='join'||node.dataset.action==='login'){authMode=node.dataset.action;render();}
 if(node.dataset.action==='language'){setLanguage(language==='en'?'ar':'en');render();}
 if(node.dataset.action==='sync')await sync(true);
 if(node.dataset.action==='logout'){try{await api('logout',{});}catch{}clearAccount();authMode='login';render();}
 if(node.dataset.decide)await saveAction(()=>api('absence/decide',{id:node.dataset.decide,status:node.dataset.status}),'Saved.');
 if(node.dataset.removeWork)await saveAction(()=>api('work/remove',{id:node.dataset.removeWork}),'Saved.');
});
root.addEventListener('input',event=>{const form=event.target.form;if(form&&!['login-form','join-form'].includes(form.id))form.dataset.dirty='1';});
root.addEventListener('change',async event=>{
 if(event.target.id==='week-view'){weekView=event.target.value;render();}
 if(event.target.id==='class-select'){classId=event.target.value;marks={};render();}
 if(event.target.name?.startsWith('mark:')){marks[event.target.name.slice(5)]=event.target.value;render();const form=root.querySelector('#attendance-form');if(form)form.dataset.dirty='1';}
 if(event.target.id==='language'){setLanguage(event.target.value);render();await scheduleReminders();}
 if(event.target.id==='reminder'){
  const plugin=notifications(),value=event.target.value;
  if(value!=='0'&&plugin){const permission=await plugin.requestPermissions().catch(()=>({display:'denied'}));if(permission.display!=='granted'){event.target.value='0';write('teacher-reminder','0');toast('Allow notifications in your phone settings to get reminders.',true);return;}}
  write('teacher-reminder',value);await scheduleReminders();toast('Reminders saved.');
 }
});
async function enter(issued){token=issued.token;write('teacher-token',token);applyData(await api('timetable'));markNotified();online=true;tab='today';render();await scheduleReminders();}
root.addEventListener('submit',async event=>{
 const form=event.target,values=Object.fromEntries(new FormData(form));event.preventDefault();
 const submit=form.querySelector('button.primary,button.secondary');if(submit)submit.disabled=true;
 try{
  if(form.id==='login-form'||form.id==='join-form'){
   const error=form.querySelector('#login-error');error.textContent='';
   try{
    if(form.id==='join-form'&&values.password!==values.confirm)throw Object.assign(Error('Passwords do not match.'),{status:400});
    let issued;try{issued=await api(form.id==='login-form'?'login':'parent/register',values);}catch(failure){throw failure.status?failure:Error('Could not reach the school. Check your connection.');}
    await enter(issued);
   }catch(failure){token=null;write('teacher-token',null);error.textContent=t(failure.message);}
  }
  if(form.id==='attendance-form'){const group=data.classes.find(row=>row.id===classId)||data.classes[0],entries=[...new FormData(form)].filter(([key])=>key.startsWith('mark:')).map(([key,status])=>({studentId:key.slice(5),status}));await saveAction(()=>api('attendance',{classId:group.id,date:todayDate(),entries}),'Attendance saved.');marks={};render();}
  if(form.id==='work-form')await saveAction(()=>api('work',{...values,classId:(data.classes.find(row=>row.id===classId)||data.classes[0]).id}),'Posted.');
  if(form.id==='absence-form')await saveAction(()=>api('absence',{...values,studentId:child().id}),'Request sent.');
  if(form.id==='link-form')await saveAction(()=>api('parent/link',values),'Child added.');
  if(form.id==='password-form')await saveAction(async()=>{const issued=await api('password',values);token=issued.token;write('teacher-token',token);},'Password changed.');
 }finally{if(submit)submit.disabled=false;}
});
setInterval(()=>{
 if(!token||!data)return;
 if(viewKey()!==lastKey){softRender();return;}
 const state=teacherNow(view(),now()),count=root.querySelector('[data-countdown]'),bar=root.querySelector('[data-progress]'),clock=root.querySelector('[data-clock]');
 if(count)count.textContent=duration(state.remaining);if(bar)bar.value=state.progress;if(clock)clock.textContent=clockText(state.clock);
},1000);
setInterval(()=>{if(!document.hidden)sync();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
window.addEventListener('online',()=>sync());
window.addEventListener('offline',()=>{online=false;softRender();});
if(data&&/^#[a-f0-9]{6}$/i.test(data.school.accent))document.documentElement.style.setProperty('--accent',data.school.accent);
write('teacher-server',null);
render();sync();
