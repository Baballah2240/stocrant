import {videoMaxBytes} from './media.mjs';
import {t,escape as e} from './i18n.js';
export function photoField(key,title,value='/icon.svg'){
 return `<div class="settings-photo"><img src="${e(value||'/icon.svg')}" alt="${e(t(title))}" width="80" height="80"><h3>${t(title)}</h3><input type="hidden" name="${key}" value="${e(value||'')}"><label>${t('Choose replacement image')}<input type="file" accept="image/png,image/jpeg,image/webp" data-lesson-photo="${key}"></label><button type="button" class="ghost" data-clear-lesson-photo="${key}">${t('Use default image')}</button></div>`;
}
function videoField(key, title, value) {
 return `<div class="settings-photo"><h3>${t(title)}</h3><input type="hidden" name="${key}" value="${e(value||'')}"><label>${t('Choose video')}<input type="file" accept="video/mp4,video/webm" data-lesson-video></label><small class="hint" data-video-status>${t(value?'Video selected':'Photo only')}</small><button type="button" class="ghost" data-clear-lesson-video>${t('Remove video')}</button></div>`;
}
export function lessonOptions(s){
 const number=(key,title,value,max)=>`<label>${t(title)}<input type="number" name="${key}" value="${value}" min="0" max="${max}" step="1" required></label>`;
 return `<section class="panel"><h2>${t('Lesson screens and photos')}</h2><p class="hint">${t('Show a small clock during lessons. Before a lesson, show its teacher photo and countdown. Set the lead time to 0 to show the photo at the start instead.')}</p><label class="toggle"><span>${t('Clock only during lessons')}</span><input type="checkbox" name="lessonClock" ${s.lessonClock?'checked':''}></label><div class="form-grid">${number('lessonLeadSeconds','Before lesson countdown seconds',s.lessonLeadSeconds,120)}${number('lessonStartSeconds','Photo duration when countdown is 0',s.lessonStartSeconds,60)}${number('lessonFinishSeconds','Lesson finished screen seconds',s.lessonFinishSeconds,60)}<label>${t('Clock moves toward')}<select name="lessonDockSide"><option value="right" ${s.lessonDockSide==='right'?'selected':''}>${t('Right')}</option><option value="left" ${s.lessonDockSide==='left'?'selected':''}>${t('Left')}</option></select></label></div><div class="settings-photo-grid">${photoField('lessonStartImage','Default lesson start photo',s.lessonStartImage)}${photoField('lessonFinishImage','Default lesson finish photo',s.lessonFinishImage)}${photoField('eventImage','Default event photo',s.eventImage)}</div><h3>${t('Optional transition videos')}</h3><p class="hint">${t('MP4 or WebM up to 8 MB. Videos play muted while the screen is visible.')}</p><div class="settings-photo-grid">${videoField('lessonStartVideo','Lesson start video',s.lessonStartVideo)}${videoField('lessonFinishVideo','Lesson finish video',s.lessonFinishVideo)}${videoField('breakVideo','Break video',s.breakVideo)}</div><p class="hint">${t('Choose a teacher photo and an activity photo in Edit activity. An activity photo overrides the default for that activity. Set a screen duration to 0 to disable that screen.')}</p></section>`;
}
export function bindLessonPhotos(root,api,toast){
 root.querySelectorAll('[data-lesson-photo],[data-photo-field],[data-lesson-video]').forEach(input=>input.onchange=async()=>{
  const file=input.files[0];if(!file)return;const form=input.closest('form'),card=input.closest('.settings-photo');form.dataset.uploading=String(Number(form.dataset.uploading||0)+1);input.disabled=true;
  try{
   const video=input.hasAttribute('data-lesson-video');
   if(video&&(file.size>videoMaxBytes||!['video/mp4','video/webm'].includes(file.type)))throw Error('Choose an MP4 or WebM video up to 8 MB.');
   if(!video&&(file.size>2*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)))throw Error('Choose a PNG, JPEG or WebP image up to 2 MB.');
   const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read the file.'));reader.readAsDataURL(file);});
   const result=await api(video?'videos':'images',{data:encoded});const hidden=card.querySelector('input[type=hidden]');hidden.value=video?result.video:result.image;hidden.dispatchEvent(new Event('input',{bubbles:true}));if(video){card.querySelector('[data-video-status]').textContent=t('Video selected');toast('Video uploaded. Save to apply it.');}else{card.querySelector('img').src=result.image;toast('Image uploaded. Save to apply it.');}
  }catch(error){toast(error.message,true);}finally{form.dataset.uploading=String(Number(form.dataset.uploading)-1);input.disabled=false;input.value='';}
 });
 root.querySelectorAll('[data-clear-lesson-video]').forEach(button=>button.onclick=()=>{
  const card=button.closest('.settings-photo');
  const hidden=card.querySelector('input[type=hidden]');hidden.value='';hidden.dispatchEvent(new Event('input',{bubbles:true}));
  card.querySelector('[data-video-status]').textContent=t('Photo only');
 });
 root.querySelectorAll('[data-clear-lesson-photo],[data-reset-photo]').forEach(button=>button.onclick=()=>{
  const card=button.closest('.settings-photo'),key=button.dataset.clearLessonPhoto||button.dataset.resetPhoto;
  const defaults={breakImage:'/images/student-break.png',returnImage:'/images/student-return.png',teacherImage:'',actionImage:''};
  const hidden=card.querySelector('input[type=hidden]');hidden.value=defaults[key]??'/icon.svg';card.querySelector('img').src=hidden.value||'/icon.svg';hidden.dispatchEvent(new Event('input',{bubbles:true}));
 });
}
