import { useEffect } from "react";
import { useSession } from "../session-context";
import { useLanguage } from "../language-context";
import { NotificationBell } from "./NotificationBell";
export default function RegistrationStatus() {
  const { user, refresh, signOut } = useSession();
  const { language } = useLanguage();
  useEffect(() => { const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 20000); return () => clearInterval(timer); }, [refresh]);
  const rejected = user?.accountStatus === "rejected";
  if (user?.accountStatus === "active") return <main className="auth-page registration-status"><section className="auth-card"><h1>{language === "ar" ? "ÙŠÙ„Ø²Ù… ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ø´Ø±ÙƒØ©" : "Company assignment required"}</h1><p className="hint">{language === "ar" ? "Ø§Ø·Ù„Ø¨ Ù…Ù† Ø§Ù„Ù…Ø¯ÙŠØ± Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ Ø±Ø¨Ø· Ø­Ø³Ø§Ø¨Ùƒ Ø¨Ø´Ø±ÙƒØ© ÙˆØ§Ø­Ø¯Ø©." : "Ask your Main Admin to assign your account to one company."}</p><div className="inline-actions"><button onClick={() => void refresh()}>{language === "ar" ? "ØªØ­Ø¯ÙŠØ«" : "Refresh"}</button><button onClick={() => void signOut()}>{language === "ar" ? "ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬" : "Sign out"}</button></div></section></main>;
  return <main className="auth-page registration-status"><section className="auth-card"><div className="registration-status-head"><h1>{language === "ar" ? rejected ? "Ù„Ù… ØªØªÙ… Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø©" : "Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø©" : rejected ? "Request not approved" : "Awaiting approval"}</h1><NotificationBell /></div><p>{user?.name}</p><p className="hint">{language === "ar" ? "Ø§ÙØªØ­ Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª Ù„Ù‚Ø±Ø§Ø¡Ø© Ø±Ø¯ Ø§Ù„Ù…Ø¯ÙŠØ±. Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø¹Ù…Ù„ ØºÙŠØ± Ù…ØªØ§Ø­Ø© Ø­ØªÙ‰ Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø©." : "Open notifications to read your Main Adminâ€™s replies. Business records stay locked until approval."}</p><div className="inline-actions"><button onClick={() => void refresh()}>{language === "ar" ? "ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø­Ø§Ù„Ø©" : "Refresh status"}</button><button onClick={() => void signOut()}>{language === "ar" ? "ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬" : "Sign out"}</button></div></section></main>;
}
