import {scheduleState,displayPresentation} from '/schedule.mjs';
import {arabic,escape as e} from './i18n.js';
const params=new URLSearchParams(location.search),token=params.get('token')||'',preview=params.has('preview'),overlay=params.has('overlay'),node=document.querySelector('#display');
document.body.classList.add(preview?'preview':overlay?'overlay':'full');
// Keep the hover target mounted while live clock and timetable text update.
node.innerHTML='<div class="panel-shell"><section class="ribbon"></section><div class="display-status"></div></div>';
const panel=node.querySelector('.ribbon'),shell=node.querySelector('.panel-shell'),statusNode=node.querySelector('.display-status');
const cinema=document.createElement('section');cinema.className='cinema';cinema.hidden=true;node.after(cinema);
let presentation='panel',popupTimer=null,popupUntil=0,dismissedKey=null,activityKey=null;
const exitButton=document.createElement('button');exitButton.type='button';exitButton.className='exit-fullscreen';exitButton.hidden=true;cinema.after(exitButton);
function exitFullscreen(){dismissedKey=activityKey;if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});render();}
exitButton.addEventListener('click',exitFullscreen);
const escapeFullscreen=event=>{if(event.key==='Escape'&&presentation==='break')exitFullscreen();};
window.addEventListener('keydown',escapeFullscreen);
function startPopup(){clearTimeout(popupTimer);popupUntil=performance.now()+5000;popupTimer=setTimeout(()=>{popupUntil=0;popupTimer=null;render();},5000);}
const photoUrl=path=>path?.startsWith('/api/images/')?path+'?token='+encodeURIComponent(token):path;
function setPresentation(value){presentation=value;const full=value==='break';document.body.classList.toggle('cinematic',full);document.body.classList.toggle('clock-only',value==='clock');document.body.classList.toggle('event-popup',performance.now()<popupUntil);cinema.hidden=!full;exitButton.hidden=!full;if(!full){cinema.textContent='';delete cinema.dataset.image;}}
const hoverMedia=matchMedia('(hover: hover) and (pointer: fine)');
let hoverTimer=null,pointerInside=false,disposed=false,measureFrame=0;
function setHovered(inside,native=false){
 if(disposed)return;
 if(inside&&presentation!=='panel')return;
 if(inside&&!native&&!hoverMedia.matches)return;
 if(inside===pointerInside)return;
 pointerInside=inside;clearTimeout(hoverTimer);hoverTimer=null;
 if(!inside){panel.classList.remove('is-hovered');return;}
 hoverTimer=setTimeout(()=>{hoverTimer=null;if(pointerInside&&!disposed)panel.classList.add('is-hovered');},500);
}
const enter=event=>{if(event.pointerType!=='touch')setHovered(true);};
const leave=()=>setHovered(false);
panel.addEventListener('pointerenter',enter);panel.addEventListener('pointerleave',leave);panel.addEventListener('pointercancel',leave);
hoverMedia.addEventListener('change',leave);window.addEventListener('blur',leave);
const unsubscribePointer=window.schoolDesktop?.onPointer?.(inside=>setHovered(inside,true));
function measure(){
 if(!overlay||!window.schoolDesktop?.reportLayout||disposed||measureFrame)return;
 measureFrame=requestAnimationFrame(()=>{measureFrame=0;const rect=shell.getBoundingClientRect();window.schoolDesktop.reportLayout({x:rect.x,y:rect.y,width:panel.offsetWidth,height:panel.offsetHeight,contentHeight:document.body.offsetHeight,expanded:presentation==='break',clockOnly:presentation==='clock',centered:performance.now()<popupUntil});});
}
const resizeObserver=new ResizeObserver(measure);resizeObserver.observe(document.body);resizeObserver.observe(shell);resizeObserver.observe(cinema);resizeObserver.observe(document.querySelector('#alert'));
window.addEventListener('resize',measure);

