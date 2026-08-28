/** Toast notifications (error/success/info) with an aria-live region. */
import { useBoard } from "../state/context";

export function ToastRegion() {
 const { toasts, dismissToast } = useBoard();
 return (
 <div
 className="toast-region"
 role="region"
 aria-label="Notifications"
 aria-live="polite"
 >
 {toasts.map((t) => (
 <div
 key={t.id}
 className={`toast ${t.kind}`}
 role={t.kind === "error" ? "alert" : "status"}
 >
 <button
 onClick={() => dismissToast(t.id)}
 aria-label="Dismiss notification"
 style={{
 float: "right",
 border: "none",
 background: "transparent",
 padding: "0 0 0 10px",
 color: "inherit",
 }}
 >
 ×
 </button>
 {t.message}
 </div>
 ))}
 </div>
 );
}
