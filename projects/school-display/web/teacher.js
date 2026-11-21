import {t,language,setLanguage,dayName,escape as e} from './teacher-i18n.js';
import {teacherNow,weekPlan,lessonReminders} from './teacher-plan.mjs';
import {schoolClock,schoolInstant} from './schedule.mjs';
const root=document.querySelector('#app'),native=Boolean(window.Capacitor?.isNativePlatform?.()),notifications=()=>window.capacitorLocalNotifications?.LocalNotifications;
const read=key=>{try{return localStorage.getItem(key);}catch{return null;}},write=(key,value)=>{try{value===null?localStorage.removeItem(key):localStorage.setItem(key,value);}catch{}};
const server=native?window.SCHOOL_APP_SERVER:'';
let token=read('teacher-token'),data=null,tab='today',online=true,selectedDay=0,weekView='mine',lastKey='',offset=0,syncing=false,authMode='login',childId=read('parent-child'),classId=null,marks={};
let threadId=null,openNotice=null,conflictFor=null,filter={category:'all',priority:'all',unread:false};
try{data=JSON.parse(read('teacher-data'));offset=Number(read('teacher-offset'))||0;}catch{data=null;}
const idList=key=>{try{return JSON.parse(read(key))||[];}catch{return [];}};
const isParent=()=>data?.role==='parent';
const pick=(row,key)=>language==='ar'?row[key+'Ar']||row[key+'En']:row[key+'En']||row[key+'Ar'];
const now=()=>new Date(Date.now()+offset),className=id=>{const group=data.classes.find(row=>row.id===id);return group?pick(group,'name'):'';};
const child=()=>(data.children||[]).find(row=>row.id===childId)||data.children?.[0]||null,studentName=id=>{const row=(data.students||[]).find(item=>item.id===id);return row?pick(row,'name'):'';};
const todayDate=()=>schoolClock(now(),data.school.timezone).date;
const view=()=>{if(!isParent())return data;const classOf=child()?.classId;return {...data,schedule:data.schedule.filter(row=>row.classId===classOf),specialDays:data.specialDays.filter(row=>row.classId===classOf)};};
const stamp=value=>new Date(value).toLocaleString(language==='ar'?'ar-QA':'en-GB',{timeZone:data.school.timezone,dateStyle:'medium',timeStyle:'short'});

// ---------- Theme ----------
const applyTheme=()=>{const value=read('teacher-theme')||'system';if(value==='system')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=value;};
applyTheme();

// ---------- Messages, notices and read state ----------
// The server records read/acknowledged; the local list keeps the badge right while offline.
const messages=()=>(data?.messages||[]).filter(row=>row.direction!=='up');
const allMessages=()=>data?.messages||[];
const rawNotices=()=>data?.notices||[];
// A change repeated on several dates (for example a room change every Monday) is one item with its dates.
function notices(){
 const groups=new Map();
 for(const row of rawNotices()){const key=JSON.stringify([row.kind,row.before,row.after]),group=groups.get(key);if(group){group.rows.push(row);continue;}groups.set(key,{...row,rows:[row]});}
 return [...groups.values()].map(group=>{const rows=group.rows.sort((a,b)=>a.date.localeCompare(b.date));return {...group,id:rows[0].id,ids:rows.map(row=>row.id),dates:rows.map(row=>row.date),date:rows[0].date,readAt:rows.every(row=>row.readAt)?rows[0].readAt:null,ackAt:rows.every(row=>row.ackAt)?rows[0].ackAt:null,conflict:rows.find(row=>row.conflict)?.conflict||null,at:rows.map(row=>row.at).sort().at(-1)};});
}
const localRead=()=>new Set(idList('teacher-read-messages'));
const isRead=row=>Boolean(row.readAt)||(row.ids||[row.id]).every(value=>localRead().has(value));
const unread=()=>messages().filter(row=>!isRead(row));
const unreadNotices=()=>notices().filter(row=>!isRead(row));
function markRead(rows=messages()){
 rows=rows.flatMap(row=>row.rows||[row]);
 const ids=rows.map(row=>row.id),seen=localRead();ids.forEach(value=>seen.add(value));write('teacher-read-messages',JSON.stringify([...seen].slice(-800)));
 const pending=rows.filter(row=>!row.readAt);if(!pending.length||!token)return;
 const body=isParent()?null:{ids:pending.filter(row=>!row.kind).map(row=>row.id),noticeIds:pending.filter(row=>row.kind).map(row=>row.id)};
 if(body)api('read',body).catch(()=>{});
}
function toast(message,bad=false){const node=document.querySelector('#toast');node.textContent=t(message);node.className=bad?'show bad':'show';clearTimeout(toast.timer);toast.timer=setTimeout(()=>{node.className='';},4000);}
async function api(path,body){const res=await fetch(server+'/api/mobile/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await res.json();if(!res.ok)throw Object.assign(Error(result.error),{status:res.status});return result;}

// ---------- Offline outbox: replies, acknowledgements, reports and preferences ----------
const outbox=()=>{try{return JSON.parse(read('teacher-outbox'))||[];}catch{return [];}};
const saveOutbox=list=>write('teacher-outbox',JSON.stringify(list.slice(-100)));
const newKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),byte=>byte.toString(16).padStart(2,'0')).join('');
const updateItem=(key,patch)=>saveOutbox(outbox().map(item=>item.clientId===key?{...item,...patch}:item));
function queue(path,body,label,replace=false){
 const clientId=newKey(),item={clientId,path,body:{...body,clientId},label,state:'pending',at:new Date().toISOString(),tries:0};
 saveOutbox([...outbox().filter(row=>!(replace&&row.path===path&&row.state!=='sent')),item]);flush().then(()=>softRender());return item;
}
let flushing=false;
async function flush(resync=true){
 if(flushing||!token)return false;flushing=true;let sent=false;
 try{for(const item of outbox()){if(item.state==='sent'||item.state==='failed')continue;
  try{await api(item.path,item.body);updateItem(item.clientId,{state:'sent'});sent=true;}
  catch(error){if(error.status&&error.status!==429&&error.status<500)updateItem(item.clientId,{state:'failed',error:error.message});else{updateItem(item.clientId,{tries:item.tries+1});online=false;break;}}}}
 finally{flushing=false;}
 if(sent&&resync)await sync();return sent;
}
// Sent items disappear once the server copy has arrived.
function pruneOutbox(){const known=new Set([...allMessages().map(row=>row.clientId),...(data?.requests||[]).flatMap(row=>[row.clientId,...row.comments.map(item=>item.clientId)])].filter(Boolean));saveOutbox(outbox().filter(item=>!(item.state==='sent'&&(known.has(item.clientId)||['ack','preferences'].includes(item.path)))));}
const pendingFor=(path,test)=>outbox().filter(item=>item.path===path&&test(item.body));
const sendState=item=>`<span class="send-state ${item.state}">${t(item.state==='pending'?'Waiting to send':item.state==='failed'?'Not sent':'Sent')}</span>${item.state==='failed'?`<button type="button" class="link" data-retry="${e(item.clientId)}">${t('Try again')}</button>`:''}`;

