import { ChevronRight } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
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
 * How long the pointer has to settle on an item before its submenu opens — or before the open one
 * closes, when it settles on a *sibling*: the pointer crosses siblings on its diagonal path from
 * the item into the panel, and closing on the first of them would put the panel out of its reach.
 */
const SUBMENU_HOVER_MS = 150;

/**
 * What a `MenuItem` needs from the `Menu` around it to own a submenu. `null` outside one (a
 * `ContextMenu` item) and inside a panel, which is what keeps submenus one level deep.
 */
interface MenuCtx {
  /** The panel's portal target: it is a DOM sibling of `.menu`, see `MenuItem`. */
  wrap: RefObject<HTMLDivElement | null>;
  /** The panel is placed beside this. */
  menu: RefObject<HTMLDivElement | null>;
  /** Identity of the item whose submenu is open — one at a time. */
  openSub: object | null;
  setOpenSub: (id: object | null) => void;
  /** The pointer settled on an item: open its submenu after the grace, or close the open one (`null`). */
  hover: (id: object | null) => void;
  /** The pointer reached the panel: whatever the grace was about to do, don't. */
  keepOpen: () => void;
  /** The parent menu's `onClose`. */
  close: () => void;
}

const MenuCtx = createContext<MenuCtx | null>(null);

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

/** ↑/↓ move focus between enabled items (wrapping), Home/End jump to the ends; Tab and Escape close the menu. */
function onMenuKeyDown(onClose: () => void) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    // Tab must not walk focus out of a menu that stays open behind it — `Select` closes its list the
    // same way and lets the focus move on naturally.
    if (e.key === "Tab") {
      onClose();
      return;
    }
    // A `ContextMenu` is portalled, so its keys still bubble up the React tree to whatever opened
    // it: inside the commit window that is the `Dialog`, which closes on Escape too. Stop it here.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
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

/**
 * A submenu panel is portalled into the parent's `wrap`, but it still sits inside its item in the
 * React tree — so every key in it bubbles to the parent `.menu`'s `onMenuKeyDown` and to
 * `closeOnEscape` on `wrap`. Escape and ArrowLeft close the panel alone and hand focus back to the
 * item; the ↑/↓ cycle runs against the panel's own rows and stops there, or the parent's would run
 * over its own rows as well. Tab closes both, as it does anywhere in a menu.
 */
function onSubmenuKeyDown(closePanel: () => void, closeAll: () => void) {
  const cycle = onMenuKeyDown(closeAll);
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" || e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
      return;
    }
    cycle(e);
    e.stopPropagation();
  };
}

