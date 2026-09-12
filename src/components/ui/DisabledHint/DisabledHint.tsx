import type { ReactNode } from "react";
import s from "./DisabledHint.module.css";

export interface DisabledHintProps {
  disabled?: boolean;
  title?: string;
  /**
   * Overrides how the wrapper sits in its parent. It hugs the control by default, which is right
   * in a flex row; a control that fills a block container (a menu item) needs a block-level box
   * instead, or it shrinks to its own content and stops matching its neighbours.
   *
   * It **replaces** the default class rather than joining it. Both set `display`, and two
   * single-class rules of equal specificity are settled by the order the bundler happens to emit
   * their stylesheets in — so merging them worked only by the accident of this file being imported
   * before the caller's own CSS. Replacing leaves nothing to win.
   */
  className?: string;
  children: ReactNode;
}

/**
 * Makes a disabled control's `title` reachable.
 *
 * Chromium gives a disabled control no pointer events, so it never fires a tooltip — and the
 * `title` on a disabled control is almost always the explanation for *why* it is dead ("No
 * changes", "No URL configured", "Every file here is conflicted"). Hovering it shows nothing, so
 * that explanation reaches no one. A wrapper that is not itself disabled still takes the hover.
 *
 * `Checkbox` already does exactly this by hanging its `title` on the `<label>` that wraps the
 * input; this is the same trick for the controls that have no wrapper of their own.
 *
 * It wraps only when wrapping would help, so an enabled control renders exactly the DOM it always
 * did. The control keeps its own `title` too: assistive tech reads it there, and nothing that
 * queries the button for its title has to change.
 */
export function DisabledHint({ disabled, title, className, children }: DisabledHintProps) {
  if (!disabled || !title) return <>{children}</>;
  // `role="none"` keeps the wrapper out of the accessibility tree: a `role="menu"` may only own
  // menuitems, and a bare span between the two would be an invalid child. It costs nothing
  // elsewhere, and the control keeps its own `title`, so nothing is lost by hiding this one.
  return (
    <span className={className ?? s.wrap} role="none" title={title}>
      {children}
    </span>
  );
}
