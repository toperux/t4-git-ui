import type { HTMLAttributes } from "react";
import { cx } from "../../../lib/cx";
import s from "./Badge.module.css";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "accent" | "danger";
}

export function Badge({ variant = "default", className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx(s.badge, variant !== "default" && s[variant], className)} {...rest}>
      {children}
    </span>
  );
}
