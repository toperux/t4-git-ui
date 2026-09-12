import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../../../lib/cx";
import { DisabledHint } from "../DisabledHint/DisabledHint";
import s from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  /** 14px icon rendered left of the label. */
  icon?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", icon, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <DisabledHint disabled={rest.disabled} title={rest.title}>
      <button type={type} className={cx(s.btn, s[variant], size === "sm" && s.sm, className)} {...rest}>
        {icon && <span className={s.icon}>{icon}</span>}
        {children}
      </button>
    </DisabledHint>
  );
}
