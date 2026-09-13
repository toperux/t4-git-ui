import { ExternalLink, Plus, X } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { onTabAdopt, onTabDragOut, onTabDragOver } from "../../api/events";
import { toAppError } from "../../api/ipc";
import type { RepoId } from "../../api/types";
import { ContextMenu, MenuItem } from "../../components/ui/Menu/Menu";
import { useTabsStore, type Tab } from "../../store/tabsStore";
import { toastError } from "../../store/toastStore";
import { copyText, pickAndOpenRepo } from "./actions";
import s from "./TabStrip.module.css";
import { insertionIndex, useTabDrag, type DragUi } from "./useTabDrag";

/**
 * The other half of a drag, for a tab coming *in*: the caret this window draws while one hovers it,
 * and the tab itself once it is dropped. Mounted by `App` rather than the strip, which is not
 * rendered with fewer than two tabs — and not at all on the start screen, both of which can be
 * dropped on.
 */
export function listenTabDrags(): () => void {
  /** The strip is hidden below two tabs, so there are no slots to measure: the tab goes on the end. */
  const slotAt = (x: number) => {
    const { tabs } = useTabsStore.getState();
    return tabs.length > 1 ? insertionIndex(x) : tabs.length;
  };
  const unlisten = [
    onTabDragOver((x) => useTabsStore.getState().setCaret(slotAt(x))),
    onTabDragOut(() => useTabsStore.getState().setCaret(null)),
    onTabAdopt(({ path, x }) => {
      // Measured before the caret goes, the way it was placed while the tab hovered.
      const at = slotAt(x);
      const st = useTabsStore.getState();
      const before = st.tabs.length;
      st.setCaret(null);
      void st
        .openTab(path)
        .then(() => {
          // `openTab` appends and activates; only a tab that is actually new has a slot to take.
          const tabs = useTabsStore.getState().tabs;
          if (tabs.length === before + 1) st.reorder(tabs.length - 1, Math.min(at, tabs.length - 1));
        })
        .catch((e: unknown) => toastError(toAppError(e), "Couldn't open repository"));
    }),
  ];
  return () => unlisten.forEach((fn) => fn());
}

/**
 * The open repositories of this window. Shown with two tabs or more (`RepoWindow`), or with one
 * while a tab from another window hovers it; with one there is nothing to switch to, and the toolbar
 * already names it — and its repository button is the drag handle in that window (`useTabDrag`).
 *
 * Dragging a tab is pointer capture on the strip, not HTML5 drag and drop, which cannot cross a
 * webview: inside the strip it reorders, outside it a ghost follows the cursor and Rust says which
 * window is under it (`drag_over` / `drop_tab`).
 */
export function TabStrip() {
  const tabs = useTabsStore((st) => st.tabs);
  const active = useTabsStore((st) => st.active);
  const caret = useTabsStore((st) => st.caret);
  const [menu, setMenu] = useState<{ tab: Tab; at: { x: number; y: number } } | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const { begin, handlers, ui, ghost } = useTabDrag({ surface: strip, reorder: true, onClick: (id) => useTabsStore.getState().activate(id) });

  return (
    <div ref={strip} className={s.strip} role="tablist" aria-label="Open repositories" {...handlers}>
      {tabs.map((t, i) => (
        <Fragment key={t.id}>
          {i === caret && <span className={s.caret} aria-hidden />}
          <div
            data-tab
            role="tab"
            tabIndex={t.id === active ? 0 : -1}
            aria-selected={t.id === active}
            title={t.path}
            className={tabClass(t, active, ui)}
            // The close button is not a drag handle.
            onPointerDown={(e) => {
              if (!(e.target as HTMLElement).closest("button")) begin(e, t);
            }}
            onClick={() => useTabsStore.getState().activate(t.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                useTabsStore.getState().activate(t.id);
              }
            }}
            // Middle-click closes, like a browser tab.
            onAuxClick={(e) => {
              if (e.button !== 1) return;
              e.preventDefault();
              void useTabsStore.getState().closeTab(t.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ tab: t, at: { x: e.clientX, y: e.clientY } });
            }}
          >
            <span className={s.label}>{t.name}</span>
            {t.stale && <span className={s.stale} aria-label="Changed" />}
            <button
              type="button"
              className={s.close}
              aria-label={`Close ${t.name}`}
              onClick={(e) => {
                e.stopPropagation();
                void useTabsStore.getState().closeTab(t.id);
              }}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </Fragment>
      ))}
      {caret !== null && caret >= tabs.length && <span className={s.caret} aria-hidden />}
      <button type="button" className={s.add} aria-label="Open repository…" title="Open repository… (Ctrl+T)" onClick={() => void pickAndOpenRepo()}>
        <Plus size={16} aria-hidden />
      </button>
      {ghost}
      <ContextMenu at={menu?.at ?? null} onClose={() => setMenu(null)} label="Tab">
        {menu && (
          <>
            <MenuItem
              icon={<ExternalLink size={16} aria-hidden />}
              onClick={() => {
                setMenu(null);
                void useTabsStore.getState().detach(menu.tab.id);
              }}
            >
              Move to new window
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenu(null);
                copyText(menu.tab.path, "path");
              }}
            >
              Copy path
            </MenuItem>
            <MenuItem
              icon={<X size={16} aria-hidden />}
              onClick={() => {
                setMenu(null);
                void useTabsStore.getState().closeTab(menu.tab.id);
              }}
            >
              Close
            </MenuItem>
          </>
        )}
      </ContextMenu>
    </div>
  );
}

function tabClass(t: Tab, active: RepoId | null, ui: DragUi | null): string {
  let cls = t.id === active ? `${s.tab} ${s.active}` : s.tab;
  if (ui?.id === t.id) cls += ui.detached ? ` ${s.detached}` : ` ${s.dragging}`;
  return cls;
}
