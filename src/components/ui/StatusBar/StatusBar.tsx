import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../../lib/cx";
import s from "./StatusBar.module.css";

export interface StatusBarProps {
  left: ReactNode;
  right?: ReactNode;
}

export function StatusBar({ left, right }: StatusBarProps) {
  return (
    <div className={s.bar} role="status">
      {left}
      <span className={s.grow} />
      {right}
    </div>
  );
}

export function StatusItem({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx(s.item, className)} {...rest}>
      {children}
    </span>
  );
}
