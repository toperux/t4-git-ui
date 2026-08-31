import { X } from "lucide-react";
import { useId, type KeyboardEvent, type ReactNode } from "react";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { cx } from "../../lib/cx";
import s from "./Dialog.module.css";

export interface DialogProps {
  title: string;
  /** Esc / close button. Ignored while `busy`. */
  onClose: () => void;
  busy?: boolean;
  /** 560px (output-bearing) instead of 440px. */
  wide?: boolean;
  children: ReactNode;
  footer: ReactNode;
}

/** Minimal modal over a scrim (style guide `Dialog`); focus is left to the first autofocused control. */
export function Dialog({ title, onClose, busy, wide, children, footer }: DialogProps) {
  const titleId = useId();

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && !busy) {
      e.stopPropagation();
      onClose();
    }
  }

  return (
    <div className={s.scrim}>
      <div className={cx(s.dialog, wide && s.wide)} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <div className={s.title}>
          <span id={titleId} className={s.grow}>
            {title}
          </span>
          <IconButton label="Close" onClick={onClose} disabled={busy}>
            <X size={16} aria-hidden />
          </IconButton>
        </div>
        {children}
        <div className={s.foot}>{footer}</div>
      </div>
    </div>
  );
}
