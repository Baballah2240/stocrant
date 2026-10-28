import {language,escape as e} from './i18n.js';

// The tour only explains features. Opening a section is an explicit, guarded action.
export function tourSteps(role){
 const steps=[
  ['overview','Your school at a glance','مدرستك في لمحة','Check the live preview, today’s activities and the publication status. The classroom uses the published timetable, not unsaved drafts.','تابع المعاينة المباشرة وأنشطة اليوم وحالة النشر. تستخدم شاشة الفصل الجدول المنشور، وليس المسودات غير المحفوظة.'],
  ['timetable','Classes and lessons','الفصول والحصص',role==='teacher'?'View the published timetable for your assigned classes. Your account cannot edit or publish schedules.':'Choose a class and day. Add lessons, breaks or events, with teacher and activity photos. Save the draft, then preview it before an administrator publishes.',role==='teacher'?'اطلع على الجدول المنشور للفصول المسندة إليك. لا يسمح حسابك بتعديل الجداول أو نشرها.':'اختر الفصل واليوم، وأضف الحصص والفسح والفعاليات وصور المعلمين والأنشطة. احفظ المسودة ثم عاينها قبل أن ينشرها المسؤول.']
 ];
 if(role!=='teacher')steps.push(['calendar','Special days','الأيام الخاصة','Prepare holidays, substitute lessons and exam or Ramadan timetables. These drafts also need administrator publication.','جهز الإجازات والحصص البديلة وجداول الاختبارات أو رمضان. تحتاج هذه المسودات أيضاً إلى النشر من المسؤول.']);
 if(role==='admin')steps.push(
  ['screens','Classrooms and screens','الفصول والشاشات','Assign a published class to a Windows monitor or create a private, read-only screen link. Keep screen links private; they do not grant administration.','اربط فصلاً منشوراً بشاشة ويندوز أو أنشئ رابط عرض خاصاً للقراءة فقط. حافظ على خصوصية روابط الشاشات؛ فهي لا تمنح صلاحية الإدارة.'],
  ['settings','Make the display yours','خصص شاشة مدرستك','Set the school timezone and language. Choose colors, photos, clock position and lesson countdown or finish-screen durations. Save settings to apply them immediately.','حدد المنطقة الزمنية واللغة، واختر الألوان والصور وموضع الساعة ومدد العد التنازلي وشاشة انتهاء الحصة. احفظ الإعدادات لتطبيقها مباشرة.'],
  ['health','Check and recover','الفحص والاستعادة','Review system health and recovery options. The current installation runs locally. Online administration needs a separately configured HTTPS school server.','راجع حالة النظام وخيارات الاستعادة. يعمل التثبيت الحالي محلياً، وتتطلب الإدارة عبر الإنترنت إعداد خادم مدرسي مستقل باتصال HTTPS.']
 );
 steps.push(['account',role==='admin'?'Users and safe operation':'Your account',role==='admin'?'المستخدمون والتشغيل الآمن':'حسابك',role==='admin'?'Create individual administrator, coordinator or teacher accounts. Export a backup before major changes. Use Protected controls and your password to close the Windows app.':'Update your account details here. Ask an administrator for access changes or to publish a timetable.',role==='admin'?'أنشئ حساباً مستقلاً لكل مسؤول أو منسق أو معلم. صدر نسخة احتياطية قبل التغييرات الكبيرة. لإغلاق تطبيق ويندوز، استخدم أدوات التحكم المحمية وكلمة مرورك.':'حدث معلومات حسابك هنا. اطلب من المسؤول تغيير الصلاحيات أو نشر الجدول.']);
 return steps;
}

export function startTour({role,goTo,invoker=document.activeElement}){
 if(document.querySelector('#app-tour'))return;
 const steps=tourSteps(role),ar=language==='ar',copy=(en,arabic)=>ar?arabic:en;
 const modal=document.createElement('dialog');modal.id='app-tour';modal.className='tour-dialog';modal.setAttribute('aria-labelledby','tour-title');modal.setAttribute('aria-describedby','tour-description');modal.dir=ar?'rtl':'ltr';
 let index=0;
 function close(){modal.close();}
 function render(){
  const step=steps[index];
  document.querySelectorAll('.tour-target').forEach(node=>node.classList.remove('tour-target'));
  document.querySelector(`[data-tab="${step[0]}"]`)?.classList.add('tour-target');
  modal.innerHTML=`<header class="tour-heading"><span class="eyebrow">${copy('Quick tour','جولة سريعة')}</span><button type="button" class="ghost" data-tour-close aria-label="${copy('Close tour','إغلاق الجولة')}">&times;</button></header><p class="tour-progress" role="status">${copy('Step','الخطوة')} <bdi>${index+1} / ${steps.length}</bdi></p><progress max="${steps.length}" value="${index+1}" aria-label="${copy('Tour progress','تقدم الجولة')}"></progress><h2 id="tour-title" tabindex="-1">${e(step[ar?2:1])}</h2><p id="tour-description">${e(step[ar?4:3])}</p><p class="hint">${copy('Read-only guidance. The tour does not change or publish anything.','إرشادات للقراءة فقط. لا تغير الجولة أي بيانات ولا تنشرها.')}</p><button type="button" class="text-link" data-tour-open>${copy('Open this section','فتح هذا القسم')}</button><footer class="tour-actions"><button type="button" class="secondary" data-tour-back ${index===0?'disabled':''}>${copy('Back','السابق')}</button><button type="button" class="primary" data-tour-next>${index===steps.length-1?copy('Finish','إنهاء'):copy('Next','التالي')}</button></footer>`;
  modal.querySelector('[data-tour-close]').onclick=close;
  modal.querySelector('[data-tour-back]').onclick=()=>{if(index>0){index--;render();}};
  modal.querySelector('[data-tour-next]').onclick=()=>{if(index===steps.length-1)close();else{index++;render();}};
  modal.querySelector('[data-tour-open]').onclick=()=>{if(goTo(step[0]))close();else{const hint=modal.querySelector('.hint');hint.textContent=copy('Close the tour and save your changes before opening another section.','أغلق الجولة واحفظ تغييراتك قبل فتح قسم آخر.');hint.setAttribute('role','alert');}};
  modal.querySelector('#tour-title').focus();
 }
 modal.addEventListener('close',()=>{
  document.querySelectorAll('.tour-target').forEach(node=>node.classList.remove('tour-target'));
  modal.remove();if(invoker?.isConnected)invoker.focus();else document.querySelector('[data-start-tour]')?.focus();
 },{once:true});
 document.body.append(modal);render();modal.showModal();modal.querySelector('#tour-title').focus();
}
