import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../../../lib/cx";
import s from "./ToolbarButton.module.css";

export interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 18px icon. */
  icon: ReactNode;
  /** Optional count shown after the label (xs, muted). */
  count?: number;
}

export function ToolbarButton({ icon, count, className, children, type = "button", ...rest }: ToolbarButtonProps) {
  return (
    <button type={type} className={cx(s.btn, className)} {...rest}>
      <span className={s.icon}>{icon}</span>
      {children}
      {count ? <span className={s.cnt}>{count}</span> : null}
    </button>
  );
}

export function ToolbarSeparator() {
  return <span className={s.sep} role="separator" />;
}
