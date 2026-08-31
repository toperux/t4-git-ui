import type { ReactNode } from "react";
import { cx } from "../../../lib/cx";
import s from "./PanelHeader.module.css";

export interface PanelHeaderProps {
  /** 14px icon. */
  icon?: ReactNode;
  title: ReactNode;
  /** IconButtons, right-aligned. */
  children?: ReactNode;
  className?: string;
}

export function PanelHeader({ icon, title, children, className }: PanelHeaderProps) {
  return (
    <div className={cx(s.header, className)}>
      {icon && <span className={s.icon}>{icon}</span>}
      <span className={s.title}>{title}</span>
      {children}
    </div>
  );
}
