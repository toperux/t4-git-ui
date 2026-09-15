import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useRef } from "react";
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

/** The parts that own their pointer events: the buttons, and the detail, which stays selectable. */
const ownsPointer = (target: EventTarget | null) => !!(target as Element | null)?.closest("button, .selectable");

export function Toast({ toast, onClose }: { toast: ToastModel; onClose: () => void }) {
  // Where the press began. A drag that starts in the detail and overshoots onto the title lands its
  // click on the element holding both, so the click's own target cannot tell a selection from a swat.
  const pressed = useRef<EventTarget | null>(null);
  return (
    <div
      data-toast
      className={cx(s.toast, s[toast.kind])}
      role={toast.kind === "error" ? "alert" : "status"}
      // Closing one in a hurry: the whole toast is the hit target, the × is just the obvious part
      // of it. No tabIndex — this is a live region, and Dismiss is already the keyboard way out.
      // A mousedown on a non-focusable div blurs whatever held the caret, so swatting a toast away
      // mid-sentence emptied the field being typed into — the whole 360px surface is a dismiss
      // target now, so that is easy to do by accident. Holding the default off keeps the focus put —
      // on the buttons too: a clicked × or Retry that took the focus would unmount holding it, and
      // the caret would land on the dialog's first field instead of the one being typed into. Only
      // the detail keeps its press, which is the drag that selects it.
      onMouseDown={(e) => {
        pressed.current = e.target;
        if (!(e.target as Element | null)?.closest(".selectable")) e.preventDefault();
      }}
      onClick={(e) => {
        // Both buttons close the toast themselves, in their own order. Let them. The detail is out
        // too: it is the half worth copying, and its first click is also the opening of a double-
        // or triple-click, so closing on it took the word away before the second click landed.
        if (ownsPointer(e.target) || ownsPointer(pressed.current)) return;
        onClose();
      }}
    >
      <span className={s.icon}>{ICON[toast.kind]}</span>
      <div className={s.grow}>
        <div className={s.title}>{toast.title}</div>
        {toast.detail && <div className={cx(s.detail, "selectable")}>{toast.detail}</div>}
        {toast.action && (
          <div className={s.actions}>
            {/* The action replaces the toast: retrying keeps the stale error on screen otherwise. */}
            <Button
              size="sm"
              onClick={() => {
                onClose();
                toast.action?.onClick();
              }}
            >
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

/** Top-center stack bound to `toastStore`. */
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
