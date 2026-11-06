import {createLessonFlow} from '/lesson-flow.mjs';
import {renderLessonScreen} from './lesson-screen.js';
import {applyTheme} from './theme.js';
import {scheduleState,displayPresentation} from '/schedule.mjs';
import {arabic,escape as e} from './i18n.js';
const params=new URLSearchParams(location.search),token=params.get('token')||'',preview=params.has('preview'),overlay=params.has('overlay'),node=document.querySelector('#display');
document.body.classList.add(preview?'preview':overlay?'overlay':'full');
// Keep the hover target mounted while live clock and timetable text update.
node.innerHTML='<div class="panel-shell"><section class="ribbon"></section><div class="display-status"></div></div>';
const panel=node.querySelector('.ribbon'),shell=node.querySelector('.panel-shell'),statusNode=node.querySelector('.display-status');
const cinema=document.createElement('section');cinema.className='cinema';cinema.hidden=true;node.after(cinema);
let panelPreview=null;
// Reusable stroke icons; currentColor follows each state's accent token.
const svg=d=>`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const icons={lesson:svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/>'),break:svg('<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3.5v2M12 3.5v2"/>'),paused:svg('<rect x="6.5" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2"/>'),finished:svg('<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16.2 9.5"/>'),holiday:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),idle:svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>'),event:svg('<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'),updated:svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/>'),close:svg('<path d="M6 6l12 12M18 6 6 18"/>')};
const backdrop=document.createElement('div');backdrop.className='sheet-backdrop';backdrop.hidden=true;document.querySelector('#alert').before(backdrop);
const updatePreview=event=>{if(!preview||!params.has('adjust')||event.source!==parent||event.origin!==location.origin||event.data?.type!=='school-panel-preview')return;const s=event.data.settings;if(!s||!Number.isInteger(s.panelWidth)||s.panelWidth<420||s.panelWidth>1200||!Number.isInteger(s.textScale)||s.textScale<80||s.textScale>140||!Number.isInteger(s.edgeMargin)||s.edgeMargin<12||s.edgeMargin>120||!['left','center','right'].includes(s.horizontal))return;panelPreview=s;render();};
window.addEventListener('message',updatePreview);
const lessonFlow=createLessonFlow();let dockKey=null,dockFrame=0;
let presentation='panel',popupTimer=null,popupUntil=0,dismissedKey=null,activityKey=null;
const exitButton=document.createElement('button');exitButton.type='button';exitButton.className='exit-fullscreen';exitButton.hidden=true;cinema.after(exitButton);
function exitFullscreen(){dismissedKey=activityKey;if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});render();}
exitButton.addEventListener('click',exitFullscreen);
const escapeFullscreen=event=>{if(event.key==='Escape'&&document.body.classList.contains('cinematic'))exitFullscreen();};
window.addEventListener('keydown',escapeFullscreen);
function startPopup(){clearTimeout(popupTimer);popupUntil=performance.now()+(data?.settings.popupSeconds||5)*1000;popupTimer=setTimeout(()=>{popupUntil=0;popupTimer=null;render();},(data?.settings.popupSeconds||5)*1000);}
const photoUrl=path=>path?.startsWith('/api/images/')?path+'?token='+encodeURIComponent(token):path;
function setPresentation(value){presentation=value;const full=['break','lesson-start','lesson-finish','event'].includes(value);document.body.classList.toggle('cinematic',full);document.body.classList.toggle('lesson-screen',full&&value!=='break');document.body.classList.toggle('clock-only',value==='clock');document.body.classList.toggle('event-popup',value==='panel'&&performance.now()<popupUntil);cinema.hidden=!full;exitButton.hidden=!full;if(!full){cinema.textContent='';delete cinema.dataset.image;}}
const hoverMedia=matchMedia('(hover: hover) and (pointer: fine)');
let hoverTimer=null,pointerInside=false,disposed=false,measureFrame=0;
function setHovered(inside,native=false){
 if(disposed)return;
 if(inside&&(presentation!=='panel'||document.body.classList.contains('bar-hidden')))return;
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
 measureFrame=requestAnimationFrame(()=>{measureFrame=0;const rect=shell.getBoundingClientRect();window.schoolDesktop.reportLayout({x:rect.x,y:rect.y,width:document.body.classList.contains('bar-hidden')?0:panel.getBoundingClientRect().width,height:document.body.classList.contains('bar-hidden')?0:panel.getBoundingClientRect().height,contentHeight:document.body.offsetHeight,expanded:document.body.classList.contains('cinematic'),clockOnly:presentation==='clock'&&!document.body.classList.contains('bar-hidden')&&!document.body.classList.contains('lesson-clock'),centered:presentation==='panel'&&performance.now()<popupUntil&&!document.body.classList.contains('bar-hidden')});});
}
const resizeObserver=new ResizeObserver(measure);resizeObserver.observe(document.body);resizeObserver.observe(shell);resizeObserver.observe(cinema);resizeObserver.observe(document.querySelector('#alert'));
window.addEventListener('resize',measure);

let data=null,offset=0,online=false,invalid=false,lastSync=0,lastKey=null,lastRevision=null,lastTick=Date.now();const alerted=new Set();
const cache='school-display-cache:'+token;
try{const saved=JSON.parse(localStorage.getItem(cache));if(saved?.data&&!params.has('draft')){data=saved.data;offset=Number(saved.offset)||0;lastSync=Number(saved.lastSync)||0;}}catch{}
const label=key=>data?.settings.language==='ar'?(arabic[key]||key):data?.settings.language==='both'?`${key} · ${arabic[key]||key}`:key;
function text(row,en,ar){const mode=data.settings.language;if(mode==='ar')return e(row[ar]||row[en]);if(mode==='en')return e(row[en]||row[ar]);return `${e(row[en]||row[ar])}${row[ar]&&row[ar]!==row[en]?`<span class="secondary-language" dir="rtl">${e(row[ar])}</span>`:''}`;}
const duration=seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.max(0,seconds)%60).padStart(2,'0')}`;
let audioContext=null;
const unlockAudio=()=>{if(window.schoolDesktop||!data?.settings.sound||audioContext)return;try{audioContext=new AudioContext();audioContext.resume().catch(()=>{});}catch{}};
window.addEventListener('pointerdown',unlockAudio);window.addEventListener('keydown',unlockAudio);
function playSound(){if(window.schoolDesktop){window.schoolDesktop.alert(data.settings.soundStyle);return;}if(!audioContext||audioContext.state!=='running')return;for(let index=0;index<(data.settings.soundStyle==='double'?2:1);index++){const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),start=audioContext.currentTime+index*.24;oscillator.frequency.value=760;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.07,start+.02);gain.gain.exponentialRampToValueAtTime(.001,start+.17);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(start);oscillator.stop(start+.18);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};}}
const notifications=[];let showing=false,notificationTimer=null;
function dismissNotification(){if(!showing)return;clearTimeout(notificationTimer);notificationTimer=null;const el=document.querySelector('#alert');el.className='';el.removeAttribute('data-tone');backdrop.hidden=true;showing=false;showNotification();}
function showNotification(){if(disposed||showing||!notifications.length)return;showing=true;const {title,detail}=notifications.shift(),el=document.querySelector('#alert');const tone=({'Lesson started':'lesson','Lesson finished':'finished','Break started':'break','Break finished':'lesson','Event started':'event','Event finished':'finished','Starting soon':'idle','Schedule updated':'updated'})[title]||'idle';el.dataset.tone=tone;el.innerHTML=`<span class="sheet-icon" aria-hidden="true">${icons[tone]}</span><div class="sheet-copy"><strong>${e(label(title))}</strong>${detail?`<span>${e(detail)}</span>`:''}</div><button type="button" class="sheet-close" aria-label="${e(label('Close'))}">${icons.close}</button>`;el.querySelector('.sheet-close').addEventListener('click',dismissNotification);el.className='show';backdrop.hidden=overlay;if(title==='Break finished'){const image=document.createElement('img');image.className='return-photo';image.src=photoUrl(data?.settings.returnImage||'/images/student-return.png');image.alt=label('Students ready for their next school activity');el.prepend(image);}if(data?.settings.sound)playSound();notificationTimer=setTimeout(dismissNotification,(data?.settings.notificationSeconds||4)*1000);}
backdrop.addEventListener('click',dismissNotification);
const escapeSheet=event=>{if(event.key==='Escape'&&showing)dismissNotification();};window.addEventListener('keydown',escapeSheet);
function notify(key,title,detail=''){if(preview||alerted.has(key))return;alerted.add(key);if(alerted.size>200)alerted.delete(alerted.values().next().value);notifications.push({title,detail});showNotification();}
function render(){if(disposed)return;if(!data){lessonFlow.reset();document.body.classList.remove('bar-hidden','lesson-clock','lesson-docked');shell.removeAttribute('aria-hidden');clearTimeout(popupTimer);popupUntil=0;setPresentation('panel');leave();panel.classList.remove('ribbon','break','lesson','paused');panel.classList.add('is-empty');panel.innerHTML=`<section class="empty-display"><h1>Qatar School Time Table</h1><p>${invalid?'API access lost. Ask the administrator to reopen the display.':'Connecting to the local school timetable...'}</p></section>`;statusNode.textContent='';measure();return;}
 const s={...data.settings,...(panelPreview||{})},lang=s.language,hideBar=s.hideBar===true&&!preview;document.body.classList.toggle('bar-hidden',hideBar);shell.setAttribute('aria-hidden',String(hideBar));if(hideBar)leave();applyTheme(s);document.body.style.setProperty('--panel-width',(s.panelWidth||680)+'px');document.body.style.setProperty('--text-scale',String((s.textScale||100)/100));document.body.style.setProperty('--panel-margin',(s.edgeMargin||12)+'px');document.body.dataset.align=s.horizontal||'center';document.body.dataset.position=s.position||'top';document.documentElement.lang=lang==='ar'?'ar':'en';document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.body.classList.toggle('compact',s.size==='compact');
 const now=new Date(Date.now()+offset),state=scheduleState(data.schedule,s,now),current=state.current,next=state.next,key=`${state.clock.date}:${s.classId||'default'}:${current?.id||state.phase}`;
 activityKey=key;
 const changed=lastKey!==null&&lastKey!==key&&lastTick>Date.now()-15000;
 if(changed){dismissedKey=null;if(current&&!s.paused&&data.configured&&data.publishedAt&&!preview)startPopup();else{clearTimeout(popupTimer);popupTimer=null;popupUntil=0;}}
 const moment=lessonFlow.update(state,s,now.getTime(),Boolean(data.configured&&data.publishedAt)&&!params.has('adjust'));
 let mode=preview&&params.has('adjust')?'panel':displayPresentation(state,s,Boolean(data.configured&&data.publishedAt));
 if((mode==='break'&&dismissedKey===key)||performance.now()<popupUntil)mode='panel';
 if(s.lessonClock&&current?.type==='lesson'&&!s.paused&&data.configured&&data.publishedAt&&!params.has('adjust'))mode='clock';
 if(moment){activityKey=moment.key;if(dismissedKey!==moment.key)mode=moment.kind;}
 setPresentation(mode);if(mode!=='panel')leave();
 const lessonClock=mode==='clock'&&current?.type==='lesson';document.body.classList.toggle('lesson-clock',lessonClock);document.body.dataset.dockSide=s.lessonDockSide||'right';
 const nextDock=lessonClock?key:null;if(dockKey!==nextDock){dockKey=nextDock;cancelAnimationFrame(dockFrame);document.body.classList.remove('lesson-docked');if(lessonClock)dockFrame=requestAnimationFrame(()=>{dockFrame=requestAnimationFrame(()=>{if(!disposed&&dockKey===nextDock)document.body.classList.add('lesson-docked');});});}
 exitButton.textContent=label('Exit full screen');exitButton.setAttribute('aria-label',label('Exit full screen'));
 const currentName=current?(lang==='ar'?current.subjectAr||current.subjectEn:current.subjectEn||current.subjectAr):'';
 if(!s.paused&&data.configured){if(lastKey!==null&&lastKey!==key&&lastTick>Date.now()-15000){const prev=render.previous;if(prev?.current){notify(lastKey+':end',prev.current.type==='break'?'Break finished':prev.current.type==='event'?'Event finished':'Lesson finished');}if(current)notify(key+':start',current.type==='break'?'Break started':current.type==='event'?'Event started':'Lesson started',currentName);}if(next&&s.alertMinutes>0&&state.remaining>0){const until=(Number(next.start.slice(0,2))*60+Number(next.start.slice(3)))*60-state.clock.seconds;if(until>0&&until<=s.alertMinutes*60)notify(`${state.clock.date}:${next.id}:soon`,'Starting soon',`${lang==='ar'?next.subjectAr||next.subjectEn:next.subjectEn||next.subjectAr} · ${next.start}`);}}
 lastKey=key;lastTick=Date.now();render.previous=state;
 const phases={'before-school':'Before school',gap:'Between lessons',finished:'School day completed','no-school':'No lessons scheduled',holiday:'School holiday'};
 const heading=!data.configured?'Waiting for administrator':s.paused?'Display paused':!data.publishedAt?'Not published yet':current?null:phases[state.phase];
 const tone=!data.configured||!data.publishedAt?'idle':s.paused?'paused':current?.type==='break'?'break':current?.type==='event'?'event':current?'lesson':state.phase==='finished'?'finished':state.phase==='holiday'?'holiday':'idle';
 const icon=icons[tone];
 const stateLabel=tone==='lesson'&&!heading?'Lesson in progress':tone==='break'&&!heading?'Break time':tone==='event'&&!heading?'Event in progress':null;
 const clock=new Intl.DateTimeFormat(lang==='ar'?'ar-QA':'en-GB',{timeZone:s.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 const announcement=lang==='ar'?s.announcementAr:lang==='both'?[s.announcementEn,s.announcementAr].filter(Boolean).join(' · '):s.announcementEn;
 panel.classList.add('ribbon');panel.classList.remove('is-empty');panel.classList.toggle('break',current?.type==='break');panel.classList.toggle('lesson',current?.type==='lesson');panel.classList.toggle('paused',s.paused);panel.dataset.state=mode==='clock'?'clock':tone;document.body.dataset.state=tone;
 panel.innerHTML=mode==='clock'?`<time class="idle-clock" aria-label="${e(label('School time'))}">${clock}</time>`:`<div class="school-mark"><img src="${e(photoUrl(s.logoImage||'/icon.svg'))}" alt=""><div><strong>${text(s,'schoolEn','schoolAr')}</strong>${data.classInfo?'<span class="class-name">'+text(data.classInfo,'nameEn','nameAr')+'</span>':''}</div></div><span class="publication">${e(label(data.draft?'Draft preview':data.publishedAt?'Published':'Not published yet'))}${data.publishedAt?' &middot; #'+data.revision:''}</span><time class="live-clock" aria-label="${e(label('School time'))}">${clock}</time><div class="current"><span class="phase-icon" aria-hidden="true">${icon}</span><div class="activity">${stateLabel?`<span class="state-label">${e(label(stateLabel))}</span>`:''}<h1>${heading?e(label(heading)):text(current,'subjectEn','subjectAr')}</h1><p>${!data.configured?e(label('Open the local control panel to set up your school.')):current&&!s.paused?text(current,'teacherEn','teacherAr')+(current.room?'<span class="room">'+e(current.room)+'</span>':''):e(announcement)}</p></div><div class="countdown" role="timer"><small>${e(label(current?'Remaining':'Starts in'))}</small><strong>${s.paused||!data.publishedAt||state.remaining===0?'&mdash;':duration(state.remaining)}</strong></div></div><div class="next"><small>${e(label('Next up'))}</small><strong>${next?text(next,'subjectEn','subjectAr'):e(label('No next activity'))}</strong>${next?`<div><time>${next.start}</time></div>`:''}</div>`;
 statusNode.classList.toggle('offline',!online);
 statusNode.innerHTML=`<span class="network-state"><span class="network-dot"></span>${e(label(invalid?'API access lost. Ask the administrator to reopen the display.':online?'Live':'Offline · using saved timetable'))}</span><span class="last-sync">${e(label('Last sync'))} ${lastSync?new Date(lastSync).toLocaleTimeString(lang==='ar'?'ar':'en-GB'):'&mdash;'}</span><span class="announcement">${e(announcement)}</span>`;
 if(document.body.classList.contains('cinematic'))renderLessonScreen(cinema,moment&&mode===moment.kind?moment:{kind:mode,row:current},{settings:s,state,label,text,photoUrl,duration});
 measure();
}
let fetching=false;
async function sync(){if(fetching||disposed)return;fetching=true;try{const begin=Date.now(),res=await fetch(params.has('draft')?'/api/preview?classId='+encodeURIComponent(params.get('classId')||'default')+(params.has('date')?'&date='+encodeURIComponent(params.get('date'))+'&time='+encodeURIComponent(params.get('time')||'07:30'):''):'/api/display?token='+encodeURIComponent(token)+'&revision='+(lastRevision??0)+(preview?'&preview=1':''),{signal:AbortSignal.timeout(5000)});if(res.status===403||res.status===401){invalid=true;data=null;localStorage.removeItem(cache);render();return;}if(!res.ok)throw Error();const result=await res.json();offset=result.serverTime-(begin+Date.now())/2;data=result;online=result.remote?result.remote.online:true;invalid=false;lastSync=result.remote?result.remote.lastSync:Date.now();if(lastRevision!==null&&lastRevision!==result.revision){lastKey=null;notify('revision:'+result.revision,'Schedule updated');}lastRevision=result.revision;try{if(!params.has('draft'))localStorage.setItem(cache,JSON.stringify({data,offset,lastSync}));}catch{}render();}catch{online=false;render();}finally{fetching=false;}}
render();sync();const renderInterval=setInterval(render,250),syncInterval=setInterval(sync,3000);
const visible=()=>{if(!document.hidden)sync();};window.addEventListener('online',sync);document.addEventListener('visibilitychange',visible);
window.addEventListener('pageshow',event=>{if(event.persisted)sync();});
window.addEventListener('pagehide',event=>{if(event.persisted){leave();return;}disposed=true;window.removeEventListener('pointerdown',unlockAudio);window.removeEventListener('keydown',unlockAudio);if(audioContext)audioContext.close().catch(()=>{});window.removeEventListener('message',updatePreview);clearTimeout(notificationTimer);notifications.length=0;clearTimeout(hoverTimer);clearTimeout(popupTimer);exitButton.removeEventListener('click',exitFullscreen);window.removeEventListener('keydown',escapeFullscreen);window.removeEventListener('keydown',escapeSheet);backdrop.removeEventListener('click',dismissNotification);clearInterval(renderInterval);clearInterval(syncInterval);cancelAnimationFrame(measureFrame);cancelAnimationFrame(dockFrame);resizeObserver.disconnect();unsubscribePointer?.();panel.removeEventListener('pointerenter',enter);panel.removeEventListener('pointerleave',leave);panel.removeEventListener('pointercancel',leave);hoverMedia.removeEventListener('change',leave);window.removeEventListener('blur',leave);window.removeEventListener('resize',measure);window.removeEventListener('online',sync);document.removeEventListener('visibilitychange',visible);});
