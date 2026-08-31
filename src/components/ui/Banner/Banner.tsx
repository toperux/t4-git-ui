import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx";
import s from "./Banner.module.css";

export interface BannerProps {
  kind: "warning" | "danger";
  children: ReactNode;
  /** `sm` buttons, right-aligned. */
  actions?: ReactNode;
  className?: string;
}

export function Banner({ kind, children, actions, className }: BannerProps) {
  return (
    <div className={cx(s.banner, s[kind], className)} role={kind === "danger" ? "alert" : "status"}>
      <span className={s.icon}>
        <TriangleAlert size={14} aria-hidden />
      </span>
      <span className={s.text}>{children}</span>
      {actions}
    </div>
  );
}
