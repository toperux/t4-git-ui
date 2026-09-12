import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../../lib/cx";
import { DisabledHint } from "../DisabledHint/DisabledHint";
import { Kbd } from "../Kbd/Kbd";
import s from "./Menu.module.css";

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  /** The element the menu drops down from (its own click toggles `open`). */
  anchor: ReactNode;
  /** Accessible name of the menu. */
  label: string;
  /** `MenuItem`s / `MenuSeparator`s. */
  children: ReactNode;
  /** Edge the menu aligns to (default `right`). */
  align?: "left" | "right";
  className?: string;
}

const ITEMS = '[role="menuitem"]:not(:disabled)';

/**
 * Outside mousedown / Escape / a scroll or resize under it → `onClose`; first item focused when
 * opened. `anchor` is what the menu is placed from (the trigger's wrapper, or the element under a
 * context menu's click point); only a scroll that moves *that* closes it.
 */
function useMenuDismiss(
  open: boolean,
  onClose: () => void,
  wrap: RefObject<HTMLElement | null>,
  menu: RefObject<HTMLElement | null>,
  anchor: RefObject<HTMLElement | null> = wrap,
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onClose();
    };
    // Escape normally lands on a focused item and `closeOnEscape` stops it there; this catches it
    // when focus stayed outside (every item disabled, so nothing in the menu took focus).
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // The menu is placed once, from the trigger or the click point: close it rather than let the
    // page slide out from under it and leave it labelling a row its items no longer act on. Its own
    // scrollbar is not that — and neither is a scroller the anchor doesn't sit in: the output dock
    // autoscrolls itself while an op streams, and that moves nothing the menu was placed from.
    const drift = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && menu.current?.contains(t)) return;
      if (anchor.current && t instanceof Node && !t.contains(anchor.current)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    document.addEventListener("scroll", drift, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", drift, true);
    };
  }, [open, onClose, wrap, menu, anchor]);

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(ITEMS)?.focus();
  }, [open, menu]);
}

/**
 * Focus returns to whatever opened the menu (its trigger) once it closes. Call it before
 * `useMenuDismiss`: effects run in order, and that one moves focus onto the first item.
 *
 * Only when the closing menu is what dropped the focus, though: an item that opens a dialog closes
 * the menu and mounts the dialog in the same commit, and the dialog's `autoFocus` field has already
 * taken the focus by the time this cleanup runs — pulling it back to the trigger would leave the
 * dialog on its Close button.
 */
function useRestoreFocus(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      const active = document.activeElement;
      const lost = !active || active === document.body || !active.isConnected;
      if (lost && opener?.isConnected) opener.focus();
    };
  }, [open]);
}

/** Escape closes the menu and stops there: a `Dialog` around it handles Escape too and must not close as well. */
function closeOnEscape(open: boolean, onClose: () => void) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open || e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };
}

/** ↑/↓ move focus between enabled items (wrapping), Home/End jump to the ends; Tab closes the menu. */
function onMenuKeyDown(onClose: () => void) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    // Tab must not walk focus out of a menu that stays open behind it — `Select` closes its list the
    // same way and lets the focus move on naturally.
    if (e.key === "Tab") {
      onClose();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(ITEMS));
    if (items.length === 0) return;
    if (e.key === "Home" || e.key === "End") {
      items[e.key === "Home" ? 0 : items.length - 1].focus();
      return;
    }
    const cur = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length;
    items[next].focus();
  };
}

/** Dropdown menu (style guide `Menu`): closes on outside click / Escape; ↑/↓ move focus; focus returns to the trigger. */
export function Menu({ open, onClose, anchor, label, children, align = "right", className }: MenuProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useRestoreFocus(open);
  useMenuDismiss(open, onClose, wrap, menu);

  return (
    <div ref={wrap} className={cx(s.wrap, className)} onKeyDown={closeOnEscape(open, onClose)}>
      {anchor}
      {open && (
        <div ref={menu} role="menu" aria-label={label} className={cx(s.menu, align === "left" && s.left)} onKeyDown={onMenuKeyDown(onClose)}>
          {children}
        </div>
      )}
    </div>
  );
}

export interface ContextMenuProps {
  /** Viewport position (right-click point or the focused row's corner); `null` = closed. */
  at: { x: number; y: number } | null;
  onClose: () => void;
  label: string;
  children: ReactNode;
}

/** Menu at an arbitrary point (style guide `ContextMenu`), kept inside the viewport; focus returns to the opener on close. */
export function ContextMenu({ at, onClose, label, children }: ContextMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const open = at !== null;
  // What the click point landed on, read while the menu is still uncommitted — an effect would read
  // the menu itself, which is drawn over that very point. `null` when nothing is there (or in jsdom,
  // which has no layout): then any scroll closes it, as it did before.
  const anchor = useRef<HTMLElement | null>(null);
  if (!at) anchor.current = null;
  else anchor.current ??= (document.elementFromPoint?.(at.x, at.y) as HTMLElement | null) ?? null;
  useRestoreFocus(open);
  useMenuDismiss(open, onClose, menu, menu, anchor);

  // Clamp to the viewport once the menu has a size.
  useLayoutEffect(() => {
    if (!at) return;
    const el = menu.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 4;
    setPos({
      x: Math.max(pad, Math.min(at.x, window.innerWidth - width - pad)),
      y: Math.max(pad, Math.min(at.y, window.innerHeight - height - pad)),
    });
  }, [at]);

  if (!at) return null;
  const p = pos ?? at;
  return createPortal(
    <div ref={menu} role="menu" aria-label={label} className={cx(s.menu, s.fixed)} style={{ left: p.x, top: p.y }} onKeyDown={onMenuKeyDown(onClose)}>
      {children}
    </div>,
    document.body,
  );
}

export interface MenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 16px icon. */
  icon?: ReactNode;
  danger?: boolean;
  /** Shortcut hint, right-aligned (`Ctrl+B`). */
  kbd?: string;
}

export function MenuItem({ icon, danger, kbd, className, children, type = "button", ...rest }: MenuItemProps) {
  return (
    // A disabled item is the one that most needs its `title` read — that is where "why is this
    // greyed out?" gets answered — and it is exactly the case Chromium refuses to show.
    <DisabledHint disabled={rest.disabled} title={rest.title} className={s.itemWrap}>
      {/* The chip is a picture of the shortcut, not part of the item's name ("Discard… Delete"):
          `aria-keyshortcuts` is what carries it to a screen reader. */}
      <button type={type} role="menuitem" className={cx(s.item, danger && s.danger, className)} aria-keyshortcuts={kbd} {...rest}>
        {icon && <span className={s.icon}>{icon}</span>}
        <span className={s.grow}>{children}</span>
        {kbd && (
          <Kbd className={s.kbd} aria-hidden>
            {kbd}
          </Kbd>
        )}
      </button>
    </DisabledHint>
  );
}

export function MenuSeparator() {
  return <div className={s.sep} role="separator" />;
}

/** A branch name inside a `MenuItem` label: mono, accent for local, muted for remote; plain on hover. */
export function MenuRef({ remote, className, children }: { remote?: boolean; className?: string; children: ReactNode }) {
  return <span className={cx(s.ref, remote ? s.remote : s.local, className)}>{children}</span>;
}
