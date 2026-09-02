import type { ReactNode } from "react";
import { cx } from "../../../lib/cx";
import s from "./PanelHeader.module.css";

export interface PanelHeaderProps {
  /** 14px icon. */
  icon?: ReactNode;
  title: ReactNode;
  /** Right after the title text (a view toggle), not with the right-aligned actions. */
  after?: ReactNode;
  /** IconButtons, right-aligned. */
  children?: ReactNode;
  className?: string;
}

export function PanelHeader({ icon, title, after, children, className }: PanelHeaderProps) {
  return (
    <div className={cx(s.header, className)}>
      {icon && <span className={s.icon}>{icon}</span>}
      {after ? (
        // The ellipsizing span must not wrap the control: `overflow: hidden` would clip its focus ring.
        <span className={s.titleRow}>
          <span className={s.title}>{title}</span>
          {after}
        </span>
      ) : (
        <span className={s.title}>{title}</span>
      )}
      {children}
    </div>
  );
}
