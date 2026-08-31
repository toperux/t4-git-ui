import type { ReactNode } from "react";
import { cx } from "../../../lib/cx";
import s from "./Kbd.module.css";

/** Shortcut chip (style guide §3 `Kbd`). Used by menu items and the start screen's action cards. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cx(s.kbd, className)}>{children}</kbd>;
}
