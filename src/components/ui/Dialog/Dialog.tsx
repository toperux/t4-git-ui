import { X } from "lucide-react";
import { useEffect, useId, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../../lib/cx";
import { IconButton } from "../IconButton/IconButton";
import s from "./Dialog.module.css";

export interface DialogProps {
  title: string;
  /** 560px (output-bearing / two-column) instead of 440px. */
  wide?: boolean;
  onClose: () => void;
  /** Enter in a field / the `type="submit"` footer button. */
  onSubmit?: () => void;
  /** Footer left: `Runs git …` (mono). */
  preview?: string;
  /** Footer buttons, primary last (`type="submit"`). */
  footer: ReactNode;
  children: ReactNode;
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog (style guide `Dialog`): scrim, title + close, body, footer. Esc closes, Enter submits,
 * Tab is trapped inside, focus returns to the opener on unmount. Rendered into `document.body`.
 */
export function Dialog({ title, wide, onClose, onSubmit, preview, footer, children }: DialogProps) {
  const ref = useRef<HTMLFormElement>(null);
  const titleId = useId();
  // Captured during the first render, before React's own `autoFocus` moves the focus into the dialog.
  const opener = useRef<HTMLElement | null | undefined>(undefined);
  if (opener.current === undefined) opener.current = document.activeElement as HTMLElement | null;

  // React focuses an `autoFocus` control itself; only fall back when nothing inside took focus.
  useEffect(() => {
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const back = opener.current;
    return () => {
      if (back?.isConnected) back.focus();
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
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
    <div className={s.scrim}>
      <form ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cx(s.dialog, wide && s.wide)} onKeyDown={onKeyDown} onSubmit={submit}>
        <div className={s.title}>
          <span id={titleId} className={s.grow}>
            {title}
          </span>
          <IconButton label="Close" onClick={onClose}>
            <X size={14} aria-hidden />
          </IconButton>
        </div>
        <div className={s.body}>{children}</div>
        <div className={s.foot}>
          {preview && (
            <span className={s.preview} title={preview}>
              Runs <code>{preview}</code>
            </span>
          )}
          <span className={s.grow} />
          {footer}
        </div>
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