let data=null,offset=0,online=false,invalid=false,lastSync=0,lastKey=null,lastRevision=null,lastTick=Date.now();const alerted=new Set();
const cache='school-display-cache:'+token;
try{const saved=JSON.parse(localStorage.getItem(cache));if(saved?.data){data=saved.data;offset=Number(saved.offset)||0;lastSync=Number(saved.lastSync)||0;}}catch{}
const label=key=>data?.settings.language==='ar'?(arabic[key]||key):data?.settings.language==='both'?`${key} · ${arabic[key]||key}`:key;
function text(row,en,ar){const mode=data.settings.language;if(mode==='ar')return e(row[ar]||row[en]);if(mode==='en')return e(row[en]||row[ar]);return `${e(row[en]||row[ar])}${row[ar]&&row[ar]!==row[en]?`<span class="secondary-language" dir="rtl">${e(row[ar])}</span>`:''}`;}
const duration=seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.max(0,seconds)%60).padStart(2,'0')}`;
const notifications=[];let showing=false,notificationTimer=null;
function showNotification(){if(disposed||showing||!notifications.length)return;showing=true;const {title,detail}=notifications.shift(),el=document.querySelector('#alert');const icon=({'Lesson started':'▶','Lesson finished':'✓','Break started':'☕','Break finished':'✓','Starting soon':'◷','Schedule updated':'↻'})[title]||'◷';el.innerHTML=`<strong>${icon} ${e(label(title))}</strong><span>${e(detail)}</span>`;el.className='show';if(title==='Break finished'){const image=document.createElement('img');image.className='return-photo';image.src=photoUrl(data?.settings.returnImage||'/images/student-return.png');image.alt=label('Students ready for their next school activity');el.prepend(image);}if(data?.settings.sound&&window.schoolDesktop)window.schoolDesktop.alert();notificationTimer=setTimeout(()=>{notificationTimer=null;el.className='';showing=false;showNotification();},4000);}
function notify(key,title,detail=''){if(preview||alerted.has(key))return;alerted.add(key);if(alerted.size>200)alerted.delete(alerted.values().next().value);notifications.push({title,detail});showNotification();}
function render(){if(disposed)return;if(!data){clearTimeout(popupTimer);popupUntil=0;setPresentation('panel');leave();panel.classList.remove('ribbon','break','lesson','paused');panel.classList.add('is-empty');panel.innerHTML=`<section class="empty-display"><h1>School Display</h1><p>${invalid?'API access lost. Ask the administrator to reopen the display.':'Connecting to the local school timetable...'}</p></section>`;statusNode.textContent='';measure();return;}
 const s=data.settings,lang=s.language;document.documentElement.lang=lang==='ar'?'ar':'en';document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.body.classList.toggle('compact',s.size==='compact');
 const now=new Date(Date.now()+offset),state=scheduleState(data.schedule,s,now),current=state.current,next=state.next,key=`${state.clock.date}:${current?.id||state.phase}`;
 activityKey=key;
 const changed=lastKey!==null&&lastKey!==key&&lastTick>Date.now()-15000;
 if(changed){dismissedKey=null;if(current&&!s.paused&&data.configured&&data.publishedAt&&!preview)startPopup();else{clearTimeout(popupTimer);popupTimer=null;popupUntil=0;}}
 let mode=displayPresentation(state,s,Boolean(data.configured&&data.publishedAt));
 if((mode==='break'&&dismissedKey===key)||performance.now()<popupUntil)mode='panel';
 setPresentation(mode);if(mode!=='panel')leave();
 exitButton.textContent=label('Exit full screen');exitButton.setAttribute('aria-label',label('Exit full screen'));
 const currentName=current?(lang==='ar'?current.subjectAr||current.subjectEn:current.subjectEn||current.subjectAr):'';
 if(!s.paused&&data.configured){if(lastKey!==null&&lastKey!==key&&lastTick>Date.now()-15000){const prev=render.previous;if(prev?.current){notify(lastKey+':end',prev.current.type==='break'?'Break finished':prev.current.type==='event'?'Event finished':'Lesson finished');}if(current)notify(key+':start',current.type==='break'?'Break started':current.type==='event'?'Event started':'Lesson started',currentName);}if(next&&s.alertMinutes>0&&state.remaining>0){const until=(Number(next.start.slice(0,2))*60+Number(next.start.slice(3)))*60-state.clock.seconds;if(until>0&&until<=s.alertMinutes*60)notify(`${state.clock.date}:${next.id}:soon`,'Starting soon',`${lang==='ar'?next.subjectAr||next.subjectEn:next.subjectEn||next.subjectAr} · ${next.start}`);}}
 lastKey=key;lastTick=Date.now();render.previous=state;
 const phases={'before-school':'Before school',gap:'Between lessons',finished:'School day completed','no-school':'No lessons scheduled',holiday:'School holiday'};
 const heading=!data.configured?'Waiting for administrator':s.paused?'Display paused':!data.publishedAt?'Not published yet':current?null:phases[state.phase];
 const icon=current?.type==='break'?'☕':current?'▤':state.phase==='finished'?'✓':state.phase==='holiday'?'☀':'◷';
 const clock=new Intl.DateTimeFormat(lang==='ar'?'ar-QA':'en-GB',{timeZone:s.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 const announcement=lang==='ar'?s.announcementAr:lang==='both'?[s.announcementEn,s.announcementAr].filter(Boolean).join(' · '):s.announcementEn;
 panel.classList.add('ribbon');panel.classList.remove('is-empty');panel.classList.toggle('break',current?.type==='break');panel.classList.toggle('lesson',current?.type==='lesson');panel.classList.toggle('paused',s.paused);
 panel.innerHTML=mode==='clock'?`<time class="idle-clock" aria-label="${e(label('School time'))}">${clock}</time>`:`<div class="school-mark"><img src="/icon.svg" alt=""><div><strong>${text(s,'schoolEn','schoolAr')}</strong><small><time class="live-clock">${clock}</time> &middot; ${e(label('School time'))}</small><span class="publication">${e(label(data.publishedAt?'Published':'Not published yet'))}${data.publishedAt?' &middot; #'+data.revision:''}</span></div></div><div class="current"><span class="phase-icon" aria-hidden="true">${icon}</span><div class="activity"><h1>${heading?e(label(heading)):text(current,'subjectEn','subjectAr')}</h1><p>${!data.configured?e(label('Open the local control panel to set up your school.')):current&&!s.paused?text(current,'teacherEn','teacherAr')+(current.room?'<span class="room">'+e(current.room)+'</span>':''):e(announcement)}</p></div><div class="countdown"><small>${e(label(current?'Remaining':'Starts in'))}</small><strong>${s.paused||!data.publishedAt||state.remaining===0?'&mdash;':duration(state.remaining)}</strong></div></div><div class="next"><small>${e(label('Next up'))}</small><strong>${next?text(next,'subjectEn','subjectAr'):e(label('No next activity'))}</strong>${next?`<div><time>${next.start}</time></div>`:''}</div>`;
 statusNode.classList.toggle('offline',!online);
 statusNode.innerHTML=`<span class="network-state"><span class="network-dot"></span>${e(label(invalid?'API access lost. Ask the administrator to reopen the display.':online?'Live':'Offline · using saved timetable'))}</span><span class="last-sync">${e(label('Last sync'))} ${lastSync?new Date(lastSync).toLocaleTimeString(lang==='ar'?'ar':'en-GB'):'&mdash;'}</span><span class="announcement">${e(announcement)}</span>`;
 if(mode==='break'){
  const isBreak=mode==='break',image=isBreak?s.breakImage||'/images/student-break.png':s.returnImage||'/images/student-return.png';
  const heroTitle=isBreak?label('Time for a break'):label(phases[state.phase]||'School day completed');
  const heroDetail=isBreak?label('Relax, recharge and get ready for your next lesson.'):label('No more activities today.');
  const src=photoUrl(image);
  if(cinema.dataset.image!==src){cinema.innerHTML='<div class="cinema-copy"></div><figure class="cinema-photo"><img alt=""></figure>';cinema.querySelector('img').src=src;cinema.dataset.image=src;}
  const photo=cinema.querySelector('img');photo.alt=label(isBreak?'Students enjoying their school break':'Students ready for their next school activity');
  cinema.querySelector('.cinema-copy').innerHTML=`<span class="cinema-eyebrow">${e(label(isBreak?'Break time':phases[state.phase]||'School day completed'))}</span><h2>${e(heroTitle)}</h2><p class="cinema-description">${e(heroDetail)}</p>${isBreak?`<div class="cinema-countdown"><span>${e(label('Break ends in'))}</span><strong>${duration(state.remaining)}</strong></div>`:''}<div class="cinema-next"><span>${e(label('Next up'))}</span><strong>${next?text(next,'subjectEn','subjectAr'):e(label('No next activity'))}</strong>${next?`<small>${text(next,'teacherEn','teacherAr')}</small><time>${next.start}</time>`:''}</div>`;
 }
 measure();
}
let fetching=false;
async function sync(){if(fetching||disposed)return;fetching=true;try{const begin=Date.now(),res=await fetch('/api/display?token='+encodeURIComponent(token),{signal:AbortSignal.timeout(5000)});if(res.status===403){invalid=true;data=null;localStorage.removeItem(cache);render();return;}if(!res.ok)throw Error();const result=await res.json();offset=result.serverTime-(begin+Date.now())/2;data=result;online=true;invalid=false;lastSync=Date.now();if(lastRevision!==null&&lastRevision!==result.revision){lastKey=null;notify('revision:'+result.revision,'Schedule updated');}lastRevision=result.revision;try{localStorage.setItem(cache,JSON.stringify({data,offset,lastSync}));}catch{}render();}catch{online=false;render();}finally{fetching=false;}}
render();sync();const renderInterval=setInterval(render,1000),syncInterval=setInterval(sync,3000);
const visible=()=>{if(!document.hidden)sync();};window.addEventListener('online',sync);document.addEventListener('visibilitychange',visible);
window.addEventListener('pageshow',event=>{if(event.persisted)sync();});
window.addEventListener('pagehide',event=>{if(event.persisted){leave();return;}disposed=true;clearTimeout(notificationTimer);notifications.length=0;clearTimeout(hoverTimer);clearTimeout(popupTimer);exitButton.removeEventListener('click',exitFullscreen);window.removeEventListener('keydown',escapeFullscreen);clearInterval(renderInterval);clearInterval(syncInterval);cancelAnimationFrame(measureFrame);resizeObserver.disconnect();unsubscribePointer?.();panel.removeEventListener('pointerenter',enter);panel.removeEventListener('pointerleave',leave);panel.removeEventListener('pointercancel',leave);hoverMedia.removeEventListener('change',leave);window.removeEventListener('blur',leave);window.removeEventListener('resize',measure);window.removeEventListener('online',sync);document.removeEventListener('visibilitychange',visible);});
