import { useCallback, useEffect, useState } from "react";
import { notifyAction, type ActionFeedback } from "../action-feedback";
type Toast = ActionFeedback & { id: number };
let sequence = 0;
function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  useEffect(() => { const timer = window.setTimeout(() => dismiss(toast.id), toast.kind === "error" ? 7000 : 4000); return () => clearTimeout(timer); }, [toast.id, toast.kind, dismiss]);
  return <div className={`action-toast action-toast--${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}><span className="action-toast-icon" aria-hidden="true">{toast.kind === "error" ? "!" : "✓"}</span><span>{toast.message}</span><button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>×</button></div>;
}
export default function ActionToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts(current => current.filter(toast => toast.id !== id)), []);
  useEffect(() => {
    const receive = (event: Event) => { const feedback = (event as CustomEvent<ActionFeedback>).detail; setToasts(current => [...current.slice(-2), { ...feedback, id: ++sequence }]); };
    const printed = () => notifyAction("Print dialog closed.");
    window.addEventListener("stocrant:action", receive); window.addEventListener("afterprint", printed);
    return () => { window.removeEventListener("stocrant:action", receive); window.removeEventListener("afterprint", printed); };
  }, []);
  return <div className="action-toast-stack" aria-label="Action notifications">{toasts.map(toast => <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />)}</div>;
}
