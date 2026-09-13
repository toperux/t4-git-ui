import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { dragCancel, dragOver, dropTab, toAppError, windowOrigin } from "../../api/ipc";
import type { RepoId, WindowOrigin } from "../../api/types";
import { useTabsStore, type Tab } from "../../store/tabsStore";
import { toastError } from "../../store/toastStore";
import { refusedWhileRunning } from "./actions";
import s from "./TabStrip.module.css";

/** Pointer travel before a press on a tab becomes a drag. */
const DRAG_THRESHOLD = 5;
/**
 * Grace around the surface: inside it the strip still reorders and the handle has not been dragged
 * at all, past it the tab is coming out.
 */
const STRIP_SLACK = 24;
/** Throttle for the cross-window hit test — one round trip to Rust per probe. */
const PROBE_MS = 30;
/** On `<html>` while a tab is being dragged, so every element agrees on the cursor. */
const DRAGGING = "dragging-tab";

/** A drag in progress. Lives in a ref: none of it belongs in a render. */
interface Drag {
  id: RepoId;
  name: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** Where the tab sat when it was picked up, so a cancel can put it back. */
  startIndex: number;
  moved: boolean;
  detached: boolean;
  lastProbe: number;
  origin: WindowOrigin | null;
  /**
   * Every drag message to Rust is chained onto this, so they arrive in the order they were issued:
   * a `drag_over` landing after the `drag_cancel` that ended it leaves the other window with a caret
   * nothing will clear.
   */
  ipc: Promise<unknown>;
}

/** What the surface draws of the drag: the tab being moved, and where the ghost is. */
export interface DragUi {
  id: RepoId;
  name: string;
  detached: boolean;
  x: number;
  y: number;
}

type Pointer = Pick<PointerEvent, "clientX" | "clientY" | "screenX" | "screenY">;

export interface TabDragOptions {
  /** The element pointer capture goes on, and the moves come back to. */
  surface: RefObject<HTMLElement | null>;
  /** The strip only: inside it (plus slack) a drag reorders instead of detaching. */
  reorder?: boolean;
  /** A press that never passed the threshold. */
  onClick?: (id: RepoId) => void;
}

/**
 * The pointer as a physical screen point, from this window's origin and scale. Deliberately not
 * `screenX * devicePixelRatio`: that assumes one scale factor for the whole desktop and lands in the
 * wrong place as soon as two monitors are scaled differently. Without an exact origin (Wayland) the
 * guess is all there is — it only decides where a torn-off window appears.
 */
function screenPoint(e: Pointer, o: WindowOrigin) {
  if (!o.exact) return { x: e.screenX * window.devicePixelRatio, y: e.screenY * window.devicePixelRatio };
  return { x: o.x + e.clientX * o.scale, y: o.y + e.clientY * o.scale };
}

/** Slot a tab released at `clientX` would take, in the strip's current order (the panel's Changes / Files tabs carry `data-tab` too). */
export function insertionIndex(clientX: number): number {
  const nodes = [...document.querySelectorAll<HTMLElement>('[aria-label="Open repositories"] [data-tab]')];
  for (let i = 0; i < nodes.length; i++) {
    const r = nodes[i].getBoundingClientRect();
    if (clientX < r.left + r.width / 2) return i;
  }
  return nodes.length;
}

/**
 * Dragging a tab out of this window: pointer capture on `surface`, not HTML5 drag and drop, which
 * cannot cross a webview. Past the threshold a ghost follows the cursor and Rust says which window
 * is under it (`drag_over` / `drop_tab`); with `reorder` the drag stays a reorder while it is still
 * over the strip.
 *
 * Shared by the strip and the toolbar's repository button, which is the handle for the active tab
 * in a window whose single tab hides the strip.
 */
