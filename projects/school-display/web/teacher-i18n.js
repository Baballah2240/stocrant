const arabic={
 'Teacher app':'تطبيق المعلم','School address':'عنوان المدرسة','Email':'البريد الإلكتروني','Password':'كلمة المرور','Sign in':'تسجيل الدخول','Sign out':'تسجيل الخروج',
 'Ask your school administrator for the address and your sign-in.':'اطلب العنوان وبيانات الدخول من مسؤول المدرسة.',
 'Enter the full https:// address of your school.':'أدخل عنوان المدرسة الكامل الذي يبدأ بـ https://.',
 'Could not reach the school. Check the address and your connection.':'تعذر الوصول إلى المدرسة. تحقق من العنوان والاتصال.',
 'Email or password is incorrect.':'البريد الإلكتروني أو كلمة المرور غير صحيحة.','Too many attempts. Try again in 15 minutes.':'محاولات كثيرة. حاول مرة أخرى بعد 15 دقيقة.',
 'Show':'عرض','Messages':'الرسائل','No messages yet.':'لا توجد رسائل بعد.','New message from school':'رسالة جديدة من المدرسة','Today':'اليوم','Week':'الأسبوع','Settings':'الإعدادات','Teaching now':'تدرّس الآن','Next lesson':'الحصة التالية','left':'متبقية','starts in':'تبدأ بعد',
 'No more lessons today':'لا توجد حصص أخرى اليوم','No lessons today':'لا توجد حصص اليوم','School holiday':'إجازة مدرسية','Your next lesson':'حصتك القادمة','Your lessons today':'حصصك اليوم',
 'No lessons are scheduled.':'لا توجد حصص مجدولة.','Announcements':'الإعلانات','Timetable change today':'تغيير في جدول اليوم','Timetable change':'تغيير في الجدول','Cover for':'بدلاً من','Covered by':'يغطيها','Lesson covered':'حصة مغطاة',
 'My lessons':'حصصي','Lesson':'حصة','Break':'فسحة','Event':'نشاط','No school':'لا توجد دراسة','Free':'فراغ','min':'د','h':'س',
 'Offline. Showing the last saved timetable.':'غير متصل. يعرض آخر جدول محفوظ.','Last updated':'آخر تحديث','Update now':'تحديث الآن','Updated.':'تم التحديث.','Could not update. The saved timetable is still available.':'تعذر التحديث. الجدول المحفوظ ما زال متاحاً.',
 'None of your lessons were found.':'لم يتم العثور على حصصك.','Ask your administrator to set your name on the timetable under School users.':'اطلب من المسؤول ضبط اسمك في الجدول ضمن مستخدمي المدرسة.',
 'Language':'اللغة','Lesson reminders':'تذكير الحصص','Off':'إيقاف','minutes before':'دقائق قبل الحصة','Reminders are on this phone and work offline after the app has updated once.':'التذكيرات محفوظة على هذا الهاتف وتعمل دون اتصال بعد تحديث التطبيق مرة واحدة.','Allow notifications in your phone settings to get reminders.':'اسمح بالإشعارات من إعدادات الهاتف لتصلك التذكيرات.','Reminders saved.':'تم حفظ التذكيرات.','Lesson in':'حصة بعد','minutes':'دقائق',
 'School':'المدرسة','Name on the timetable':'الاسم في الجدول','Not set':'غير محدد','Your account was signed out. Sign in again.':'تم تسجيل خروجك. سجّل الدخول مرة أخرى.','To change your password, use the school control panel. This signs out the app.':'لتغيير كلمة المرور استخدم لوحة تحكم المدرسة، وسيؤدي ذلك إلى تسجيل خروج التطبيق.','Timetable times use the school timezone.':'تعتمد أوقات الجدول على توقيت المدرسة.'
};
const days={en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],ar:['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']};
const read=key=>{try{return localStorage.getItem(key);}catch{return null;}};
export let language=read('teacher-language')||(navigator.language?.startsWith('ar')?'ar':'en');
export const t=key=>language==='ar'?(arabic[key]||key):key;
export const dayName=day=>days[language][day];
export function setLanguage(value){language=value==='ar'?'ar':'en';try{localStorage.setItem('teacher-language',language);}catch{}document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';}
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
setLanguage(language);
