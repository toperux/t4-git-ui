import type { HTMLAttributes } from "react";
import { cx } from "../../../lib/cx";
import s from "./Kbd.module.css";

/** Shortcut chip (style guide §3 `Kbd`). Used by menu items and the start screen's action cards. */
export function Kbd({ children, className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd className={cx(s.kbd, className)} {...rest}>
      {children}
    </kbd>
  );
}
