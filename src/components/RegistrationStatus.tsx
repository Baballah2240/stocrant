import { useEffect } from "react";
import { useSession } from "../session-context";
import { useLanguage } from "../language-context";
import { NotificationBell } from "./NotificationBell";
export default function RegistrationStatus() {
  const { user, refresh, signOut } = useSession();
  const { language } = useLanguage();
  useEffect(() => { const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 20000); return () => clearInterval(timer); }, [refresh]);
  const rejected = user?.accountStatus === "rejected";
  if (user?.accountStatus === "active") return <main className="auth-page registration-status"><section className="auth-card"><h1>{language === "ar" ? "يلزم تحديد الشركة" : "Company assignment required"}</h1><p className="hint">{language === "ar" ? "اطلب من المدير الرئيسي ربط حسابك بشركة واحدة." : "Ask your Main Manager to assign your account to one company."}</p><div className="inline-actions"><button onClick={() => void refresh()}>{language === "ar" ? "تحديث" : "Refresh"}</button><button onClick={() => void signOut()}>{language === "ar" ? "تسجيل الخروج" : "Sign out"}</button></div></section></main>;
  return <main className="auth-page registration-status"><section className="auth-card"><div className="registration-status-head"><h1>{language === "ar" ? rejected ? "لم تتم الموافقة" : "بانتظار الموافقة" : rejected ? "Request not approved" : "Awaiting approval"}</h1><NotificationBell /></div><p>{user?.name}</p><p className="hint">{language === "ar" ? "افتح الإشعارات لقراءة رد المدير. سجلات العمل غير متاحة حتى الموافقة." : "Open notifications to read your Main Manager’s replies. Business records stay locked until approval."}</p><div className="inline-actions"><button onClick={() => void refresh()}>{language === "ar" ? "تحديث الحالة" : "Refresh status"}</button><button onClick={() => void signOut()}>{language === "ar" ? "تسجيل الخروج" : "Sign out"}</button></div></section></main>;
}
