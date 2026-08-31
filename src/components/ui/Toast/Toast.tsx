import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cx } from "../../../lib/cx";
import { useToastStore, type Toast as ToastModel } from "../../../store/toastStore";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import s from "./Toast.module.css";

const ICON = {
  error: <CircleAlert size={16} aria-hidden />,
  success: <CircleCheck size={16} aria-hidden />,
  info: <Info size={16} aria-hidden />,
};

export function Toast({ toast, onClose }: { toast: ToastModel; onClose: () => void }) {
  return (
    <div className={cx(s.toast, s[toast.kind])} role={toast.kind === "error" ? "alert" : "status"}>
      <span className={s.icon}>{ICON[toast.kind]}</span>
      <div className={s.grow}>
        <div className={s.title}>{toast.title}</div>
        {toast.detail && <div className={cx(s.detail, "selectable")}>{toast.detail}</div>}
        {toast.action && (
          <div className={s.actions}>
            <Button size="sm" onClick={toast.action.onClick}>
              {toast.action.label}
            </Button>
          </div>
        )}
      </div>
      <IconButton label="Dismiss" onClick={onClose}>
        <X size={16} aria-hidden />
      </IconButton>
    </div>
  );
}

/** Bottom-right stack bound to `toastStore`. */
export function ToastStack() {
  const toasts = useToastStore((st) => st.toasts);
  const dismiss = useToastStore((st) => st.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className={s.stack}>
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
