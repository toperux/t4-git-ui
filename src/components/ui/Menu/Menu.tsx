import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../../lib/cx";
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

/** Outside mousedown / Escape → `onClose`; first item focused when opened. */
function useMenuDismiss(open: boolean, onClose: () => void, wrap: RefObject<HTMLElement | null>, menu: RefObject<HTMLElement | null>) {
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
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, wrap]);

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(ITEMS)?.focus();
  }, [open, menu]);
}

/**
 * Focus returns to whatever opened the menu (its trigger) once it closes. Call it before
 * `useMenuDismiss`: effects run in order, and that one moves focus onto the first item.
 */
function useRestoreFocus(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener?.isConnected) opener.focus();
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

/** ↑/↓ move focus between enabled items (wrapping). */
function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(ITEMS));
  if (items.length === 0) return;
  const cur = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === "ArrowDown" ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length;
  items[next].focus();
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
        <div ref={menu} role="menu" aria-label={label} className={cx(s.menu, align === "left" && s.left)} onKeyDown={onMenuKeyDown}>
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
  useRestoreFocus(open);
  useMenuDismiss(open, onClose, menu, menu);

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
    <div ref={menu} role="menu" aria-label={label} className={cx(s.menu, s.fixed)} style={{ left: p.x, top: p.y }} onKeyDown={onMenuKeyDown}>
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
    <button type={type} role="menuitem" className={cx(s.item, danger && s.danger, className)} {...rest}>
      {icon && <span className={s.icon}>{icon}</span>}
      <span className={s.grow}>{children}</span>
      {kbd && <Kbd className={s.kbd}>{kbd}</Kbd>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className={s.sep} role="separator" />;
}

/** A branch name inside a `MenuItem` label: mono, accent for local, muted for remote; plain on hover. */
export function MenuRef({ remote, className, children }: { remote?: boolean; className?: string; children: ReactNode }) {
  return <span className={cx(s.ref, remote ? s.remote : s.local, className)}>{children}</span>;
}
