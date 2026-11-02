import {t,language,setLanguage,dayName,escape as e} from './teacher-i18n.js';
import {teacherNow,weekPlan,lessonReminders} from './teacher-plan.mjs';
const root=document.querySelector('#app'),native=Boolean(window.Capacitor?.isNativePlatform?.()),notifications=()=>window.capacitorLocalNotifications?.LocalNotifications;
const read=key=>{try{return localStorage.getItem(key);}catch{return null;}},write=(key,value)=>{try{value===null?localStorage.removeItem(key):localStorage.setItem(key,value);}catch{}};
let server=read('teacher-server')||'',token=read('teacher-token'),data=null,tab='today',online=true,selectedDay=0,weekView='mine',lastKey='',offset=0,syncing=false;
try{data=JSON.parse(read('teacher-data'));offset=Number(read('teacher-offset'))||0;}catch{data=null;}
const idList=key=>{try{return JSON.parse(read(key))||[];}catch{return [];}};
const messages=()=>data?.messages||[],unread=()=>{const seen=idList('teacher-read-messages');return messages().filter(row=>!seen.includes(row.id));};
const markRead=()=>write('teacher-read-messages',JSON.stringify(messages().map(row=>row.id)));
const markNotified=()=>write('teacher-notified-messages',JSON.stringify(messages().map(row=>row.id)));
const now=()=>new Date(Date.now()+offset),pick=(row,key)=>language==='ar'?row[key+'Ar']||row[key+'En']:row[key+'En']||row[key+'Ar'],className=id=>{const group=data.classes.find(row=>row.id===id);return group?pick(group,'name'):'';};
function toast(message,bad=false){const node=document.querySelector('#toast');node.textContent=t(message);node.className=bad?'show bad':'show';clearTimeout(toast.timer);toast.timer=setTimeout(()=>{node.className='';},4000);}
async function api(path,body){const res=await fetch(server+'/api/mobile/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await res.json();if(!res.ok)throw Object.assign(Error(result.error),{status:res.status});return result;}
function clearAccount(){token=null;data=null;tab='today';selectedDay=0;lastKey='';write('teacher-token',null);write('teacher-data',null);write('teacher-offset',null);write('teacher-read-messages',null);write('teacher-notified-messages',null);scheduleReminders();}
function applyData(fresh){data=fresh;offset=fresh.serverTime-Date.now();write('teacher-data',JSON.stringify(fresh));write('teacher-offset',String(offset));write('teacher-synced',new Date().toISOString());if(/^#[a-f0-9]{6}$/i.test(fresh.school.accent))document.documentElement.style.setProperty('--accent',fresh.school.accent);}
async function sync(announce=false){
 if(!token||syncing)return;syncing=true;
 try{const fresh=await api('timetable');const changed=JSON.stringify({...fresh,serverTime:0})!==JSON.stringify({...data,serverTime:0});applyData(fresh);const was=online;online=true;if(tab==='messages')markRead();if(changed||!was)render();if(changed){await scheduleReminders();await announceMessages();}if(announce)toast('Updated.');}
 catch(error){if(error.status===401){clearAccount();render();toast('Your account was signed out. Sign in again.',true);}else{const was=online;online=false;if(was)render();if(announce)toast('Could not update. The saved timetable is still available.',true);}}
 finally{syncing=false;}
}
// Shown while the app runs. A phone notification also appears if the app has been sent to the background.
async function announceMessages(){
 const known=idList('teacher-notified-messages'),fresh=messages().filter(row=>!known.includes(row.id));if(!fresh.length)return;markNotified();
 if(tab!=='messages')toast('New message from school');
 const plugin=notifications();if(!native||!plugin)return;
 try{const permission=await plugin.requestPermissions();if(permission.display==='granted')await plugin.schedule({notifications:fresh.map(row=>({id:parseInt(row.id.slice(0,7),16),title:t('New message from school'),body:row.text,schedule:{at:new Date(Date.now()+1000),allowWhileIdle:true}}))});}catch{}
}
async function scheduleReminders(){
 const plugin=notifications();if(!native||!plugin)return;
 try{
  const pending=await plugin.getPending();if(pending.notifications.length)await plugin.cancel({notifications:pending.notifications.map(({id})=>({id}))});
  const lead=Number(read('teacher-reminder')||0);if(!lead||!data||!token)return;
  await plugin.schedule({notifications:lessonReminders(data,now(),lead).map(item=>({id:item.id,title:`${t('Lesson in')} ${lead} ${t('minutes')}: ${pick(item.row,'subject')}`,body:[className(item.row.classId),item.row.room,item.row.start].filter(Boolean).join(' · '),schedule:{at:new Date(item.at-offset),allowWhileIdle:true}}))});
 }catch{toast('Allow notifications in your phone settings to get reminders.',true);}
}
const duration=seconds=>{const m=Math.ceil(seconds/60);return m>=60?`${Math.floor(m/60)} ${t('h')} ${m%60} ${t('min')}`:`${m} ${t('min')}`;};
const lessonMeta=row=>[className(row.classId),row.room].filter(Boolean).map(e).join(' · ');
function lessonRow(row,state){
 const current=state?.current===row,past=state&&!current&&row.end<=clockText(state.clock);
 return `<article class="lesson ${row.type} ${row.mine?'mine':''} ${row.coveredBy?'covered':''} ${current?'current':''} ${past?'past':''}"><time>${e(row.start)}<small>${e(row.end)}</small></time><div><strong>${e(pick(row,'subject'))}</strong><small>${lessonMeta(row)}</small>${row.type==='lesson'&&!row.mine?`<small>${e(pick(row,'teacher'))}</small>`:''}${row.mine&&row.substituteFor?`<span class="tag">${t('Cover for')} ${e(row.substituteFor)}</span>`:''}${row.coveredBy?`<span class="tag warn">${t('Covered by')} ${e(pick(row,'teacher'))}</span>`:''}</div></article>`;
}
const clockText=clock=>String(Math.floor(clock.seconds/3600)).padStart(2,'0')+':'+String(Math.floor(clock.seconds%3600/60)).padStart(2,'0');
function hero(state){
 const row=state.current||state.next;
 if(row)return `<section class="hero ${state.current?'live':''}"><span class="eyebrow">${t(state.current?'Teaching now':'Next lesson')}</span><h1>${e(pick(row,'subject'))}</h1><p>${lessonMeta(row)||'&nbsp;'}</p><div class="hero-time"><strong data-countdown>${duration(state.remaining)}</strong><span>${t(state.current?'left':'starts in')}</span><time>${e(row.start)} – ${e(row.end)}</time></div>${state.current?`<progress data-progress max="1" value="${state.progress}"></progress>`:''}</section>`;
 const title=state.today.holiday?'School holiday':state.mine.length?'No more lessons today':'No lessons today';
 return `<section class="hero quiet"><span class="eyebrow">${e(dayName(state.clock.day))}</span><h1>${t(title)}</h1>${state.laterLesson?`<p>${t('Your next lesson')}: ${e(pick(state.laterLesson,'subject'))}<br>${e(dayName(state.later.day))} · ${e(state.later.date)} · ${e(state.laterLesson.start)}</p>`:''}</section>`;
}
function today(){
 const state=teacherNow(data,now()),covered=state.today.rows.filter(row=>row.coveredBy),changes=state.today.specials,hasLessons=weekPlan(data,now(),14).some(day=>day.rows.some(row=>row.mine||row.coveredBy));
 const notices=[...data.announcements.map(row=>pick(row,'text')),pick(data.school,'announcement')].filter(Boolean);
 return `${hero(state)}${!hasLessons?`<section class="card notice"><strong>${t('None of your lessons were found.')}</strong><p>${t('Ask your administrator to set your name on the timetable under School users.')}</p></section>`:''}${changes.length&&!state.today.holiday?`<section class="card change"><strong>${t('Timetable change today')}</strong>${changes.map(row=>`<p>${e(pick(row,'name'))} · ${e(className(row.classId))}</p>`).join('')}</section>`:''}<section class="card"><h2>${t('Your lessons today')}</h2>${[...state.mine,...covered].sort((a,b)=>a.start.localeCompare(b.start)).map(row=>lessonRow(row,state)).join('')||`<p class="empty">${t('No lessons are scheduled.')}</p>`}</section>${notices.length?`<section class="card"><h2>${t('Announcements')}</h2>${notices.map(text=>`<p>${e(text)}</p>`).join('')}</section>`:''}`;
}
function week(){
 const plan=weekPlan(data,now(),7),day=plan[selectedDay]||plan[0],rows=day.rows.filter(row=>weekView==='mine'?row.mine||row.coveredBy:row.classId===weekView);
 return `<nav class="day-strip" aria-label="${t('Week')}">${plan.map((item,i)=>`<button type="button" data-select-day="${i}" class="${i===selectedDay?'selected':''}" ${i===selectedDay?'aria-current="date"':''}><span>${e(dayName(item.day))}</span><strong>${Number(item.date.slice(8))}</strong><small>${item.holiday?'—':item.rows.filter(row=>row.mine).length}</small></button>`).join('')}</nav><label class="view-select">${t('Show')}<select id="week-view"><option value="mine">${t('My lessons')}</option>${data.classes.map(group=>`<option value="${e(group.id)}" ${weekView===group.id?'selected':''}>${e(pick(group,'name'))}</option>`).join('')}</select></label>${day.holiday?`<section class="card change"><strong>${t('School holiday')}</strong></section>`:''}${day.specials.filter(row=>weekView==='mine'||row.classId===weekView).map(row=>`<section class="card change"><strong>${t('Timetable change')}</strong><p>${e(pick(row,'name'))} · ${e(className(row.classId))}${row.mode==='cancel'?' · '+t('No school'):''}</p></section>`).join('')}<section class="card"><h2>${e(dayName(day.day))} · ${e(day.date)}</h2>${rows.map(row=>lessonRow(row)).join('')||`<p class="empty">${t('No lessons are scheduled.')}</p>`}</section>`;
}
function inbox(){
 const stamp=value=>new Date(value).toLocaleString(language==='ar'?'ar-QA':'en-GB',{timeZone:data.school.timezone,dateStyle:'medium',timeStyle:'short'});
 return `<section class="card"><h2>${t('Messages')}</h2>${[...messages()].reverse().map(row=>`<article class="message"><p>${e(row.text)}</p><small>${e(row.fromName)} · ${e(stamp(row.at))}</small></article>`).join('')||`<p class="empty">${t('No messages yet.')}</p>`}</section>`;
}
function settings(){
 const lead=read('teacher-reminder')||'0',synced=read('teacher-synced');
 return `<section class="card"><h2>${e(data.teacher.name)}</h2><p class="muted">${e(data.teacher.email)}</p><dl><dt>${t('School')}</dt><dd>${e(pick(data.school,'name'))}</dd><dt>${t('Name on the timetable')}</dt><dd>${e(data.teacher.timetableName||t('Not set'))}</dd><dt>${t('Last updated')}</dt><dd>${synced?e(new Date(synced).toLocaleString(language==='ar'?'ar-QA':'en-GB')):'—'}</dd></dl><button type="button" class="secondary" data-action="sync">${t('Update now')}</button></section><section class="card"><label>${t('Language')}<select id="language"><option value="ar" ${language==='ar'?'selected':''}>العربية</option><option value="en" ${language==='en'?'selected':''}>English</option></select></label>${native?`<label>${t('Lesson reminders')}<select id="reminder">${[['0',t('Off')],...['5','10','15'].map(value=>[value,`${value} ${t('minutes before')}`])].map(([value,label])=>`<option value="${value}" ${lead===value?'selected':''}>${e(label)}</option>`).join('')}</select></label><p class="muted">${t('Reminders are on this phone and work offline after the app has updated once.')}</p>`:''}</section><section class="card"><p class="muted">${t('To change your password, use the school control panel. This signs out the app.')}</p><p class="muted">${t('Timetable times use the school timezone.')} ${e(data.school.timezone)}</p><button type="button" class="ghost danger" data-action="logout">${t('Sign out')}</button></section>`;
}
const login=()=>`<main class="login"><img src="icon.svg" alt="" width="72" height="72"><h1>${t('Teacher app')}</h1><p>Qatar School Time Table</p><form id="login-form">${native?`<label>${t('School address')}<input name="server" type="url" inputmode="url" autocomplete="url" required placeholder="https://school.example.edu" value="${e(server)}"></label>`:''}<label>${t('Email')}<input name="email" type="email" autocomplete="username" required maxlength="180"></label><label>${t('Password')}<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><p id="login-error" role="alert"></p><button class="primary">${t('Sign in')}</button></form><p class="muted">${t('Ask your school administrator for the address and your sign-in.')}</p><button type="button" class="ghost" data-action="language">${language==='en'?'العربية':'English'}</button></main>`;
function render(){
 if(!token||!data){root.innerHTML=login();return;}
 const synced=read('teacher-synced'),scroll=window.scrollY;lastKey=viewKey();
 root.innerHTML=`<header class="top"><div><strong>${e(pick(data.school,'name'))}</strong><small data-clock>${clockText(teacherNow(data,now()).clock)}</small></div></header>${online?'':`<div class="offline" role="status">${t('Offline. Showing the last saved timetable.')}${synced?` ${t('Last updated')}: ${e(new Date(synced).toLocaleString(language==='ar'?'ar-QA':'en-GB'))}`:''}</div>`}<main class="content">${tab==='today'?today():tab==='week'?week():tab==='messages'?inbox():settings()}</main><nav class="tabs">${[['today','Today','◷'],['week','Week','▦'],['messages','Messages','✉'],['settings','Settings','⚙']].map(([key,label,icon])=>`<button type="button" data-tab="${key}" class="${tab===key?'active':''}" ${tab===key?'aria-current="page"':''}><span aria-hidden="true">${icon}</span>${t(label)}${key==='messages'&&unread().length?`<b class="tab-badge">${unread().length}</b>`:''}</button>`).join('')}</nav>`;
 window.scrollTo(0,scroll);
}
function viewKey(){if(!data)return '';const state=teacherNow(data,now());return [state.clock.date,state.current?.id,state.next?.id].join('|');}
root.addEventListener('click',async event=>{
 const node=event.target.closest('button');if(!node)return;
 if(node.dataset.tab){tab=node.dataset.tab;if(tab==='messages')markRead();window.scrollTo(0,0);render();}
 if(node.dataset.selectDay){selectedDay=Number(node.dataset.selectDay);render();}
 if(node.dataset.action==='language'){setLanguage(language==='en'?'ar':'en');render();}
 if(node.dataset.action==='sync')await sync(true);
 if(node.dataset.action==='logout'){try{await api('logout',{});}catch{}clearAccount();render();}
});
root.addEventListener('change',async event=>{
 if(event.target.id==='week-view'){weekView=event.target.value;render();}
 if(event.target.id==='language'){setLanguage(event.target.value);render();await scheduleReminders();}
 if(event.target.id==='reminder'){
  const plugin=notifications(),value=event.target.value;
  if(value!=='0'&&plugin){const permission=await plugin.requestPermissions().catch(()=>({display:'denied'}));if(permission.display!=='granted'){event.target.value='0';write('teacher-reminder','0');toast('Allow notifications in your phone settings to get reminders.',true);return;}}
  write('teacher-reminder',value);await scheduleReminders();toast('Reminders saved.');
 }
});
root.addEventListener('submit',async event=>{
 if(event.target.id!=='login-form')return;event.preventDefault();
 const form=event.target,values=Object.fromEntries(new FormData(form)),error=form.querySelector('#login-error'),submit=form.querySelector('button');submit.disabled=true;error.textContent='';
 try{
  if(native){let address;try{address=new URL(values.server.trim());}catch{address=null;}if(address?.protocol!=='https:')throw Error('Enter the full https:// address of your school.');server=address.origin;write('teacher-server',server);}
  let issued;try{issued=await api('login',{email:values.email,password:values.password});}catch(failure){throw failure.status?failure:Error('Could not reach the school. Check the address and your connection.');}
  token=issued.token;write('teacher-token',token);applyData(await api('timetable'));markNotified();online=true;render();await scheduleReminders();
 }catch(failure){token=null;write('teacher-token',null);error.textContent=t(failure.message);}finally{submit.disabled=false;}
});
setInterval(()=>{
 if(!token||!data)return;
 if(viewKey()!==lastKey){render();return;}
 const state=teacherNow(data,now()),count=root.querySelector('[data-countdown]'),bar=root.querySelector('[data-progress]'),clock=root.querySelector('[data-clock]');
 if(count)count.textContent=duration(state.remaining);if(bar)bar.value=state.progress;if(clock)clock.textContent=clockText(state.clock);
},1000);
setInterval(()=>{if(!document.hidden)sync();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
window.addEventListener('online',()=>sync());
window.addEventListener('offline',()=>{online=false;render();});
if(data&&/^#[a-f0-9]{6}$/i.test(data.school.accent))document.documentElement.style.setProperty('--accent',data.school.accent);
render();sync();
