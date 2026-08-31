import type { ReactNode } from "react";
import { cx } from "../../../lib/cx";
import s from "./EmptyState.module.css";

export interface EmptyStateProps {
  /** 24px icon. */
  icon?: ReactNode;
  title: string;
  /** One-line hint. */
  hint?: ReactNode;
  /** Optional single secondary button. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, hint, action, className }: EmptyStateProps) {
  return (
    <div className={cx(s.empty, className)}>
      {icon && <span className={s.icon}>{icon}</span>}
      <div className={s.title}>{title}</div>
      {hint && <div className={s.hint}>{hint}</div>}
      {action}
    </div>
  );
}
