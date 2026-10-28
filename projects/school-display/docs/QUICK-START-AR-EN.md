# Qatar School Time Table

## العربية

نظام لتنظيم عرض الحصص والفسح والفعاليات على شاشات المدرسة. يعرض صورة المعلم والعد التنازلي قبل الحصة، وساعة صغيرة أثناءها، ورسالة انتهاء الحصة بملء الشاشة لمدة قابلة للتعديل. يدعم العربية والإنجليزية، وجداول مستقلة للفصول، وصور الأنشطة والصلاحيات والنسخ الاحتياطية.

1. ثبت تطبيق ويندوز وافتحه، ثم افتح لوحة التحكم من قائمة التطبيق بجوار الساعة. العنوان المحلي: `http://127.0.0.1:4318/control`.
2. عند التشغيل الأول، أنشئ حساب المسؤول. لا توجد كلمة مرور افتراضية. احفظ معلومات الحساب في مكان آمن.
3. اضغط **جولة سريعة** أعلى لوحة التحكم. تشرح الجولة الأقسام حسب صلاحياتك ولا تغير البيانات. يمكن إغلاقها بزر الإغلاق أو Escape.
4. من **إعدادات العرض والمدرسة**، حدد الاسم والشعار والمنطقة الزمنية واللغة والألوان. احفظ الإعدادات لتطبيقها.
5. من **الجدول**، أضف الفصول والحصص والمعلمين والفسح، وارفع صورة المعلم أو النشاط. احفظ المسودة ثم عاينها. ينشر المسؤول الجدول لظهوره على الشاشات.
6. من **الفصول والشاشات**، اربط كل شاشة بالفصل المطلوب. يجب أن يكتشف ويندوز الشاشة أولاً. أضف أيام الاختبارات أو الجداول البديلة في **الأيام الخاصة** ثم احفظها وانشرها.
7. عدل مدد صور بداية الحصة ونهايتها والعد التنازلي في إعدادات شاشات الحصص والصور. مدة الصورة صفر توقف تلك الصورة؛ والعد التنازلي صفر يعرض صورة البداية عند بدء الحصة بدلاً من عرضها قبلها. يمكن إخفاء الشريط مع استمرار الجدول والتنبيهات في الخلفية.
8. أضف المستخدمين من قسم المسؤول: المسؤول يدير وينشر، والمنسق يعد المسودات، والمعلم يرى الفصول المسندة إليه. صدر نسخة احتياطية قبل التغييرات الكبيرة.

للخروج من عرض ملء الشاشة، استخدم الزر الظاهر. لإغلاق التطبيق بالكامل، افتح لوحة التحكم باستخدام **Ctrl+Alt+Shift+S**، ثم أدوات التحكم المحمية وأدخل كلمة مرور المسؤول. التطبيق ليس قفلاً لنظام التشغيل؛ يلزم اختبار تطبيقات التدريس والشاشات الفعلية.

**الوضع الحالي:** محلي على ويندوز 64 بت. لا تنتقل الحسابات إلى جهاز آخر تلقائياً، ولا تشمل نسخة بيانات الجدول الاحتياطية كلمات المرور. الاستضافة العامة عبر HTTPS غير مفعلة. التثبيت الحالي غير موقع بشهادة ناشر؛ يتطلب النشر العام تجهيز التوقيع واعتماد تقنية المعلومات وتجربة فصل حقيقي.

## English

Qatar School Time Table manages classroom lesson, break and event displays. It shows a teacher photo and countdown before a lesson, a small clock during the lesson, and an adjustable full-screen finish message. It supports Arabic and English, separate class timetables, activity photos, role permissions and backups.

1. Install and launch the Windows app. Open its control panel from the tray menu beside the Windows clock: `http://127.0.0.1:4318/control`.
2. On first launch, create the school administrator. There is no default password. Keep the account details safely.
3. Select **Quick tour** in the header. Guidance is tailored to your role and does not change data. Close it with the close button or Escape.
4. Under **Display & school**, set the school name, logo, timezone, language and theme. Save settings to apply them.
5. Under **Timetable**, add classes, lessons, teachers and breaks, with teacher or activity photos. Save and preview the draft. An administrator publishes it to classroom screens.
6. Under **Classrooms & screens**, assign the intended class to each screen after Windows detects it. Prepare substitute or exam schedules in **Special days**, then save and publish.
7. Adjust lesson start/finish photos and countdown durations in **Lesson screens and photos**. A zero photo duration disables that screen; a zero countdown lead shows the start photo when the lesson begins instead of beforehand. Hide the bar if desired; the timetable and alerts continue in the background.
8. Add individual accounts under **Administrator**. Administrators manage and publish; coordinators prepare drafts; teachers see assigned classes. Export backups before major changes.

Use the visible button to leave a full-screen moment. To close the application, open controls with **Ctrl+Alt+Shift+S**, then use **Protected controls** and your administrator password. This is not an operating-system lockdown; verify actual teaching applications and classroom screens.

**Current status:** local operation on 64-bit Windows. Accounts do not automatically move to another computer; timetable backups exclude passwords. Public HTTPS hosting is not activated. The current installer is unsigned; broad distribution requires publisher signing, IT acceptance and a real classroom pilot.

Built with JavaScript ES modules, HTML/CSS, Node.js, Electron and SQLite through SQL.js. It does not require an AI service at runtime.
