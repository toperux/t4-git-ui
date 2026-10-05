import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx";
import s from "./Banner.module.css";

export interface BannerProps {
  kind: "warning" | "danger";
  children: ReactNode;
  /** `sm` buttons, right-aligned. */
  actions?: ReactNode;
  /** Text that has to be read whole wraps onto more lines instead of being cut off. */
  wrap?: boolean;
  className?: string;
}

export function Banner({ kind, children, actions, wrap, className }: BannerProps) {
  return (
    <div className={cx(s.banner, s[kind], wrap && s.wrap, className)} role={kind === "danger" ? "alert" : "status"}>
      <span className={s.icon}>
        <TriangleAlert size={14} aria-hidden />
      </span>
      <span className={s.text}>{children}</span>
      {actions}
    </div>
  );
}
