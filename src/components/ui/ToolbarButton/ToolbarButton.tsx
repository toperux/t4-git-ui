import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "../../../lib/cx";
import { DisabledHint } from "../DisabledHint/DisabledHint";
import s from "./ToolbarButton.module.css";

export interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 18px icon. */
  icon: ReactNode;
  /** Optional count shown after the label (xs, muted). */
  count?: number;
  /** The `<button>` itself — a `DisabledHint` wrapper makes it unfindable from the DOM around it. */
  ref?: Ref<HTMLButtonElement>;
}

export function ToolbarButton({ icon, count, className, children, type = "button", ...rest }: ToolbarButtonProps) {
  // Every toolbar control is disabled while an operation runs, and says so in its `title` — the
  // most-seen "why is this dead?" message in the app, and the one Chromium refuses to show.
  return (
    <DisabledHint disabled={rest.disabled} title={rest.title}>
      <button
        type={type}
        className={cx(s.btn, className)}
        {...rest}
        // macOS WebKit focuses no clicked button, so a dialog it opens would record <body> as the
        // opener to return to. A menu trigger is left alone: its `Menu` owns where the focus goes.
        onClick={(e) => {
          if (!rest["aria-haspopup"]) e.currentTarget.focus({ preventScroll: true });
          rest.onClick?.(e);
        }}
      >
        <span className={s.icon}>{icon}</span>
        {children != null && <span data-label>{children}</span>}
        {count ? <span className={s.cnt}>{count}</span> : null}
      </button>
    </DisabledHint>
  );
}

export function ToolbarSeparator() {
  return <span className={s.sep} role="separator" />;
}
