import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const arabic: Record<string, string> = {
  "Registration": "التسجيل", "Message": "رسالة", "Status": "الحالة", "Name": "الاسم", "Reason": "السبب", "From": "من", "To": "إلى", "Days": "الأيام", "Section": "القسم", "Action": "الإجراء",
  "My account": "حسابي", "My profile": "ملفي الشخصي", "Website": "الموقع الإلكتروني", "Settings": "الإعدادات", "Notifications": "الإشعارات", "Dark mode": "الوضع الداكن", "Light mode": "الوضع الفاتح", "Home": "الرئيسية", "Attendance": "الحضور", "Leave": "الإجازات", "Work": "العمل", "More": "المزيد", "Close": "إغلاق", "Mark all read": "قراءة الكل", "Mark read": "تمت القراءة", "All": "الكل", "Unread": "غير مقروء", "Refresh": "تحديث", "My recent changes": "تغييراتي الأخيرة", "Saved on this device": "محفوظة على هذا الجهاز", "Activity": "نشاط", "Open": "فتح", "No notifications": "لا توجد إشعارات", "No workspace alerts": "لا توجد تنبيهات عمل", "Your account": "حسابك", "Edit": "تعديل", "Tap the photo to change it": "اضغط على الصورة لتغييرها", "Remove photo": "إزالة الصورة", "Personal details": "البيانات الشخصية", "Password": "كلمة المرور", "Full name": "الاسم الكامل", "Email": "البريد الإلكتروني", "Phone": "الهاتف", "About me": "نبذة عني", "Save profile": "حفظ الملف", "Change password": "تغيير كلمة المرور", "Current password": "كلمة المرور الحالية", "New password": "كلمة المرور الجديدة", "Confirm new password": "تأكيد كلمة المرور", "Employee": "موظف",  "My profile & password": "ملفي وكلمة المرور", "My files & policies": "ملفاتي والسياسات", "Workspace services": "خدمات العمل", "Access & Settings": "الوصول والإعدادات", "Manage companies, employees and permissions": "إدارة الشركات والموظفين والصلاحيات", "STOCRANT website": "موقع ستوكرانت", "About STOCRANT": "حول ستوكرانت", "Sign out": "تسجيل الخروج", "Companies": "الشركات", "Locations & activity": "المواقع والنشاط", "Workforce & HR": "الموظفون والموارد البشرية", "Operations": "العمليات", "Inventory": "المخزون", "Finance": "المالية", "Time off": "الإجازات", "My files": "ملفاتي", "My work": "عملي", "My activities": "أنشطتي", "Team & company activities": "أنشطة الفريق والشركة", "Team HR": "موارد الفريق البشرية", "Administration": "الإدارة", "Leave request": "طلب إجازة", "Password reset": "إعادة تعيين كلمة المرور", "Overdue": "متأخر", "Low stock": "مخزون منخفض", "Approval": "موافقة", "Access": "الوصول", "Light mode enabled.": "تم تفعيل الوضع الفاتح.", "Dark mode enabled.": "تم تفعيل الوضع الداكن.", "Profile updated.": "تم تحديث الملف الشخصي.", "Saving…": "جارٍ الحفظ…", "Updating…": "جارٍ التحديث…",
};
type Language = "en" | "ar";
const LanguageContext = createContext({ language: "en" as Language, setLanguage: (_language: Language) => {}, t: (text: string) => text });
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => { try { return localStorage.getItem("stocrant.language") === "ar" ? "ar" : "en"; } catch { return "en"; } });
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("stocrant.language", language); } catch { /* Optional device preference. */ }
  }, [language]);
  const t = (text: string) => language === "ar" ? arabic[text] || text : text;
  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}
export const useLanguage = () => useContext(LanguageContext);
