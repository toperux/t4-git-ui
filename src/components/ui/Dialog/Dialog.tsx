import { X } from "lucide-react";
import { createContext, useContext, useEffect, useId, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../../lib/cx";
import { IconButton } from "../IconButton/IconButton";
import s from "./Dialog.module.css";

/**
 * Focus target on close, supplied by whoever renders the dialog (`DialogHost`). A dialog opened from
 * a menu item can't use `document.activeElement`: the item unmounts in the same commit.
 */
export const DialogReturnFocus = createContext<HTMLElement | null>(null);

export interface DialogProps {
  title: string;
  /** 560px (output-bearing / two-column) instead of 440px. */
  wide?: boolean;
  /** Fills the window (commit dialog); the body is an unpadded flex column for the caller's own layout. */
  full?: boolean;
  onClose: () => void;
  /** A long-running action owns the dialog: Esc and the close button are inert. */
  busy?: boolean;
  /** Enter in a field / the `type="submit"` footer button. */
  onSubmit?: () => void;
  /** Footer left: `Runs git …` (mono). */
  preview?: string;
  /** Footer buttons, primary last (`type="submit"`); no footer at all when omitted. */
  footer?: ReactNode;
  children: ReactNode;
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog (style guide `Dialog`): scrim, title + close, body, footer. Esc closes, Enter submits,
 * Tab is trapped inside, focus returns to the opener on unmount. Rendered into `document.body`.
 */
export function Dialog({ title, wide, full, onClose, busy, onSubmit, preview, footer, children }: DialogProps) {
  const ref = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const returnFocusTo = useContext(DialogReturnFocus);
  // Captured during the first render, before React's own `autoFocus` moves the focus into the dialog.
  const opener = useRef<HTMLElement | null | undefined>(undefined);
  if (opener.current === undefined) opener.current = returnFocusTo ?? (document.activeElement as HTMLElement | null);

  // React focuses an `autoFocus` control itself; only fall back when nothing inside took focus.
  useEffect(() => {
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const back = opener.current;
    return () => {
      // Only when closing dropped the focus: a dialog that opens another in the same commit (Commit &
      // Push) has already let the new one's `autoFocus` control take it, and pulling it back to the
      // opener would leave that dialog on its Close button.
      const active = document.activeElement;
      const lost = !active || active === document.body || !active.isConnected;
      if (lost && back?.isConnected) back.focus();
    };
  }, []);

  // A control disabled while `busy` drops the focus to `<body>`: once the action fails and the
  // dialog is live again, nothing inside it would take Esc or Tab. The body comes first — the
  // form's own first focusable is the title bar's Close, and Enter on it throws the fields away.
  useEffect(() => {
    const el = ref.current;
    if (busy || !el || el.contains(document.activeElement)) return;
    (bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? el.querySelector<HTMLElement>(FOCUSABLE))?.focus();
  }, [busy]);

  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !ref.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit?.();
  }

  return createPortal(
    <div className={cx(s.scrim, full && s.scrimFull)}>
      <form
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(s.dialog, wide && s.wide, full && s.full)}
        onKeyDown={onKeyDown}
        onSubmit={submit}
      >
        <div className={s.title}>
          <span id={titleId} className={s.grow}>
            {title}
          </span>
          <IconButton label="Close" disabled={busy} onClick={onClose}>
            <X size={16} aria-hidden />
          </IconButton>
        </div>
        <div ref={bodyRef} className={cx(s.body, full && s.bodyFull)}>
          {children}
        </div>
        {(footer || preview) && (
          <div className={s.foot}>
            {preview && (
              <span className={s.preview} title={preview}>
                Runs <code>{preview}</code>
              </span>
            )}
            <span className={s.grow} />
            {footer}
          </div>
        )}
      </form>
    </div>,
    document.body,
  );
}

export interface FieldProps {
  label: string;
  /** Help line under the control (xs muted; `--danger-text` when `invalid`). */
  help?: ReactNode;
  invalid?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label + control + help (style guide `Field`). Give the control an `aria-label` — the label is decorative. */
export function Field({ label, help, invalid, className, children }: FieldProps) {
  return (
    <div className={cx(s.field, className)}>
      <span className={s.label}>{label}</span>
      {children}
      {help && <span className={cx(s.help, invalid && s.helpInvalid)}>{help}</span>}
    </div>
  );
}

/** Two fields side by side. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className={s.row}>{children}</div>;
}

/** Checkboxes stacked (`inline` = wrapped on one line). */
export function Options({ inline, children }: { inline?: boolean; children: ReactNode }) {
  return <div className={inline ? s.inline : s.options}>{children}</div>;
}

/** Body text of a confirmation dialog. */
export function DialogText({ children }: { children: ReactNode }) {
  return <p className={s.message}>{children}</p>;
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className={s.mono}>{children}</span>;
}
