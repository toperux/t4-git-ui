import type { ButtonHTMLAttributes } from "react";
import { cx } from "../../../lib/cx";
import { DisabledHint } from "../DisabledHint/DisabledHint";
import s from "./IconButton.module.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also used as the tooltip (`title`) unless one is given. */
  label: string;
  /** Toggled state. */
  on?: boolean;
}

export function IconButton({ label, on, className, title, type = "button", children, ...rest }: IconButtonProps) {
  // The label doubles as the tooltip, so a disabled icon button has one to show by definition.
  const tip = title ?? label;
  return (
    <DisabledHint disabled={rest.disabled} title={tip}>
      <button
        type={type}
        aria-label={label}
        aria-pressed={on === undefined ? undefined : on}
        title={tip}
        className={cx(s.btn, on && s.on, className)}
        {...rest}
      >
        {children}
      </button>
    </DisabledHint>
  );
}