function clearAccount(){token=null;data=null;tab='today';selectedDay=0;lastKey='';childId=null;classId=null;marks={};threadId=null;for(const key of ['teacher-token','teacher-data','teacher-offset','teacher-read-messages','teacher-notified-messages','parent-child','teacher-outbox'])write(key,null);scheduleReminders();}
function applyData(fresh){data=fresh;offset=fresh.serverTime-Date.now();write('teacher-data',JSON.stringify(fresh));write('teacher-offset',String(offset));write('teacher-synced',new Date().toISOString());if(/^#[a-f0-9]{6}$/i.test(fresh.school.accent))document.documentElement.style.setProperty('--accent',fresh.school.accent);pruneOutbox();}
const softRender=()=>{if(!root.querySelector('form[data-dirty]'))render();};
// The timetable plus the notifications the school posts from the control panel's community section.
async function loadData(){const [fresh,board]=await Promise.all([api('timetable'),api('notifications').catch(error=>error.status===401?Promise.reject(error):null)]);fresh.communityNotices=board?board.items||[]:data?.communityNotices||[];return fresh;}
let syncAgain=false;
async function sync(announce=false){
 if(!token)return;if(syncing){syncAgain=true;return;}syncing=true;syncAgain=false;
 try{await flush(false);const fresh=await loadData();const changed=JSON.stringify({...fresh,serverTime:0})!==JSON.stringify({...data,serverTime:0});applyData(fresh);const was=online;online=true;if(tab==='messages')markRead();if(changed||!was)softRender();if(changed){await scheduleReminders();await announce_();}if(announce)toast('Updated.');}
 catch(error){if(error.status===401){clearAccount();render();toast('Your account was signed out. Sign in again.',true);}else{const was=online;online=false;if(was)softRender();if(announce)toast('Could not update. The saved timetable is still available.',true);}}
 finally{syncing=false;}
 if(syncAgain&&token){syncAgain=false;await sync();}
}

// ---------- Phone notifications ----------
const prefs=()=>data?.preferences||{categories:{},reminderMinutes:0,quietEnabled:false,hidePreview:true};
const minutesOf=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
function inQuietHours(at=now()){const p=prefs();if(!p.quietEnabled||!data)return false;const c=schoolClock(at,data.school.timezone),m=Math.floor(c.seconds/60),start=minutesOf(p.quietStart),end=minutesOf(p.quietEnd);return start<=end?m>=start&&m<end:m>=start||m<end;}
const allowed=(category,priority,at)=>{const p=prefs();if(priority==='urgent'&&data?.policy?.urgentBypassQuiet)return true;if(p.categories&&p.categories[category]===false)return false;return !inQuietHours(at);};
const categoryTitle={message:'New message from school',announcement:'School announcement',meeting:'Meeting invitation',event:'School event',urgent:'Urgent alert',change:'Timetable change'};
function alertItems(){
 const hide=!isParent()&&prefs().hidePreview!==false;
 const items=messages().filter(row=>!row.readAt).map(row=>({id:row.id,category:row.category||'message',priority:row.priority||'normal',title:t(row.id!==row.threadId?'New reply from the school':categoryTitle[row.category]||'New message from school'),body:hide?t('Open Faslii to read it.'):row.text,extra:{tab:'thread',threadId:row.threadId}}));
 if(isParent()){
  for(const row of data.attendance||[])if(row.status==='absent'||row.status==='late')items.push({id:`a${row.studentId}${row.date}${row.status}`,title:`${studentName(row.studentId)}: ${t(row.status==='absent'?'Marked absent':'Marked late')}`,body:row.date});
  for(const row of data.work||[])items.push({id:'w'+row.id,title:`${t(row.type==='exam'?'New exam':'New homework')}: ${row.title}`,body:`${className(row.classId)} · ${row.dueDate}`});
  for(const row of data.absenceRequests||[])if(row.status!=='pending')items.push({id:`r${row.id}${row.status}`,title:t(row.status==='approved'?'Absence approved':'Absence declined'),body:`${studentName(row.studentId)} · ${row.from}`});
 }else{
  for(const row of notices().filter(item=>!item.readAt))items.push({id:'n'+row.ids.join('.'),category:'change',priority:'important',title:t('Timetable change'),body:hide?t('Open Faslii to see the change.'):noticeTitle(row),extra:{tab:'alerts',notice:row.id}});
  for(const row of data?.requests||[])if(row.status!=='pending')items.push({id:`q${row.id}${row.status}`,category:'message',priority:'normal',title:t('Request answered'),body:hide?t('Open Faslii to see the answer.'):`${row.title}: ${t({approved:'Approved',rejected:'Rejected',completed:'Completed'}[row.status])}`,extra:{tab:'request',request:row.id}});
  for(const row of resourceUpdates())items.push({id:`d${row.id}v${row.version}`,category:'announcement',priority:'important',title:t('Document updated'),body:row.title,extra:{tab:'resources'}});
  for(const row of data?.absenceRequests||[])items.push({id:'r'+row.id,category:'message',priority:'normal',title:t('New absence request'),body:`${studentName(row.studentId)} · ${row.from}`,extra:{tab:'class'}});
 }
 return items;
}
const markNotified=()=>write('teacher-notified-messages',JSON.stringify(alertItems().map(row=>row.id)));
const alertNumber=id=>{let hash=11;for(const char of id)hash=(hash*33+char.charCodeAt(0))%2147483647;return hash;};
// One notification per item: ids are remembered so a refresh never repeats an alert.
async function announce_(){
 const known=idList('teacher-notified-messages'),fresh=alertItems().filter(row=>!known.includes(row.id));if(!fresh.length)return;markNotified();
 if(tab!=='messages'||fresh.some(row=>!messages().some(item=>item.id===row.id)))toast(fresh[0].title);
 const plugin=notifications();if(!native||!plugin)return;
 const deliver=fresh.filter(row=>!pushedByServer(row.id)&&(isParent()||allowed(row.category,row.priority)));
 if(!deliver.length)return;
 try{const permission=await plugin.requestPermissions();if(permission.display==='granted')await plugin.schedule({notifications:deliver.slice(0,10).map(row=>({id:alertNumber(row.id),title:row.title,body:row.body,extra:row.extra||null,schedule:{at:new Date(Date.now()+1000),allowWhileIdle:true}}))});}catch{}
}
async function scheduleReminders(){
 const plugin=notifications();if(!native||!plugin)return;
 try{
  const pending=await plugin.getPending();if(pending.notifications.length)await plugin.cancel({notifications:pending.notifications.map(({id})=>({id}))});
  if(!data||!token||isParent())return;
  const lead=Number(read('teacher-reminder')||0),p=prefs(),list=[];
  for(const item of lessonReminders(data,now(),lead))list.push({id:item.id,at:item.at,title:`${t('Lesson in')} ${lead} ${t('minutes')}: ${pick(item.row,'subject')}`,body:[className(item.row.classId),item.row.room,item.row.start].filter(Boolean).join(' · '),extra:{tab:'today'}});
  if(p.lessonStart||p.lessonEnd)for(const day of weekPlan(data,now(),7))for(const row of day.rows.filter(item=>item.mine&&item.type==='lesson')){
   if(p.lessonStart)list.push({id:alertNumber('s'+day.date+row.classId+row.start),at:schoolInstant(day.date,row.start,data.school.timezone),title:`${t('Lesson starting')}: ${pick(row,'subject')}`,body:[className(row.classId),row.room].filter(Boolean).join(' · '),extra:{tab:'today'}});
   if(p.lessonEnd)list.push({id:alertNumber('e'+day.date+row.classId+row.end),at:schoolInstant(day.date,row.end,data.school.timezone),title:`${t('Lesson ended')}: ${pick(row,'subject')}`,body:className(row.classId),extra:{tab:'today'}});
  }
  const upcoming=list.filter(item=>item.at>now().getTime()&&!inQuietHours(new Date(item.at))).sort((a,b)=>a.at-b.at).slice(0,60);
  if(upcoming.length)await plugin.schedule({notifications:upcoming.map(item=>({id:item.id,title:item.title,body:item.body,extra:item.extra,schedule:{at:new Date(item.at-offset),allowWhileIdle:true}}))});
 }catch{toast('Allow notifications in your phone settings to get reminders.',true);}
}
// Tapping a phone notification opens the related screen.
if(native)try{notifications()?.addListener?.('localNotificationActionPerformed',({notification})=>{const x=notification?.extra||{};if(!x.tab)return;tab=x.tab;threadId=x.threadId||threadId;openNotice=x.notice||openNotice;requestId=x.request||requestId;render();});}catch{}


// ---------- Push notifications (Firebase) ----------
// The server sends pushes for messages, changes, request answers and revised documents.
// When push works on this phone, those items are not repeated as local notifications.
const pushPlugin=()=>window.capacitorPushNotifications?.PushNotifications;
const deviceId=()=>{let value=read('teacher-device');if(!value){value=newKey();write('teacher-device',value);}return value;};
let pushReady=false;
async function setupPush(){
 const plugin=pushPlugin();if(!native||!plugin||!token)return;
 try{
  if(!pushReady){
   pushReady=true;
   await plugin.addListener('registration',({value})=>{write('teacher-push-token',value);api('push-token',{token:value,deviceId:deviceId(),platform:'android'}).then(result=>write('teacher-push',result.enabled?'on':'off')).catch(()=>{});});
   await plugin.addListener('registrationError',()=>write('teacher-push','off'));
   await plugin.addListener('pushNotificationReceived',()=>sync());
   await plugin.addListener('pushNotificationActionPerformed',({notification})=>{const x=notification?.data||{};if(x.tab){tab=x.tab;threadId=x.threadId||threadId;openNotice=x.notice||openNotice;requestId=x.request||requestId;}sync().then(()=>render());});
   for(const channel of [{id:'faslii',name:'Faslii',description:'School messages and timetable changes',importance:4,visibility:0},{id:'faslii-urgent',name:'Urgent alerts',description:'Urgent alerts from the school',importance:5,visibility:0}])await plugin.createChannel(channel).catch(()=>{});
  }
  let permission=await plugin.checkPermissions();if(permission.receive==='prompt')permission=await plugin.requestPermissions();
  if(permission.receive!=='granted'){write('teacher-push','off');return;}
  await plugin.register();
 }catch{write('teacher-push','off');}
}
const pushedByServer=id=>read('teacher-push')==='on'&&(/^[a-f0-9]{32}$/.test(id)||/^[nqd]/.test(id));

// ---------- Shared pieces ----------
const icon=name=>({today:'<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>',alerts:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',messages:'<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4 3v-3h0A2.5 2.5 0 0 1 4 14.5z"/>',settings:'<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',week:'<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',homework:'<path d="M5 19l1-4L16 5l3 3L9 18z"/>',attendance:'<path d="m5 12 4 4 10-10"/>',class:'<path d="m5 12 4 4 10-10"/>'}[name]||'');
const svg=name=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon(name)}</svg>`;
const duration=seconds=>{const m=Math.ceil(seconds/60);return m>=60?`${Math.floor(m/60)} ${t('h')} ${m%60} ${t('min')}`:`${m} ${t('min')}`;};
const lessonMeta=row=>(isParent()?[row.type==='lesson'?pick(row,'teacher'):'',row.room]:[className(row.classId),row.room]).filter(Boolean).map(e).join(' · ');
const noticeAt=(date,row)=>rawNotices().find(item=>item.date===date&&item.after&&item.after.start===row.start&&item.after.classId===row.classId);
const kindLabel={cancelled:'Lesson cancelled',room:'Room changed',time:'Time changed',substitute:'Cover assignment',covered:'Your lesson is covered',added:'Lesson added'};
function changeTag(notice){if(!notice)return '';if(notice.kind==='room')return `<span class="tag warn">${t('Room changed')}: ${e(notice.before?.room||'—')} → ${e(notice.after?.room||'—')}</span>`;if(notice.kind==='time')return `<span class="tag warn">${t('Time changed')}: ${e(notice.before?.start||'')} → ${e(notice.after?.start||'')}</span>`;if(notice.kind==='added')return `<span class="tag">${t('Lesson added')}</span>`;return '';}
function lessonRow(row,state,date){
 const current=state?.current===row,past=state&&!current&&row.end<=clockText(state.clock),notice=!isParent()&&date?noticeAt(date,row):null;
 return `<article class="lesson ${row.type} ${row.mine?'mine':''} ${row.coveredBy?'covered':''} ${current?'current':''} ${past?'past':''}"><time>${e(row.start)}<small>${e(row.end)}</small></time><div><strong>${e(pick(row,'subject'))}</strong><small>${lessonMeta(row)}</small>${row.type==='lesson'&&!row.mine?`<small>${e(pick(row,'teacher'))}</small>`:''}${row.mine&&row.substituteFor?`<span class="tag">${t('Cover for')} ${e(row.substituteFor)}</span>`:''}${row.coveredBy?`<span class="tag warn">${t('Covered by')} ${e(pick(row,'teacher'))}</span>`:''}${changeTag(notice)}</div></article>`;
}
const cancelledRows=date=>isParent()?'':rawNotices().filter(item=>item.date===date&&item.kind==='cancelled'&&item.before).map(item=>`<article class="lesson cancelled"><time>${e(item.before.start)}<small>${e(item.before.end)}</small></time><div><strong>${e(pick(item.before,'subject'))}</strong><small>${e(className(item.before.classId))}${item.before.room?' · '+e(item.before.room):''}</small><span class="tag danger">${t('Lesson cancelled')}</span></div></article>`).join('');
const clockText=clock=>String(Math.floor(clock.seconds/3600)).padStart(2,'0')+':'+String(Math.floor(clock.seconds%3600/60)).padStart(2,'0');
function hero(state){
 const row=state.current||state.next,parent=isParent();
 if(row)return `<section class="hero ${state.current?'live':''}"><span class="eyebrow">${t(state.current?(parent?(row.type==='break'?'On a break now':'In class now'):'Teaching now'):'Next lesson')}</span><h1>${e(pick(row,'subject'))}</h1><p>${lessonMeta(row)||'&nbsp;'}</p><div class="hero-time"><strong data-countdown>${duration(state.remaining)}</strong><span>${t(state.current?'left':'starts in')}</span><time>${e(row.start)} – ${e(row.end)}</time></div>${state.current?`<progress data-progress max="1" value="${state.progress}"></progress>`:''}${state.current&&state.next?`<p class="hero-next">${t('Next lesson')}: <b>${e(pick(state.next,'subject'))}</b> · ${e(state.next.start)}</p>`:''}</section>`;
 const title=state.today.holiday?'School holiday':state.mine.length?(parent?'School has finished for today':'No more lessons today'):'No lessons today';
 return `<section class="hero quiet"><span class="eyebrow">${e(dayName(state.clock.day))}</span><h1>${t(title)}</h1>${state.laterLesson?`<p>${t(parent?'Next school day':'Your next lesson')}: ${e(pick(state.laterLesson,'subject'))}<br>${e(dayName(state.later.day))} · ${e(state.later.date)} · ${e(state.laterLesson.start)}</p>`:''}</section>`;
}
const childPicker=()=>isParent()&&data.children.length>1?`<nav class="child-strip" aria-label="${t('Children')}">${data.children.map(row=>`<button type="button" data-child="${e(row.id)}" class="${row.id===child().id?'selected':''}">${e(pick(row,'name'))}</button>`).join('')}</nav>`:'';
const statusTag=status=>`<span class="tag ${status==='present'?'':status==='excused'?'':'warn'}">${t({present:'Present',absent:'Absent',late:'Late',excused:'Excused',pending:'Waiting for the school',approved:'Approved',declined:'Declined'}[status])}</span>`;
const workRow=(row,canRemove=false)=>`<article class="lesson"><time>${e(row.dueDate.slice(5))}</time><div><strong>${e(row.title)}</strong><small>${e(className(row.classId))} · ${e(row.byName)}</small>${row.details?`<small class="pre">${e(row.details)}</small>`:''}<span class="tag ${row.type==='exam'?'warn':''}">${t(row.type==='exam'?'Exam':'Homework')}</span>${canRemove?`<button type="button" class="ghost danger small" data-remove-work="${e(row.id)}">${t('Remove')}</button>`:''}</div></article>`;
const upcomingWork=(classOf,list=data.work||[])=>list.filter(row=>row.classId===classOf&&row.dueDate>=todayDate()).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
function noticesCard(){const list=[...data.announcements.map(row=>pick(row,'text')),pick(data.school,'announcement')].filter(Boolean);return list.length?`<section class="card"><h2>${t('Announcements')}</h2>${list.map(text=>`<p>${e(text)}</p>`).join('')}</section>`:'';}
function changesCard(state){return state.today.specials.length&&!state.today.holiday?`<section class="card change"><strong>${t('Timetable change today')}</strong>${state.today.specials.map(row=>`<p>${e(pick(row,'name'))} · ${e(className(row.classId))}</p>`).join('')}</section>`:'';}

// ---------- Parent screens (unchanged behaviour) ----------
function parentToday(){
 const kid=child();if(!kid)return `<section class="card notice"><strong>${t('No children are linked to this account.')}</strong><p>${t('Add a child in Settings with the code from your school.')}</p></section>`;
 const state=teacherNow(view(),now()),mark=(data.attendance||[]).find(row=>row.studentId===kid.id&&row.date===state.clock.date),due=upcomingWork(kid.classId).slice(0,3);
 return `${childPicker()}${hero(state)}${mark?`<section class="card status-line"><strong>${t('Attendance today')}</strong>${statusTag(mark.status)}</section>`:''}${changesCard(state)}<section class="card"><h2>${t('Today')} · ${e(pick(kid,'name'))}</h2>${state.mine.map(row=>lessonRow(row,state)).join('')||`<p class="empty">${t('No lessons are scheduled.')}</p>`}</section>${due.length?`<section class="card"><h2>${t('Coming up')}</h2>${due.map(row=>workRow(row)).join('')}</section>`:''}${noticesCard()}`;
}
function homework(){const kid=child();return `${childPicker()}<section class="card"><h2>${t('Homework and exams')}</h2>${kid?upcomingWork(kid.classId).map(row=>workRow(row)).join('')||`<p class="empty">${t('Nothing posted yet.')}</p>`:''}</section>`;}
function attendanceTab(){
 const kid=child();if(!kid)return parentToday();
 const date=todayDate(),records=(data.attendance||[]).filter(row=>row.studentId===kid.id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30),requests=(data.absenceRequests||[]).filter(row=>row.studentId===kid.id).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,10);
 return `${childPicker()}<form id="absence-form" class="card"><h2>${t('Request an absence')}</h2><label>${t('From')}<input name="from" type="date" required min="${e(date)}" value="${e(date)}"></label><label>${t('To')}<input name="to" type="date" required min="${e(date)}" value="${e(date)}"></label><label>${t('Reason')}<textarea name="reason" rows="2" maxlength="300"></textarea></label><button class="primary">${t('Send request')}</button></form>${requests.length?`<section class="card"><h2>${t('Your requests')}</h2>${requests.map(row=>`<div class="status-line"><span>${e(row.from)}${row.to!==row.from?' – '+e(row.to):''}</span>${statusTag(row.status)}</div>`).join('')}</section>`:''}<section class="card"><h2>${t('Attendance')} · ${e(pick(kid,'name'))}</h2>${records.map(row=>`<div class="status-line"><span>${e(dayName(new Date(row.date+'T12:00:00Z').getUTCDay()))} · ${e(row.date)}</span>${statusTag(row.status)}</div>`).join('')||`<p class="empty">${t('No attendance recorded yet.')}</p>`}</section>`;
}
function parentInbox(){return `<section class="card"><h2>${t('Messages')}</h2>${[...messages()].reverse().map(row=>`<article class="message"><p>${e(row.text)}</p><small>${e(row.fromName)} · ${e(stamp(row.at))}</small></article>`).join('')||`<p class="empty">${t('No messages yet.')}</p>`}</section>`;}

// ---------- Teacher: Today, Week, Month, Class ----------
const views=()=>isParent()?'':`<nav class="segmented-nav" aria-label="${t('Timetable views')}">${[['today','Day'],['week','Week'],['month','Month'],['class','Class']].map(([key,label])=>`<button type="button" data-tab="${key}" class="${tab===key?'selected':''}" ${tab===key?'aria-current="page"':''}>${t(label)}</button>`).join('')}</nav>`;
function pendingChanges(){
 const open=notices().filter(row=>!row.ackAt&&!pendingFor('ack',body=>row.ids.includes(body.noticeId)).length&&row.dates.at(-1)>=todayDate()).slice(0,3);
 return open.length?`<section class="card change"><strong>${t('Changes to your timetable')}</strong>${open.map(row=>`<button type="button" class="change-link" data-open-notice="${e(row.id)}"><span>${e(noticeTitle(row))}</span><small>${e(datesLabel(row))}</small></button>`).join('')}</section>`:'';
}
function today(){
 if(isParent())return parentToday();
 const state=teacherNow(data,now()),covered=state.today.rows.filter(row=>row.coveredBy),hasLessons=weekPlan(data,now(),14).some(day=>day.rows.some(row=>row.mine||row.coveredBy));
 return `${views()}${hero(state)}${quickAccess()}${!hasLessons?`<section class="card notice"><strong>${t('None of your lessons were found.')}</strong><p>${t('Ask your administrator to set your name on the timetable under School users.')}</p></section>`:''}${pendingChanges()}${changesCard(state)}<section class="card"><h2>${t('Your lessons today')}</h2>${[...state.today.rows.filter(row=>row.mine),...covered,...state.today.rows.filter(row=>row.type==='break'&&state.mine.length)].sort((a,b)=>a.start.localeCompare(b.start)).map(row=>lessonRow(row,state,state.clock.date)).join('')}${cancelledRows(state.clock.date)}${!state.mine.length&&!covered.length&&!cancelledRows(state.clock.date)?`<p class="empty">${t('No lessons are scheduled.')}</p>`:''}</section>${noticesCard()}`;
}
const dateLabel=date=>{const d=new Date(date+'T12:00:00Z');return `${dayName(d.getUTCDay())} · ${date}`;};
const datesLabel=row=>!row.dates||row.dates.length<2?dateLabel(row.date):`${row.dates[0]} – ${row.dates.at(-1)} · ${row.dates.length} ${t('days')}`;
function week(){
 const scoped=view(),parent=isParent(),plan=weekPlan(scoped,now(),35),first=Math.floor(selectedDay/7)*7,strip=plan.slice(first,first+7),day=plan[selectedDay]||plan[0],rows=day.rows.filter(row=>parent||(weekView==='mine'?row.mine||row.coveredBy||(row.type==='break'&&day.rows.some(item=>item.mine)):row.classId===weekView));
 const count=item=>item.holiday?'—':item.rows.filter(row=>row.mine&&row.type==='lesson').length;
 const changed=item=>!parent&&rawNotices().some(row=>row.date===item.date);
 const shift=parent?'':`<div class="week-shift"><button type="button" class="link" data-week-shift="-7" ${first===0?'disabled':''}>‹ ${t('Previous week')}</button><button type="button" class="link" data-week-shift="7" ${first>=28?'disabled':''}>${t('Next week')} ›</button></div>`;
 return `${views()}${childPicker()}${shift}<nav class="day-strip" aria-label="${t('Week')}">${strip.map((item,i)=>`<button type="button" data-select-day="${first+i}" class="${first+i===selectedDay?'selected':''} ${changed(item)?'has-change':''}" ${first+i===selectedDay?'aria-current="date"':''}><span>${e(dayName(item.day))}</span><strong>${Number(item.date.slice(8))}</strong><small>${count(item)}</small></button>`).join('')}</nav>${parent?'':`<label class="view-select">${t('Show')}<select id="week-view"><option value="mine">${t('My lessons')}</option>${data.classes.map(group=>`<option value="${e(group.id)}" ${weekView===group.id?'selected':''}>${e(pick(group,'name'))}</option>`).join('')}</select></label>`}${day.holiday?`<section class="card change"><strong>${t('School holiday')}</strong></section>`:''}${day.specials.filter(row=>parent||weekView==='mine'||row.classId===weekView).map(row=>`<section class="card change"><strong>${t('Timetable change')}</strong><p>${e(pick(row,'name'))} · ${e(className(row.classId))}${row.mode==='cancel'?' · '+t('No school'):''}</p></section>`).join('')}<section class="card"><h2>${e(dayName(day.day))} · ${e(day.date)}</h2>${rows.map(row=>lessonRow(row,null,day.date)).join('')}${weekView==='mine'?cancelledRows(day.date):''}${!rows.length&&!(weekView==='mine'&&cancelledRows(day.date))?`<p class="empty">${t('No lessons are scheduled.')}</p>`:''}</section>`;
}
function month(){
 const plan=weekPlan(data,now(),35),lead=plan[0].day,heads=Array.from({length:7},(_,i)=>(lead+i)%7);
 return `${views()}<section class="card"><h2>${t('Next five weeks')}</h2><div class="month" role="grid">${heads.map(day=>`<span class="month-head" role="columnheader">${e(dayName(day).slice(0,language==='ar'?6:3))}</span>`).join('')}${plan.map((item,i)=>{const count=item.rows.filter(row=>row.mine&&row.type==='lesson').length,change=rawNotices().some(row=>row.date===item.date);return `<button type="button" role="gridcell" data-month-day="${i}" class="${i===0?'today':''} ${item.holiday?'holiday':''} ${change?'has-change':''}" aria-label="${e(dateLabel(item.date))}: ${count} ${t('lessons')}"><strong>${Number(item.date.slice(8))}</strong><small>${item.holiday?t('Holiday'):count?count:''}</small></button>`;}).join('')}</div><p class="muted month-key"><span class="dot change"></span>${t('Timetable change')} <span class="dot holiday"></span>${t('Holiday')}</p></section>`;
}
function classTab(){
 if(!data.classes.length)return `${views()}<section class="card"><p class="empty">${t('No classes are assigned to you yet.')}</p></section>`;
 const group=data.classes.find(row=>row.id===classId)||data.classes[0],date=todayDate(),students=(data.students||[]).filter(row=>row.classId===group.id),saved=Object.fromEntries((data.attendance||[]).filter(row=>row.date===date&&row.classId===group.id).map(row=>[row.studentId,row.status])),requests=(data.absenceRequests||[]).filter(row=>row.classId===group.id);
 return `${views()}<label class="view-select">${t('Class')}<select id="class-select">${data.classes.map(row=>`<option value="${e(row.id)}" ${row.id===group.id?'selected':''}>${e(pick(row,'name'))}</option>`).join('')}</select></label>${requests.length?`<section class="card change"><strong>${t('Absence requests')}</strong>${requests.map(row=>`<div class="request"><p><b>${e(studentName(row.studentId))}</b> · ${e(row.from)}${row.to!==row.from?' – '+e(row.to):''}</p>${row.reason?`<p class="pre">${e(row.reason)}</p>`:''}<div class="row-buttons"><button type="button" class="secondary" data-decide="${e(row.id)}" data-status="approved">${t('Approve')}</button><button type="button" class="ghost danger" data-decide="${e(row.id)}" data-status="declined">${t('Decline')}</button></div></div>`).join('')}</section>`:''}<form id="attendance-form" class="card"><h2>${t('Attendance today')} · ${e(date)}</h2>${students.map(row=>{const fixed=saved[row.id]==='excused',value=marks[row.id]||saved[row.id]||'present';return `<div class="mark-row"><span>${e(pick(row,'name'))}</span>${fixed?statusTag('excused'):`<div class="segmented" role="radiogroup" aria-label="${e(pick(row,'name'))}">${[['present','Present'],['absent','Absent'],['late','Late']].map(([status,label])=>`<label class="${value===status?'on '+status:''}"><input type="radio" name="mark:${e(row.id)}" value="${status}" ${value===status?'checked':''}>${t(label)}</label>`).join('')}</div>`}</div>`;}).join('')||`<p class="empty">${t('No students in this class yet.')}</p>`}${students.length?`<p class="muted">${Object.keys(saved).length?t('Saved. You can change it and save again.'):t('Not saved yet. Everyone starts as present.')}</p><button class="primary">${t('Save attendance')}</button>`:''}</form><form id="work-form" class="card"><h2>${t('Post homework or exam')}</h2><label>${t('Type')}<select name="type"><option value="homework">${t('Homework')}</option><option value="exam">${t('Exam')}</option></select></label><label>${t('Title')}<input name="title" required maxlength="120"></label><label>${t('Due date')}<input name="dueDate" type="date" required min="${e(date)}" value="${e(date)}"></label><label>${t('Details')}<textarea name="details" rows="2" maxlength="1000"></textarea></label><button class="primary">${t('Post')}</button></form><section class="card"><h2>${t('Coming up')}</h2>${upcomingWork(group.id).map(row=>workRow(row,true)).join('')||`<p class="empty">${t('Nothing posted yet.')}</p>`}</section>`;
}

// ---------- Teacher: Notifications ----------
function noticeTitle(row){const lesson=row.after||row.before||{};return `${t(kindLabel[row.kind]||'Timetable change')}: ${pick(lesson,'subject')||''}`;}
const priorityTag=priority=>priority==='urgent'?`<span class="tag danger">${t('Urgent')}</span>`:priority==='important'?`<span class="tag warn">${t('Important')}</span>`:'';
function feed(){
 const items=[];
 for(const row of messages())items.push({key:'m'+row.id,kind:'message',category:row.category||'message',priority:row.priority||'normal',title:row.subject||t(categoryTitle[row.category]||'New message from school'),text:row.text,at:row.at,unread:!isRead(row),row});
 for(const row of notices())items.push({key:'n'+row.id,kind:'notice',category:'change',priority:'important',title:noticeTitle(row),text:datesLabel(row),at:row.at,unread:!isRead(row),row});
 for(const row of data.requests||[])if(row.status!=='pending'&&row.statusAt)items.push({key:'q'+row.id,kind:'request',category:'message',priority:'normal',title:`${t('Request answered')}: ${row.title}`,text:t({approved:'Approved',rejected:'Rejected',completed:'Completed'}[row.status]),at:row.statusAt,unread:!localRead().has('q'+row.id+row.status),row});
 for(const row of data.resources||[])if(row.important&&row.version>1)items.push({key:'d'+row.id,kind:'resource',category:'announcement',priority:'important',title:`${t('Document updated')}: ${row.title}`,text:row.changeNote||t('A new version is available.'),at:row.updatedAt,unread:!localRead().has('d'+row.id+'v'+row.version),row});
 for(const row of data.announcements||[])items.push({key:'a'+row.id,kind:'announcement',category:'announcement',priority:'normal',title:t('School announcement'),text:pick(row,'text'),at:row.createdAt||row.expiresAt,unread:!localRead().has(row.id),row});
 // Notifications the school posts from the control panel's community section.
 for(const row of data.communityNotices||[])items.push({key:'c'+row.id,kind:'announcement',category:'announcement',priority:'normal',title:row.title,text:row.text,at:row.at,unread:!localRead().has(row.id),row});
 return items.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
}
function lessonDetails(row){return row?`<dl class="mini"><dt>${t('Subject')}</dt><dd>${e(pick(row,'subject'))}</dd><dt>${t('Time')}</dt><dd>${e(row.start)} – ${e(row.end)}</dd><dt>${t('Class')}</dt><dd>${e(className(row.classId))}</dd><dt>${t('Room')}</dt><dd>${e(row.room||'—')}</dd>${row.substituteFor?`<dt>${t('Cover for')}</dt><dd>${e(row.substituteFor)}</dd>`:''}</dl>`:`<p class="muted">—</p>`;}
function noticeDetail(row){
 const ids=row.ids||[row.id],acked=row.ackAt||pendingFor('ack',body=>ids.includes(body.noticeId))[0],reported=row.conflict||pendingFor('conflict',body=>ids.includes(body.noticeId))[0];
 return `<div class="notice-detail">${row.dates?.length>1&&row.dates.length<=7?`<p class="muted">${t('Dates')}: ${row.dates.map(e).join('، ')}</p>`:''}<div class="compare"><div><span class="eyebrow">${t('Before')}</span>${lessonDetails(row.before)}</div><div><span class="eyebrow">${t('Now')}</span>${row.kind==='cancelled'?`<p class="tag danger">${t('Lesson cancelled')}</p>`:lessonDetails(row.after)}</div></div>${acked?`<p class="ack-done">✓ ${t('Acknowledged')}${acked.state?' · '+sendState(acked):''}</p>`:`<button type="button" class="primary" data-ack-notice="${e(row.id)}">${t('Acknowledge')}</button>`}${reported?`<p class="muted">${t('Conflict reported')}: ${e(reported.text||reported.body?.text||'')}${reported.state?' · '+sendState(reported):''}</p>`:conflictFor===row.id?`<form id="conflict-form" class="stack" data-notice="${e(row.id)}"><label>${t('What is the conflict?')}<textarea name="text" rows="3" maxlength="1000" required></textarea></label><button class="secondary">${t('Send to the school')}</button></form>`:`<button type="button" class="ghost" data-conflict="${e(row.id)}">${t('Report a conflict')}</button>`}</div>`;
}
function alerts(){
 const chips=[['all','All'],['message','Messages'],['change','Changes'],['announcement','Announcements'],['meeting','Meetings'],['event','Events'],['urgent','Urgent']];
 const list=feed().filter(item=>(filter.category==='all'||item.category===filter.category)&&(filter.priority==='all'||item.priority===filter.priority||(filter.priority==='important'&&item.priority==='urgent'))&&(!filter.unread||item.unread));
 return `<nav class="chips" aria-label="${t('Category')}">${chips.map(([key,label])=>`<button type="button" data-filter-category="${key}" class="${filter.category===key?'selected':''}" aria-pressed="${filter.category===key}">${t(label)}</button>`).join('')}</nav><div class="filter-row"><label class="inline">${t('Priority')}<select id="filter-priority">${[['all','Any'],['important','Important and urgent'],['urgent','Urgent only']].map(([key,label])=>`<option value="${key}" ${filter.priority===key?'selected':''}>${t(label)}</option>`).join('')}</select></label><label class="switch"><input type="checkbox" id="filter-unread" ${filter.unread?'checked':''}><span>${t('Unread only')}</span></label>${feed().some(item=>item.unread)?`<button type="button" class="link" data-action="read-all">${t('Mark all as read')}</button>`:''}</div><section class="card list">${list.map(item=>`<article class="feed-item ${item.unread?'unread':''} cat-${item.category}"><button type="button" class="feed-open" data-open="${e(item.key)}"><span class="feed-dot" aria-hidden="true"></span><span class="feed-body"><strong>${e(item.title)}</strong><span class="feed-text">${e(item.text)}</span><small>${e(stamp(item.at))}</small></span>${priorityTag(item.priority)}</button>${item.kind==='notice'&&openNotice===item.row.id?noticeDetail(item.row):''}</article>`).join('')||`<p class="empty">${t('Nothing here.')}</p>`}</section>`;
}

// ---------- Teacher: Messages ----------
function threads(){
 const map=new Map();for(const row of allMessages()){const list=map.get(row.threadId)||[];list.push(row);map.set(row.threadId,list);}
 for(const item of outbox().filter(row=>row.path==='reply')){const list=map.get(item.body.threadId);if(list&&!list.some(row=>row.clientId===item.clientId))list.push({id:item.clientId,threadId:item.body.threadId,direction:'up',text:item.body.text,at:item.at,pending:item});}
 return [...map.values()].map(list=>list.sort((a,b)=>a.at.localeCompare(b.at))).sort((a,b)=>b.at(-1).at.localeCompare(a.at(-1).at));
}
const needsAck=list=>list.some(row=>row.direction==='down'&&row.requireAck&&!row.ackAt&&!pendingFor('ack',body=>body.id===row.id).length);
function inbox(){
 if(isParent())return parentInbox();
 const list=threads();
 return `<section class="card list"><h2>${t('Messages')}</h2>${list.map(rows=>{const head=rows[0],last=rows.at(-1),fresh=rows.some(row=>row.direction==='down'&&!row.readAt);return `<article class="message thread-item ${fresh?'unread':''}"><button type="button" class="feed-open" data-thread="${e(head.threadId)}"><span class="feed-dot" aria-hidden="true"></span><span class="feed-body"><strong>${e(head.noticeId?t('Conflict report'):head.subject||head.fromName||t('School'))}</strong><p>${e(last.text)}</p><small>${e(last.direction==='up'?t('You'):last.fromName)} · ${e(stamp(last.at))}${rows.length>1?` · ${rows.length} ${t('messages')}`:''}</small></span><span class="thread-tags">${priorityTag(head.priority)}${needsAck(rows)?`<span class="tag warn">${t('Needs acknowledgement')}</span>`:''}</span></button></article>`;}).join('')||`<p class="empty">${t('No messages yet.')}</p>`}</section>`;
}
function thread(){
 const rows=threads().find(list=>list[0].threadId===threadId);if(!rows){tab='messages';return inbox();}
 const head=rows[0];
 return `<button type="button" class="back" data-tab="messages">‹ ${t('Messages')}</button><section class="card conversation"><header><h2>${e(head.noticeId?t('Conflict report'):head.subject||head.fromName||t('School'))}</h2>${priorityTag(head.priority)}</header>${rows.map(row=>{const ack=row.direction==='down'&&row.requireAck?(row.ackAt?`<p class="ack-done">✓ ${t('Acknowledged')}</p>`:pendingFor('ack',body=>body.id===row.id)[0]?`<p class="ack-done">✓ ${t('Acknowledged')} · ${sendState(pendingFor('ack',body=>body.id===row.id)[0])}</p>`:`<button type="button" class="primary" data-ack="${e(row.id)}">${t('Acknowledged')}</button>`):'';return `<div class="bubble ${row.direction==='up'?'mine':''}"><p>${e(row.text)}</p><small>${e(row.direction==='up'?t('You'):row.fromName)} · ${e(stamp(row.at))}${row.pending?' · '+sendState(row.pending):''}</small>${ack}</div>`;}).join('')}</section><form id="reply-form" class="card stack" data-thread="${e(head.threadId)}"><label>${t('Reply')}<textarea name="text" rows="3" maxlength="2000" required></textarea></label><button class="primary">${t('Send reply')}</button><p class="muted">${t('Replies go to the school staff in Faslii. They are sent when you are online.')}</p></form>`;
}


// ---------- Teacher: Requests ----------
let requestId=null,resourceQuery='',resourceCategory='all',bookmarkedOnly=false;
const requestTypeLabel={leave:'Leave',absence:'Absence',correction:'Timetable correction',maintenance:'Maintenance',technical:'Technical support'};
const requestStatusTag=status=>`<span class="tag ${status==='approved'||status==='completed'?'ok':status==='rejected'?'danger':'warn'}">${t({pending:'Pending',approved:'Approved',rejected:'Rejected',completed:'Completed'}[status]||status)}</span>`;
const myRequests=()=>{
 const list=[...(data.requests||[])];
 for(const item of outbox().filter(row=>row.path==='requests'&&row.state!=='sent'))if(!list.some(row=>row.clientId===item.clientId))list.push({id:item.clientId,clientId:item.clientId,type:item.body.type,title:item.body.title,details:item.body.details,from:item.body.from,to:item.body.to,status:'pending',comments:[],attachments:[],at:item.at,pending:item});
 return list.sort((a,b)=>String(b.updatedAt||b.at).localeCompare(String(a.updatedAt||a.at)));
};
const sizeText=bytes=>bytes>1048576?(bytes/1048576).toFixed(1)+' MB':Math.max(1,Math.round(bytes/1024))+' KB';
const fileButton=file=>`<button type="button" class="file-chip" data-file="${e(file.id)}" data-file-name="${e(file.name)}"><span aria-hidden="true">📎</span>${e(file.name)} <small>${e(sizeText(file.size))}</small></button>`;
const quickAccess=()=>isParent()?'':`<nav class="quick" aria-label="${t('Quick access')}"><button type="button" data-tab="requests"><strong>${t('Requests')}</strong><small>${(data.requests||[]).filter(row=>row.status==='pending').length} ${t('pending')}</small></button><button type="button" data-tab="resources"><strong>${t('Resources')}</strong><small>${resourceUpdates().length?`${resourceUpdates().length} ${t('updated')}`:`${(data.resources||[]).length} ${t('documents')}`}</small></button></nav>`;
function requestsView(){
 const list=myRequests();
 return `<button type="button" class="back" data-tab="today">‹ ${t('Today')}</button><section class="card list"><header class="list-head"><h2>${t('My requests')}</h2><button type="button" class="link" data-tab="request-new">+ ${t('New request')}</button></header>${list.map(row=>`<article class="feed-item"><button type="button" class="feed-open" data-request="${e(row.id)}"><span class="feed-dot" aria-hidden="true"></span><span class="feed-body"><strong>${e(row.title)}</strong><span class="feed-text">${t(requestTypeLabel[row.type]||row.type)}${row.from?` · ${e(row.from)}${row.to&&row.to!==row.from?' – '+e(row.to):''}`:''}</span><small>${e(stamp(row.updatedAt||row.at))}${row.pending?' · '+sendState(row.pending):''}</small></span>${requestStatusTag(row.status)}</button></article>`).join('')||`<p class="empty">${t('You have not sent any requests.')}</p>`}</section>`;
}
function requestForm(){
 const date=todayDate();
 return `<button type="button" class="back" data-tab="requests">‹ ${t('My requests')}</button><form id="request-form" class="card stack"><h2>${t('New request')}</h2><label>${t('Type')}<select name="type">${Object.entries(requestTypeLabel).map(([key,label])=>`<option value="${key}">${t(label)}</option>`).join('')}</select></label><label>${t('Title')}<input name="title" required maxlength="120"></label><div class="two"><label>${t('From')}<input name="from" type="date" min="${e(date)}"></label><label>${t('To')}<input name="to" type="date" min="${e(date)}"></label></div><p class="muted">${t('Dates are needed for leave and absence.')}</p><label>${t('Details')}<textarea name="details" rows="4" maxlength="2000"></textarea></label><label>${t('Attachments')}<input name="files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.txt"></label><p class="muted">${t('Up to 3 files, 5 MB each: PDF, images, Word, Excel, PowerPoint or text. Requests with attachments need a connection.')}</p><button class="primary">${t('Send request')}</button></form>`;
}
function requestDetail(){
 const row=myRequests().find(item=>item.id===requestId);if(!row){tab='requests';return requestsView();}
 return `<button type="button" class="back" data-tab="requests">‹ ${t('My requests')}</button><section class="card conversation"><header><h2>${e(row.title)}</h2>${requestStatusTag(row.status)}</header><dl class="mini"><dt>${t('Type')}</dt><dd>${t(requestTypeLabel[row.type]||row.type)}</dd>${row.from?`<dt>${t('Dates')}</dt><dd>${e(row.from)}${row.to&&row.to!==row.from?' – '+e(row.to):''}</dd>`:''}<dt>${t('Sent')}</dt><dd>${e(stamp(row.at))}</dd>${row.statusAt?`<dt>${t('Answered')}</dt><dd>${e(stamp(row.statusAt))}${row.statusBy?' · '+e(row.statusBy):''}</dd>`:''}</dl>${row.details?`<p class="pre">${e(row.details)}</p>`:''}${row.attachments.length?`<div class="files">${row.attachments.map(fileButton).join('')}</div>`:''}${row.comments.map(item=>`<div class="bubble ${item.staff?'':'mine'}">${item.status?`<p><b>${t('Status changed to')} ${t({approved:'Approved',rejected:'Rejected',completed:'Completed'}[item.status]||item.status)}</b></p>`:''}${item.text?`<p>${e(item.text)}</p>`:''}${(item.attachments||[]).length?`<div class="files">${item.attachments.map(fileButton).join('')}</div>`:''}<small>${e(item.staff?item.byName:t('You'))} · ${e(stamp(item.at))}</small></div>`).join('')}${pendingFor('requests/comment',body=>body.id===row.id).map(item=>`<div class="bubble mine"><p>${e(item.body.text)}</p><small>${t('You')} · ${sendState(item)}</small></div>`).join('')}</section>${row.pending?'':`<form id="request-comment-form" class="card stack" data-request="${e(row.id)}"><label>${t('Add a comment')}<textarea name="text" rows="2" maxlength="1000" required></textarea></label><button class="secondary">${t('Send comment')}</button></form>`}`;
}
const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,data:String(reader.result)});reader.onerror=()=>reject(Error('The file could not be read.'));reader.readAsDataURL(file);});

// ---------- Teacher: Resources ----------
const resourceCategoryLabel={policy:'Policies',teaching:'Teaching documents',form:'Forms',shared:'Shared files'};
const seenVersions=()=>{try{return JSON.parse(read('teacher-resource-seen'))||{};}catch{return {};}};
const bookmarks=()=>new Set(idList('teacher-bookmarks'));
// Important documents revised after the teacher last opened the library.
const resourceUpdates=()=>{const seen=seenVersions();return (data.resources||[]).filter(row=>row.important&&seen[row.id]!==undefined&&seen[row.id]<row.version||row.important&&row.version>1&&seen[row.id]===undefined&&Date.now()-Date.parse(row.updatedAt)<14*86400000);};
const markResourcesSeen=()=>write('teacher-resource-seen',JSON.stringify(Object.fromEntries((data.resources||[]).map(row=>[row.id,row.version]))));
let savedFiles=new Set();
function resourceList(){
 const marks=bookmarks(),seen=seenVersions(),query=resourceQuery.trim().toLowerCase();
 const list=(data.resources||[]).filter(row=>(resourceCategory==='all'||row.category===resourceCategory)&&(!bookmarkedOnly||marks.has(row.id))&&(!query||[row.title,row.description,row.changeNote,row.file?.name].join(' ').toLowerCase().includes(query))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 return list.map(row=>{const updated=seen[row.id]!==undefined&&seen[row.id]<row.version;return `<article class="resource"><div class="resource-head"><span class="feed-body"><strong>${e(row.title)}</strong><small>${t(resourceCategoryLabel[row.category]||row.category)} · ${t('Updated')} ${e(stamp(row.updatedAt))}${row.version>1?` · ${t('Version')} ${row.version}`:''}</small></span><button type="button" class="star ${marks.has(row.id)?'on':''}" data-bookmark="${e(row.id)}" aria-pressed="${marks.has(row.id)}" aria-label="${t(marks.has(row.id)?'Remove bookmark':'Bookmark')}">${marks.has(row.id)?'★':'☆'}</button></div>${row.description?`<p class="muted">${e(row.description)}</p>`:''}${updated&&row.changeNote?`<p class="tag warn">${t('What changed')}: ${e(row.changeNote)}</p>`:updated?`<p class="tag warn">${t('Revised since you last looked')}</p>`:''}${row.important?`<span class="tag">${t('Important')}</span>`:''}<div class="row-buttons">${row.file&&row.downloadable?`<button type="button" class="secondary" data-file="${e(row.file.id)}" data-file-name="${e(row.file.name)}">${t('Open')}</button><button type="button" class="ghost" data-save-file="${e(row.file.id)}" ${savedFiles.has(row.file.id)?'disabled':''}>${savedFiles.has(row.file.id)?'✓ '+t('Saved on this phone'):t('Save for offline')}</button>`:`<p class="muted">${t('View-only: ask the school for a copy.')}</p>`}</div></article>`;}).join('')||`<p class="empty">${t('No documents match.')}</p>`;
}
function resourcesView(){
 const chips=[['all','All'],...Object.entries(resourceCategoryLabel)];
 return `<button type="button" class="back" data-tab="today">‹ ${t('Today')}</button><label class="search">${t('Search documents')}<input id="resource-search" type="search" value="${e(resourceQuery)}" autocomplete="off"></label><nav class="chips" aria-label="${t('Category')}">${chips.map(([key,label])=>`<button type="button" data-res-category="${key}" class="${resourceCategory===key?'selected':''}" aria-pressed="${resourceCategory===key}">${t(label)}</button>`).join('')}</nav><label class="switch"><input type="checkbox" id="bookmarked-only" ${bookmarkedOnly?'checked':''}><span>${t('Bookmarked only')}</span></label><section class="card list" id="resource-list">${resourceList()}</section>`;
}

// Downloaded files are kept in IndexedDB so they open offline.
const fileDb=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('faslii-files',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function cachedFile(id){try{const db=await fileDb();return await new Promise(resolve=>{const get=db.transaction('files').objectStore('files').get(id);get.onsuccess=()=>resolve(get.result||null);get.onerror=()=>resolve(null);});}catch{return null;}}
async function cacheFile(id,value){try{const db=await fileDb();await new Promise(resolve=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(value,id);tx.oncomplete=resolve;tx.onerror=resolve;});}catch{}}
async function refreshSaved(){try{const db=await fileDb();savedFiles=await new Promise(resolve=>{const keys=db.transaction('files').objectStore('files').getAllKeys();keys.onsuccess=()=>resolve(new Set(keys.result));keys.onerror=()=>resolve(new Set());});}catch{savedFiles=new Set();}}
async function fetchFile(id){
 const cached=await cachedFile(id);if(cached)return cached;
 const res=await fetch(server+'/api/mobile/files/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token}});
 if(!res.ok)throw Object.assign(Error(res.status===404?'This file is no longer available.':'Could not reach the school. Check your connection.'),{status:res.status});
 return {blob:await res.blob()};
}
async function openFile(id,name){
 try{const {blob}=await fetchFile(id);const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name||'file';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 catch(error){toast(error.message||'Could not open the file.',true);}
}
async function saveFile(id){try{const {blob}=await fetchFile(id);await cacheFile(id,{blob,at:new Date().toISOString()});savedFiles.add(id);toast('Saved on this phone.');render();}catch(error){toast(error.message||'Could not save the file.',true);}}

// ---------- Profile ----------
function settings(){
 const lead=read('teacher-reminder')||'0',synced=read('teacher-synced'),parent=isParent(),p=prefs(),theme=read('teacher-theme')||'system',policy=data.policy||{};
 const categoriesList=[['message','Messages'],['announcement','Announcements'],['meeting','Meeting invitations'],['event','Events'],['change','Timetable changes'],['urgent','Urgent alerts']];
 const queued=outbox().filter(item=>item.state!=='sent');
 return `<section class="card profile"><div class="avatar" aria-hidden="true">${e((data.teacher.name||'?').trim().charAt(0))}</div><h2>${e(data.teacher.name)}</h2><p class="muted">${e(data.teacher.email)}</p><dl><dt>${t('School')}</dt><dd>${e(pick(data.school,'name'))}</dd>${parent?`<dt>${t('Children')}</dt><dd>${data.children.map(row=>e(pick(row,'name'))).join('، ')||'—'}</dd>`:`<dt>${t('Name on the timetable')}</dt><dd>${e(data.teacher.timetableName||t('Not set'))}</dd><dt>${t('Subjects')}</dt><dd>${(data.subjects||[]).map(e).join('، ')||'—'}</dd><dt>${t('Classes')}</dt><dd>${data.classes.map(row=>e(pick(row,'name'))).join('، ')||'—'}</dd>`}<dt>${t('Last updated')}</dt><dd>${synced?e(new Date(synced).toLocaleString(language==='ar'?'ar-QA':'en-GB')):'—'}</dd></dl><button type="button" class="secondary" data-action="sync">${t('Update now')}</button></section>${queued.length?`<section class="card"><h2>${t('Waiting to send')}</h2>${queued.map(item=>`<div class="status-line"><span>${e(t(item.label))}</span><span>${sendState(item)}</span></div>`).join('')}</section>`:''}${parent?`<form id="link-form" class="card"><h2>${t('Add a child')}</h2><p class="muted help">${t('Parents: enter the code the school gave you. Each code works once.')}</p><label>${t('Invitation code')}<input name="code" required maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="XXXXX-XXXXX" dir="ltr"></label><button class="primary">${t('Add')}</button></form>`:''}<section class="card"><h2>${t('Appearance')}</h2><label>${t('Language')}<select id="language"><option value="ar" ${language==='ar'?'selected':''}>العربية</option><option value="en" ${language==='en'?'selected':''}>English</option></select></label><label>${t('Theme')}<select id="theme">${[['system','Match the phone'],['light','Light'],['dark','Dark']].map(([key,label])=>`<option value="${key}" ${theme===key?'selected':''}>${t(label)}</option>`).join('')}</select></label></section>${parent?'':`<section class="card prefs"><h2>${t('Notifications')}</h2>${categoriesList.map(([key,label])=>`<label class="switch row"><span>${t(label)}</span><input type="checkbox" data-pref-category="${key}" ${p.categories?.[key]!==false?'checked':''}></label>`).join('')}<label class="switch row"><span>${t('Hide message text on the lock screen')}</span><input type="checkbox" data-pref="hidePreview" ${p.hidePreview!==false?'checked':''}></label>${native?`<label>${t('Lesson reminders')}<select id="reminder">${[['0',t('Off')],...['5','10','15'].map(value=>[value,`${value} ${t('minutes before')}`])].map(([value,label])=>`<option value="${value}" ${lead===value?'selected':''}>${e(label)}</option>`).join('')}</select></label><label class="switch row"><span>${t('Alert when a lesson starts')}</span><input type="checkbox" data-pref="lessonStart" ${p.lessonStart?'checked':''}></label><label class="switch row"><span>${t('Alert when a lesson ends')}</span><input type="checkbox" data-pref="lessonEnd" ${p.lessonEnd?'checked':''}></label><p class="muted">${t('Reminders are on this phone and work offline after the app has updated once.')}</p>`:''}<h3>${t('Quiet hours')}</h3><label class="switch row"><span>${t('Silence notifications at night')}</span><input type="checkbox" data-pref="quietEnabled" ${p.quietEnabled?'checked':''}></label><div class="two"><label>${t('From')}<input type="time" data-pref-time="quietStart" value="${e(p.quietStart||'21:00')}"></label><label>${t('To')}<input type="time" data-pref-time="quietEnd" value="${e(p.quietEnd||'06:30')}"></label></div><p class="muted policy">${policy.urgentBypassQuiet?e(language==='ar'?policy.noteAr||policy.noteEn:policy.noteEn||policy.noteAr):t('Quiet hours silence every notification, including urgent alerts.')}</p></section>`}<form id="password-form" class="card"><h2>${t('Change password')}</h2><label>${t('Current password')}<input name="currentPassword" type="password" required autocomplete="current-password" maxlength="256"></label><label>${t('New password')}<input name="password" type="password" required minlength="12" autocomplete="new-password" maxlength="256"></label><p class="muted">${t('At least 12 characters. Other phones are signed out.')}</p><button class="secondary">${t('Change password')}</button></form><section class="card"><p class="muted">${t('Timetable times use the school timezone.')} ${e(data.school.timezone)}</p><button type="button" class="ghost danger" data-action="logout">${t('Sign out')}</button></section>`;
}
function savePrefs(patch){const next={...prefs(),...patch,categories:{...prefs().categories,...patch.categories||{}}};data.preferences=next;write('teacher-data',JSON.stringify(data));queue('preferences',next,'Notification settings',true);scheduleReminders();}

const passwordField=(name,label,auto)=>`<label class="password-field">${t(label)}<span class="password-wrap"><input name="${name}" type="password" autocomplete="${auto}" required maxlength="256"><button type="button" class="show-password" data-show-password aria-pressed="false">${t('Show')}</button></span></label>`;
const login=()=>`<main class="login"><img src="icon.svg" alt="" width="72" height="72"><h1>${t('Faslii')}</h1><p>${t('For teachers and parents')}</p>${authMode==='login'?`<form id="login-form"><label>${t('Email')}<input name="email" type="email" autocomplete="username" required maxlength="180"></label>${passwordField('password','Password','current-password')}<p id="login-error" role="alert"></p><button class="primary">${t('Sign in')}</button><p class="muted help">${t('Forgot your password? Ask your school administrator to reset it.')}</p></form><button type="button" class="secondary" data-action="join">${t('I have an invitation code')}</button><p class="muted">${t('Teachers get their sign-in from the school. Parents get an invitation code.')}</p>`:`<form id="join-form"><label>${t('Invitation code')}<input name="code" required maxlength="20" autocapitalize="characters" autocomplete="off"></label><label>${t('Your name')}<input name="name" required maxlength="100" autocomplete="name"></label><label>${t('Email')}<input name="email" type="email" autocomplete="username" required maxlength="180"></label>${passwordField('password','Password','new-password')}${passwordField('confirm','Confirm password','new-password')}<p class="muted">${t('At least 12 characters. If you already have an account, use the same email and password to add this child.')}</p><p id="login-error" role="alert"></p><button class="primary">${t('Join')}</button></form><button type="button" class="ghost" data-action="login">${t('Back to sign in')}</button>`}<button type="button" class="ghost" data-action="language">${language==='en'?'العربية':'English'}</button></main>`;
function tabs(){
 const list=isParent()?[['today','Today'],['week','Week'],['homework','Homework'],['attendance','Attendance'],['messages','Messages']]:[['today','Today'],['alerts','Notifications'],['messages','Messages'],['settings','Profile']];
 const active=key=>key===tab||(key==='today'&&['week','month','class','requests','request-new','request','resources'].includes(tab)&&!isParent())||(key==='messages'&&tab==='thread');
 const badge=key=>{const count=key==='messages'?unread().length:key==='alerts'?unreadNotices().length+messages().filter(row=>!isRead(row)&&row.priority!=='normal').length:0;return count?`<b class="tab-badge">${count}</b>`:'';};
 return `<nav class="tabs" data-count="${list.length}">${list.map(([key,label])=>`<button type="button" data-tab="${key}" class="${active(key)?'active':''}" ${active(key)?'aria-current="page"':''}>${svg(key)}<span>${t(label)}</span>${badge(key)}</button>`).join('')}</nav>`;
}
// The phone's Back button and the browser's Back go to the previous screen instead of closing the app.
let historyKey=null,restoring=false;
function remember(){const key=JSON.stringify([tab,threadId,requestId]);if(!restoring&&key!==historyKey){if(historyKey===null)history.replaceState({faslii:key},'');else history.pushState({faslii:key},'');}if(historyKey!==null&&key!==historyKey){const note=document.querySelector('#toast');if(note&&!note.classList.contains('bad')){clearTimeout(toast.timer);note.className='';}}historyKey=key;restoring=false;}
window.addEventListener('popstate',event=>{const key=event.state?.faslii;if(!key||!token||!data)return;[tab,threadId,requestId]=JSON.parse(key);conflictFor=null;restoring=true;window.scrollTo(0,0);render();});
function render(){
 if(!token||!data){root.innerHTML=login();return;}
 remember();
 const synced=read('teacher-synced'),scroll=window.scrollY;lastKey=viewKey();
 const body=tab==='today'?today():tab==='week'?week():tab==='month'?month():tab==='alerts'?alerts():tab==='messages'?inbox():tab==='thread'?thread():tab==='requests'?requestsView():tab==='request-new'?requestForm():tab==='request'?requestDetail():tab==='resources'?resourcesView():tab==='class'?classTab():tab==='homework'?homework():tab==='attendance'?attendanceTab():settings();
 const waiting=outbox().filter(item=>item.state==='pending').length;
 root.innerHTML=`<header class="top"><div><strong>${e(pick(data.school,'name'))}</strong><small data-clock>${clockText(schoolClock(now(),data.school.timezone))}</small>${isParent()?`<button type="button" class="gear ${tab==='settings'?'active':''}" data-tab="settings" aria-label="${t('Settings')}">⚙</button>`:''}</div></header>${online?'':`<div class="offline" role="status"><span class="dot"></span>${t('Offline. Showing the last saved timetable.')}${synced?` ${t('Last updated')}: ${e(new Date(synced).toLocaleString(language==='ar'?'ar-QA':'en-GB'))}`:''}${waiting?` · ${waiting} ${t('waiting to send')}`:''}</div>`}<main class="content" data-view="${e(tab)}">${body}</main>${tabs()}`;
 window.scrollTo(0,scroll);
}
function viewKey(){if(!data)return '';const state=teacherNow(view(),now());return [state.clock.date,state.current?.id,state.next?.id].join('|');}
const saveAction=async(work,done)=>{try{await work();if(done)toast(done);await sync();render();}catch(failure){toast(failure.status?failure.message:'Could not reach the school. Check your connection.',true);}};
function openItem(key){
 const item=feed().find(row=>row.key===key);if(!item)return;
 if(item.kind==='message'){markRead([item.row]);threadId=item.row.threadId;tab='thread';window.scrollTo(0,0);}
 else if(item.kind==='notice'){markRead([item.row]);openNotice=openNotice===item.row.id?null:item.row.id;}
 else if(item.kind==='request'){const seen=localRead();seen.add('q'+item.row.id+item.row.status);write('teacher-read-messages',JSON.stringify([...seen]));requestId=item.row.id;tab='request';}
 else if(item.kind==='resource'){const seen=localRead();seen.add('d'+item.row.id+'v'+item.row.version);write('teacher-read-messages',JSON.stringify([...seen]));resourceQuery=item.row.title;tab='resources';refreshSaved().then(()=>render());}
 else{const seen=localRead();seen.add(item.row.id);write('teacher-read-messages',JSON.stringify([...seen]));}
 render();
}
root.addEventListener('click',async event=>{
 const node=event.target.closest('button');if(!node)return;
 if(node.dataset.showPassword!==undefined){const input=node.previousElementSibling,show=input.type==='password';input.type=show?'text':'password';node.setAttribute('aria-pressed',String(show));node.textContent=t(show?'Hide':'Show');input.focus();return;}
 if(node.dataset.tab){if(tab==='resources'&&node.dataset.tab!=='resources')markResourcesSeen();tab=node.dataset.tab;if(tab==='resources')refreshSaved().then(()=>{if(tab==='resources')render();});if(tab==='messages')markRead();if(tab!=='alerts')conflictFor=null;window.scrollTo(0,0);render();}
 if(node.dataset.request){requestId=node.dataset.request;tab='request';window.scrollTo(0,0);render();}
 if(node.dataset.file)await openFile(node.dataset.file,node.dataset.fileName);
 if(node.dataset.saveFile)await saveFile(node.dataset.saveFile);
 if(node.dataset.resCategory){resourceCategory=node.dataset.resCategory;render();}
 if(node.dataset.bookmark){const marks=bookmarks();marks.has(node.dataset.bookmark)?marks.delete(node.dataset.bookmark):marks.add(node.dataset.bookmark);write('teacher-bookmarks',JSON.stringify([...marks]));render();}
 if(node.dataset.selectDay){selectedDay=Number(node.dataset.selectDay);render();}
 if(node.dataset.weekShift){selectedDay=Math.max(0,Math.min(34,Math.floor(selectedDay/7)*7+Number(node.dataset.weekShift)));render();}
 if(node.dataset.monthDay){selectedDay=Number(node.dataset.monthDay);tab='week';render();}
 if(node.dataset.child){childId=node.dataset.child;write('parent-child',childId);render();}
 if(node.dataset.filterCategory){filter.category=node.dataset.filterCategory;render();}
 if(node.dataset.open)openItem(node.dataset.open);
 if(node.dataset.openNotice){openNotice=node.dataset.openNotice;tab='alerts';const row=notices().find(item=>item.id===openNotice);if(row)markRead([row]);render();}
 if(node.dataset.thread){threadId=node.dataset.thread;tab='thread';const rows=allMessages().filter(row=>row.threadId===threadId&&row.direction==='down');markRead(rows);window.scrollTo(0,0);render();}
 if(node.dataset.ack){queue('ack',{id:node.dataset.ack},'Acknowledgement');toast('Acknowledged.');render();}
 if(node.dataset.ackNotice){const group=notices().find(row=>row.id===node.dataset.ackNotice);for(const value of group?.ids||[node.dataset.ackNotice])queue('ack',{noticeId:value},'Acknowledgement');toast('Acknowledged.');render();}
 if(node.dataset.conflict){conflictFor=node.dataset.conflict;render();root.querySelector('#conflict-form textarea')?.focus();}
 if(node.dataset.retry){updateItem(node.dataset.retry,{state:'pending',tries:0});await flush();render();}
 if(node.dataset.action==='read-all'){markRead([...messages(),...notices()]);const seen=localRead();(data.announcements||[]).forEach(row=>seen.add(row.id));write('teacher-read-messages',JSON.stringify([...seen]));render();}
 if(node.dataset.action==='join'||node.dataset.action==='login'){authMode=node.dataset.action;render();}
 if(node.dataset.action==='language'){setLanguage(language==='en'?'ar':'en');render();}
 if(node.dataset.action==='sync')await sync(true);
 if(node.dataset.action==='logout'){try{await api('logout',{pushToken:read('teacher-push-token')||undefined});await pushPlugin()?.unregister?.();}catch{}write('teacher-push',null);write('teacher-push-token',null);clearAccount();authMode='login';render();}
 if(node.dataset.decide)await saveAction(()=>api('absence/decide',{id:node.dataset.decide,status:node.dataset.status}),'Saved.');
 if(node.dataset.removeWork)await saveAction(()=>api('work/remove',{id:node.dataset.removeWork}),'Saved.');
});
root.addEventListener('input',event=>{if(event.target.id==='resource-search'){resourceQuery=event.target.value;const list=root.querySelector('#resource-list');if(list)list.innerHTML=resourceList();return;}const form=event.target.form;if(form&&!['login-form','join-form'].includes(form.id))form.dataset.dirty='1';});
root.addEventListener('change',async event=>{
 const target=event.target;
 if(target.id==='week-view'){weekView=target.value;render();}
 if(target.id==='class-select'){classId=target.value;marks={};render();}
 if(target.id==='filter-priority'){filter.priority=target.value;render();}
 if(target.id==='filter-unread'){filter.unread=target.checked;render();}
 if(target.id==='bookmarked-only'){bookmarkedOnly=target.checked;render();}
 if(target.name?.startsWith('mark:')){marks[target.name.slice(5)]=target.value;render();const form=root.querySelector('#attendance-form');if(form)form.dataset.dirty='1';}
 if(target.id==='language'){setLanguage(target.value);render();await scheduleReminders();}
 if(target.id==='theme'){write('teacher-theme',target.value);applyTheme();}
 if(target.dataset.prefCategory)savePrefs({categories:{[target.dataset.prefCategory]:target.checked}});
 if(target.dataset.pref)savePrefs({[target.dataset.pref]:target.checked});
 if(target.dataset.prefTime&&/^\d\d:\d\d$/.test(target.value))savePrefs({[target.dataset.prefTime]:target.value});
 if(target.id==='reminder'){
  const plugin=notifications(),value=target.value;
  if(value!=='0'&&plugin){const permission=await plugin.requestPermissions().catch(()=>({display:'denied'}));if(permission.display!=='granted'){target.value='0';write('teacher-reminder','0');toast('Allow notifications in your phone settings to get reminders.',true);return;}}
  write('teacher-reminder',value);savePrefs({reminderMinutes:Number(value)});toast('Reminders saved.');
 }
});
async function enter(issued){token=issued.token;write('teacher-token',token);applyData(await loadData());markNotified();online=true;tab='today';render();await scheduleReminders();setupPush();}
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
  if(form.id==='request-form'){
   const picked=[...(form.querySelector('[name=files]').files||[])];
   if(picked.length>3){toast('Attach up to 3 files.',true);return;}
   if(picked.some(file=>file.size>5*1024*1024)){toast('Each file must be 5 MB or smaller.',true);return;}
   const body={type:values.type,title:String(values.title||'').trim(),details:String(values.details||'').trim(),from:values.from||'',to:values.to||''};
   if(['leave','absence'].includes(body.type)&&!body.from){toast('Choose the dates.',true);return;}
   if(picked.length){
    try{const attachments=await Promise.all(picked.map(readFile));await api('requests',{...body,attachments,clientId:newKey()});delete form.dataset.dirty;toast('Request sent.');await sync();tab='requests';render();}
    catch(failure){toast(failure.status?failure.message:'Requests with attachments need a connection. Try again when you are online.',true);}
   }else{queue('requests',body,'Request');delete form.dataset.dirty;toast(online?'Request sent.':'Saved. It will be sent when you are online.');tab='requests';render();}
  }
  if(form.id==='request-comment-form'){const text=String(values.text||'').trim();if(text){queue('requests/comment',{id:form.dataset.request,text},'Comment');delete form.dataset.dirty;render();}}
  if(form.id==='reply-form'){const text=String(values.text||'').trim();if(text){queue('reply',{threadId:form.dataset.thread,text},'Reply');delete form.dataset.dirty;render();}}
  if(form.id==='conflict-form'){const text=String(values.text||'').trim();if(text){queue('conflict',{noticeId:form.dataset.notice,text},'Conflict report');conflictFor=null;delete form.dataset.dirty;toast('Sent to the school.');render();}}
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
render();sync();if(token)setupPush();
