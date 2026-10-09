import { useNavigate } from "react-router-dom";

interface BackButtonProps {
  /** Label shown next to the arrow. */
  label?: string;
  /** Route to fall back on when there is no history to return to. */
  fallback?: string;
}

/**
 * Small "return" control shown at the top of every workspace section.
 * Steps back through in-app history; when the section was opened directly
 * (no in-app entries to return to) it falls back to the dashboard.
 */
export default function BackButton({ label = "Back", fallback = "/" }: BackButtonProps) {
  const navigate = useNavigate();

  const goBack = () => {
    // React Router records the in-app entry index in history.state; browser
    // entries from before the SPA loaded are not counted there.
    const idx = Number((window.history.state as { idx?: number } | null)?.idx ?? 0);
    if (idx > 0) navigate(-1);
    else navigate(fallback);
  };

  return (
    <button type="button" className="back-button" onClick={goBack} aria-label={`Back to ${label.toLowerCase()}`}>
      <span aria-hidden="true">←</span>
      {label}
    </button>
  );
}
