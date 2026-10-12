import ChoiceSelect from "./ChoiceSelect";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useSession } from "../session-context";
import { useTheme } from "../theme-context";
import { useLanguage } from "../language-context";
import MobileIcon from "./MobileIcon";

export default function AuthPage() {
  const { theme, toggle } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { setupRequired, signIn, setup } = useSession();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  useEffect(() => { void api.auth.companies().then(result => setCompanies(result.companies)).catch(() => setCompanies([])); }, []);
  const registering = !setupRequired && mode === "register";
  const forgot = !setupRequired && mode === "forgot";
  function changeMode(next: typeof mode) { setMode(next); setError(""); setNotice(""); setPassword(""); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (setupRequired) await setup({ name, email, password, setupKey });
      else if (registering) { const result = await api.auth.register({ name, email, password, organizationId }); setNotice(result.message); setMode("login"); setPassword(""); }
      else if (forgot) setNotice((await api.auth.forgotPassword(email)).message);
      else await signIn(email, password);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to continue."); }
    finally { setBusy(false); }
  }
  return <div className="auth-experience auth-refined">
    <header className="auth-page-nav"><a href="/" className="auth-home-link">STOCRANT</a><div className="auth-appearance"><button type="button" onClick={() => setLanguage(language === "en" ? "ar" : "en")}>{language === "en" ? "العربية" : "English"}</button><button type="button" aria-label={t(theme === "light" ? "Dark mode" : "Light mode")} onClick={toggle}><MobileIcon name={theme === "light" ? "moon" : "sun"} /></button></div></header>
    <main className="auth-page"><aside className="auth-welcome"><p className="eyebrow">STOCRANT</p><h2>{language === "ar" ? "أهلاً بك في مساحة عملك" : "Your workday starts here."}</h2><p className="auth-welcome-intro">{language === "ar" ? "إدارة الفريق والعمل وسجلات الشركة في مكان واحد." : "A shared home for your team, daily work and company records."}</p></aside>
    <section className="auth-card">
      <div className="auth-brand"><span className="brand-logo" aria-hidden="true"><MobileIcon name="work" /></span><div><strong>STOCRANT</strong><span>{language === "ar" ? "مساحة عملك" : "Your workspace"}</span></div></div>
      {!setupRequired && <div className="auth-entry-tabs" role="group" aria-label={language === "ar" ? "الوصول للحساب" : "Account access"}><button type="button" disabled={busy} aria-pressed={mode !== "register"} onClick={() => changeMode("login")}>{language === "ar" ? "تسجيل الدخول" : "Sign in"}</button><button type="button" disabled={busy} aria-pressed={registering} onClick={() => changeMode("register")}>{language === "ar" ? "التسجيل" : "Register"}</button></div>}
      <h1>{language === "ar" ? setupRequired ? "إعداد مساحة العمل" : registering ? "طلب حساب جديد" : forgot ? "استعادة كلمة المرور" : "مرحباً بعودتك" : setupRequired ? "Set up your workspace" : registering ? "Request an account" : forgot ? "Reset your password" : "Welcome back"}</h1>
      <p className="hint">{language === "ar" ? registering ? "يراجع المدير الرئيسي طلبك. سجّل الدخول لمتابعة الحالة والرسائل." : forgot ? "أرسل طلباً إلى المدير الرئيسي." : "ادخل بياناتك للمتابعة." : registering ? "Your Main Manager reviews each request. Sign in afterwards to check your status and messages." : forgot ? "Send a reset request to your Main Manager." : setupRequired ? "Create your first Main Manager account." : "Sign in to your company workspace."}</p>
      {error && <p className="error" role="alert">{error}</p>}{notice && <p className="alert alert--good" role="status">{notice}</p>}
      <form className="form" onSubmit={submit}>
        {registering && <label className="form-field"><span>{language === "ar" ? "الشركة" : "Company"}</span><ChoiceSelect required disabled={busy} value={organizationId} onChange={event => setOrganizationId(event.target.value)}><option value="">{language === "ar" ? "اختر شركتك" : "Choose your company"}</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</ChoiceSelect>{!companies.length && <small>{language === "ar" ? "يجب أن يضيف المدير الرئيسي شركة أولاً." : "The Main Manager needs to add a company before registration."}</small>}</label>}
        {(setupRequired || registering) && <label className="form-field"><span>{t("Full name")}</span><input required minLength={2} maxLength={120} autoComplete="name" disabled={busy} value={name} onChange={event => setName(event.target.value)} /></label>}
        <label className="form-field"><span>{t("Email")}</span><input required type="email" dir="ltr" autoComplete="email" autoCapitalize="none" spellCheck={false} disabled={busy} value={email} onChange={event => setEmail(event.target.value)} /></label>
        {!forgot && <label className="form-field"><span>{t("Password")}</span><div className="auth-password-field"><input required type={showPassword ? "text" : "password"} autoComplete={setupRequired || registering ? "new-password" : "current-password"} minLength={setupRequired || registering ? 12 : 1} maxLength={256} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{language === "ar" ? showPassword ? "إخفاء" : "إظهار" : showPassword ? "Hide" : "Show"}</button></div>{(setupRequired || registering) && <small>{language === "ar" ? "استخدم ١٢ حرفاً على الأقل" : "Use at least 12 characters."}</small>}</label>}
        {setupRequired && <label className="form-field"><span>{language === "ar" ? "مفتاح الإعداد" : "Setup key"}</span><input required type="password" autoComplete="off" value={setupKey} onChange={event => setSetupKey(event.target.value)} /></label>}
        <button className="primary" type="submit" disabled={busy}>{language === "ar" ? busy ? "جارٍ الإرسال…" : setupRequired ? "إنشاء المدير الرئيسي" : registering ? "إرسال طلب التسجيل" : forgot ? "إرسال الطلب" : "تسجيل الدخول" : busy ? "Please wait…" : setupRequired ? "Create Main Manager" : registering ? "Send registration request" : forgot ? "Send reset request" : "Sign in"}</button>
      </form>
      {!setupRequired && <button type="button" className="auth-recovery-link" disabled={busy} onClick={() => changeMode(forgot ? "login" : "forgot")}>{language === "ar" ? forgot ? "العودة لتسجيل الدخول" : "نسيت كلمة المرور" : forgot ? "Back to sign in" : "Forgot password"}</button>}
    </section></main></div>;
}
