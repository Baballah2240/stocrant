import { useNavigate } from "react-router-dom";
import { useLanguage } from "../language-context";

interface BackButtonProps {
  /** Label shown next to the arrow. */
  label?: string;
  /** Route to fall back on when there is no history to return to. */
  fallback?: string;
  onBack?: () => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Small "return" control shown at the top of every workspace section.
 * Steps back through in-app history; when the section was opened directly
 * (no in-app entries to return to) it falls back to the dashboard.
 */
export default function BackButton({ label, fallback = "/", onBack, className = "", disabled = false }: BackButtonProps) {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const text = label ?? (language === "ar" ? "رجوع" : t("Back"));

  const goBack = () => {
    if (onBack) { onBack(); return; }
    // React Router records the in-app entry index in history.state; browser
    // entries from before the SPA loaded are not counted there.
    const idx = Number((window.history.state as { idx?: number } | null)?.idx ?? 0);
    if (idx > 0) navigate(-1);
    else navigate(fallback);
  };

  return (
    <button type="button" className={`back-button ${className}`} disabled={disabled} onClick={goBack} aria-label={text}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 4-8 8 8 8" /></svg>
      <span>{t(text)}</span>
    </button>
  );
}
