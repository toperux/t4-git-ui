import { useEffect, useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../../../lib/cx";
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
  className?: string;
}

const ITEMS = '[role="menuitem"]:not(:disabled)';

/** Dropdown menu (style guide `Menu`): closes on outside click / Escape; ↑/↓ move focus. */
export function Menu({ open, onClose, anchor, label, children, className }: MenuProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(ITEMS)?.focus();
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []);
    if (items.length === 0) return;
    const cur = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length;
    items[next].focus();
  }

  return (
    <div ref={wrap} className={cx(s.wrap, className)}>
      {anchor}
      {open && (
        <div ref={menu} role="menu" aria-label={label} className={s.menu} onKeyDown={onKeyDown}>
          {children}
        </div>
      )}
    </div>
  );
}

export interface MenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 16px icon. */
  icon?: ReactNode;
  danger?: boolean;
}

export function MenuItem({ icon, danger, className, children, type = "button", ...rest }: MenuItemProps) {
  return (
    <button type={type} role="menuitem" className={cx(s.item, danger && s.danger, className)} {...rest}>
      {icon && <span className={s.icon}>{icon}</span>}
      <span className={s.grow}>{children}</span>
    </button>
  );
}

export function MenuSeparator() {
  return <div className={s.sep} role="separator" />;
}