/** Dropdown menu (style guide `Menu`): closes on outside click / Escape; ↑/↓ move focus; focus returns to the trigger. */
export function Menu({ open, onClose, anchor, label, children, align = "right", className }: MenuProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSub] = useState<object | null>(null);
  const grace = useRef<number | undefined>(undefined);
  useRestoreFocus(open);
  useMenuDismiss(open, onClose, wrap, menu);

  // A closed menu has no open submenu, and no timer left running to open one.
  useEffect(() => {
    if (open) return;
    clearTimeout(grace.current);
    setOpenSub(null);
  }, [open]);
  useEffect(() => () => clearTimeout(grace.current), []);

  const ctx = useMemo<MenuCtx>(() => {
    const keepOpen = () => clearTimeout(grace.current);
    return {
      wrap,
      menu,
      openSub,
      keepOpen,
      close: onClose,
      setOpenSub: (id) => {
        keepOpen();
        setOpenSub(id);
      },
      hover: (id) => {
        keepOpen();
        grace.current = window.setTimeout(() => setOpenSub(id), SUBMENU_HOVER_MS);
      },
    };
  }, [openSub, onClose]);

  return (
    <div ref={wrap} className={cx(s.wrap, className)} onKeyDown={closeOnEscape(open, onClose)}>
      {anchor}
      {open && (
        <div ref={menu} role="menu" aria-label={label} className={cx(s.menu, align === "left" && s.left)} onKeyDown={onMenuKeyDown(onClose)}>
          <MenuCtx.Provider value={ctx}>{children}</MenuCtx.Provider>
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
  /**
   * Rows the item opens beside itself, in a panel: hover, click, Enter or ArrowRight open it,
   * ArrowLeft or Escape close it again. Only inside a `Menu`, and only one level deep.
   */
  submenu?: ReactNode;
}

export function MenuItem({ icon, danger, kbd, submenu, className, children, type = "button", ...rest }: MenuItemProps) {
  const ctx = useContext(MenuCtx);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** This item's identity in the menu's one-open-submenu state. */
  const id = useRef({}).current;
  const itemId = useId();
  const open = ctx !== null && ctx.openSub === id;
  const [pos, setPos] = useState<{ top: number; left: number }>();
  /** Opened by key or click: the panel takes the focus. Opened by hover: the pointer keeps it. */
  const takeFocus = useRef(false);

  const openPanel = (focus: boolean) => {
    takeFocus.current = focus;
    ctx?.setOpenSub(id);
  };
  /** The panel only: focus goes back to the item it belongs to. */
  const closePanel = () => {
    ctx?.setOpenSub(null);
    btn.current?.focus();
  };

  // Beside the parent menu, level with the item, flipped to its left when the viewport is short on
  // the right and slid up when it is short at the bottom (`.submenu` scrolls what still doesn't
  // fit). ponytail: a panel is `.menu`-wide, so the parent's own width stands in for its width and
  // the placement takes one pass; only the height is measured.
  useLayoutEffect(() => {
    const m = ctx?.menu.current;
    if (!open || !m || !btn.current) return;
    const box = m.getBoundingClientRect();
    const fits = box.right + box.width <= window.innerWidth;
    const pad = 4;
    // `box.top` puts the menu's own coordinates in the viewport, where the clamp is: bottom edge
    // first, then the top, so a panel taller than the window starts at the top rather than above it.
    const top = Math.max(Math.min(btn.current.offsetTop, window.innerHeight - pad - box.top - (panel.current?.offsetHeight ?? 0)), pad - box.top);
    setPos({ top: m.offsetTop + top, left: m.offsetLeft + (fits ? m.offsetWidth : -m.offsetWidth) });
  }, [open, ctx]);

  useEffect(() => {
    if (open && takeFocus.current) panel.current?.querySelector<HTMLElement>(ITEMS)?.focus();
  }, [open]);

  const target = ctx?.wrap.current ?? null;
  return (
    <>
      {/* A disabled item is the one that most needs its `title` read — that is where "why is this
          greyed out?" gets answered — and it is exactly the case Chromium refuses to show. */}
      <DisabledHint disabled={rest.disabled} title={rest.title} className={s.itemWrap}>
        {/* The chip is a picture of the shortcut, not part of the item's name ("Discard… Delete"):
            `aria-keyshortcuts` is what carries it to a screen reader. */}
        <button
          type={type}
          role="menuitem"
          className={cx(s.item, danger && s.danger, className)}
          aria-keyshortcuts={kbd}
          {...rest}
          ref={btn}
          id={submenu ? itemId : rest.id}
          aria-haspopup={submenu ? "menu" : undefined}
          aria-expanded={submenu ? open : undefined}
          onClick={submenu ? () => openPanel(true) : rest.onClick}
          onKeyDown={(e) => {
            rest.onKeyDown?.(e);
            // Enter is handled here rather than left to the click a browser makes of it, so the
            // keyboard path is the same one ArrowRight takes.
            if (submenu && (e.key === "ArrowRight" || e.key === "Enter")) {
              e.preventDefault();
              openPanel(true);
            }
          }}
          // The menu's one open submenu belongs to whichever item the pointer or the focus is on.
          onMouseEnter={ctx ? () => ctx.hover(submenu ? id : null) : undefined}
          onFocus={
            ctx
              ? () => {
                  if (!open) ctx.setOpenSub(null);
                }
              : undefined
          }
        >
          {icon && <span className={s.icon}>{icon}</span>}
          <span className={s.grow}>{children}</span>
          {kbd && (
            <Kbd className={s.kbd} aria-hidden>
              {kbd}
            </Kbd>
          )}
          {submenu && <ChevronRight size={14} className={s.chev} aria-hidden />}
        </button>
      </DisabledHint>
      {open &&
        target &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            aria-labelledby={itemId}
            className={cx(s.menu, s.submenu)}
            style={pos}
            onKeyDown={onSubmenuKeyDown(closePanel, () => {
              ctx?.setOpenSub(null);
              ctx?.close();
            })}
            onMouseEnter={ctx?.keepOpen}
          >
            {/* No context inside a panel: its rows neither nest a submenu of their own nor close
                the one they are in by taking the focus. */}
            <MenuCtx.Provider value={null}>{submenu}</MenuCtx.Provider>
          </div>,
          target,
        )}
    </>
  );
}

export function MenuSeparator() {
  return <div className={s.sep} role="separator" />;
}

/** A branch name inside a `MenuItem` label: mono, accent for local, muted for remote; plain on hover. */
export function MenuRef({ remote, className, children }: { remote?: boolean; className?: string; children: ReactNode }) {
  return <span className={cx(s.ref, remote ? s.remote : s.local, className)}>{children}</span>;
}