export function useTabDrag({ surface, reorder = false, onClick }: TabDragOptions) {
  const [ui, setUi] = useState<DragUi | null>(null);
  const drag = useRef<Drag | null>(null);
  /** Whether the press that just ended was a drag: the click after it is not a click. */
  const moved = useRef(false);

  /** Ends the drag in the DOM, whichever way it ended. */
  const finish = useCallback(
    (d: Drag) => {
      drag.current = null;
      moved.current = d.moved;
      try {
        surface.current?.releasePointerCapture(d.pointerId);
      } catch {
        /* the capture is already gone */
      }
      document.documentElement.classList.remove(DRAGGING);
      setUi(null);
    },
    [surface],
  );

  const cancelDrag = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    finish(d);
    if (d.detached) d.ipc = d.ipc.then(() => dragCancel()).catch(() => undefined);
    // Dragging through the strip has already moved the tab; a cancelled drag leaves nothing behind.
    const from = useTabsStore.getState().tabs.findIndex((t) => t.id === d.id);
    if (from >= 0) useTabsStore.getState().reorder(from, d.startIndex);
  }, [finish]);

  // Escape while dragging is a cancel, wherever the focus is.
  const dragging = ui !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelDrag();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragging, cancelDrag]);

  function begin(e: React.PointerEvent, t: Tab) {
    // A press that never starts a drag still has to clear the last one, or its click is swallowed.
    moved.current = false;
    // A middle click is the close on a tab; the menu elsewhere.
    if (e.button !== 0) return;
    const el = surface.current;
    if (!el) return;
    drag.current = {
      id: t.id,
      name: t.name,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startIndex: useTabsStore.getState().tabs.findIndex((x) => x.id === t.id),
      moved: false,
      detached: false,
      lastProbe: 0,
      origin: null,
      ipc: Promise.resolve(),
    };
    // Fetched rather than derived here so the screen mapping is exact on a scaled or second monitor;
    // it lands well before the pointer has moved far enough to count as a drag.
    void windowOrigin()
      .then((o) => {
        if (drag.current) drag.current.origin = o;
      })
      .catch(() => undefined);
    // On the strip, not the tab: a reorder moves the tab elements around under the pointer.
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const r = surface.current?.getBoundingClientRect();
    if (!d.moved) {
      // On the strip a few pixels of travel is a drag — there are slots to shuffle. The handle has
      // none, and its press is also the one that opens the repository menu: nothing happens until
      // the pointer leaves the button plus the same slack, so a slip is still a click.
      const past = reorder
        ? Math.hypot(e.clientX - d.startX, e.clientY - d.startY) >= DRAG_THRESHOLD
        : !!r && (e.clientX < r.left - STRIP_SLACK || e.clientX > r.right + STRIP_SLACK || e.clientY < r.top - STRIP_SLACK || e.clientY > r.bottom + STRIP_SLACK);
      if (!past) return;
      d.moved = true;
      document.documentElement.classList.add(DRAGGING);
    }

    // The handle has no slots to shuffle: past its band the tab is already coming out.
    const inStrip = reorder && !!r && e.clientY >= r.top - STRIP_SLACK && e.clientY <= r.bottom + STRIP_SLACK;
    if (inStrip) {
      if (d.detached) {
        d.detached = false;
        d.ipc = d.ipc.then(() => dragCancel()).catch(() => undefined);
      }
      reorderTo(d, insertionIndex(e.clientX));
      setUi((u) => (u && !u.detached && u.id === d.id ? u : { id: d.id, name: d.name, detached: false, x: 0, y: 0 }));
      return;
    }

    d.detached = true;
    setUi({ id: d.id, name: d.name, detached: true, x: e.clientX, y: e.clientY });
    // Off Windows nothing can say which window is under the cursor (`window_at`), and without an
    // exact origin there is nothing to ask with: skipping the probe is the honest signal that
    // releasing here tears the tab off.
    if (!d.origin?.exact) return;
    const now = performance.now();
    if (now - d.lastProbe < PROBE_MS) return;
    d.lastProbe = now;
    const { x, y } = screenPoint(e, d.origin);
    d.ipc = d.ipc.then(() => dragOver(x, y)).catch(() => undefined);
  }

  async function endDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const at: Pointer = { clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY };
    finish(d);
    // A press that never became a drag is a click; the reorder of one that stayed in the strip is
    // already applied.
    if (!d.moved) {
      onClick?.(d.id);
      return;
    }
    if (!d.detached) return;
    // A detached drag has left a caret painted in whatever window the probe last found: anything
    // that ends the drag short of a drop has to clear it.
    const clearHover = () => void (d.ipc = d.ipc.then(() => dragCancel()).catch(() => undefined));

    const tabsNow = useTabsStore.getState().tabs;
    const tab = tabsNow.find((t) => t.id === d.id);
    if (!tab) return clearHover();
    // An operation started after the drag did: `closeTab` would refuse once the tab had been handed
    // over, leaving the repository owned by two windows. It stays here, with the usual toast.
    if (refusedWhileRunning("moving a tab")) return clearHover();
    // Never bail for want of an origin: the tab has already been lifted out of the strip, and an
    // inexact one still places a new window roughly right.
    const origin = d.origin ?? (await windowOrigin().catch(() => null)) ?? { x: 0, y: 0, scale: window.devicePixelRatio, exact: false };
    const { x, y } = screenPoint(at, origin);
    try {
      // The last tab already has a window to itself: tearing it off would swap this window for a new
      // one and leave an empty shell behind. Adoption by another window still works.
      const outcome = await (d.ipc = d.ipc.then(() => dropTab(x, y, tab.path, tabsNow.length > 1)));
      // Only once the tab has somewhere to be: a spawn that fails must not lose the repository, and
      // `closeTab` closes a secondary window whose last tab this was.
      if (outcome !== "none") await useTabsStore.getState().closeTab(tab.id);
    } catch (e2: unknown) {
      toastError(toAppError(e2), "Couldn't move the tab");
    }
  }

  return {
    begin,
    /** Spread onto the same element `surface` points at — pointer capture sends them all there. */
    handlers: {
      onPointerMove,
      onPointerUp: (e: React.PointerEvent) => void endDrag(e),
      onPointerCancel: cancelDrag,
    },
    ui,
    /** The chip under the cursor once the tab is out; `position: fixed`, so it can be mounted anywhere. */
    ghost: ui?.detached ? (
      <div className={s.ghost} style={{ transform: `translate(${ui.x - 16}px, ${ui.y - 14}px)` }}>
        {ui.name}
      </div>
    ) : null,
    /**
     * Whether the press that just ended was a drag, for a caller that has a click to swallow. Reads
     * it once: a keyboard click carries no pointerdown to clear the flag, and a drag that left the
     * tab where it was (dropped on nothing, or cancelled) would swallow every later Enter.
     */
    dragged: () => {
      const was = moved.current;
      moved.current = false;
      return was;
    },
  };
}

/** Moves the dragged tab into the slot the pointer is over. */
function reorderTo(d: Drag, slot: number) {
  const { tabs, reorder } = useTabsStore.getState();
  const from = tabs.findIndex((t) => t.id === d.id);
  if (from < 0) return;
  // The slot counts the dragged tab, which is about to be lifted out of it.
  reorder(from, Math.max(0, Math.min(tabs.length - 1, slot > from ? slot - 1 : slot)));
}
