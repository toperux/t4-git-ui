import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Kbd } from "../../../components/ui/Kbd/Kbd";
import { cx } from "../../../lib/cx";
import { useDialogStore } from "../../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../../store/opsStore";
import { useRecentsStore } from "../../../store/recentsStore";
import { useRepoStore } from "../../../store/repoStore";
import { selectChangeCount, useStatusStore } from "../../../store/statusStore";
import { useTabsStore } from "../../../store/tabsStore";
import { useViewStore } from "../../../store/viewStore";
import { closeTab, detachTab, fetchDefault, openCommitPanel, pickAndOpenRepo, refreshAll, stashApply, stashPop, switchRepo } from "../actions";
import { layoutFor } from "../layout";
import { buildCommands } from "./commands";
import s from "./CommandPalette.module.css";
import { usePaletteStore } from "./paletteStore";
import { rankCommands } from "./rank";

/** Ctrl+K: every action, view, branch and recent repository behind one search box (spec §4). */
export function CommandPalette() {
  const open = usePaletteStore((st) => st.open);
  return open ? <PalettePanel /> : null;
}

function PalettePanel() {
  const setOpen = usePaletteStore((st) => st.setOpen);
  const recent = usePaletteStore((st) => st.recent);
  const markRun = usePaletteStore((st) => st.markRun);
  const running = useOpsStore(selectRunning);
  const repoPath = useRepoStore((st) => st.repo?.path ?? null);
  const refs = useRepoStore((st) => st.refs);
  const recents = useRecentsStore((st) => st.recents);
  const changes = useStatusStore(selectChangeCount);
  const tabCount = useTabsStore((st) => st.tabs.length);
  const openDialog = useDialogStore((st) => st.open);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  // Give the keyboard back to where it was (the grid, a field) when the palette closes. Captured
  // during render: by the time an effect runs, the input's `autoFocus` has already taken the focus.
  // A command that opens a dialog still wins — React runs this cleanup before the dialog's mount effects.
  const [from] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => () => from?.focus(), [from]);

  const commands = useMemo(
    () =>
      buildCommands({
        running,
        repoPath,
        local: refs?.local ?? [],
        remotes: refs?.remotes ?? [],
        stashes: refs?.stashes ?? [],
        recents,
        changes,
        tabCount,
        setView: (v) => useViewStore.getState().setView(v),
        openChanges: openCommitPanel,
        openDialog: (spec) => openDialog(spec),
        revealOid: (oid) => void useRepoStore.getState().revealOid(oid),
        switchRepo,
        pickAndOpenRepo: () => void pickAndOpenRepo(),
        fetchDefault: () => void fetchDefault(),
        stashPop: (i) => void stashPop(i),
        stashApply: (i) => void stashApply(i),
        refreshAll,
        toggleRail: () => useViewStore.getState().toggleRail(layoutFor(window.innerWidth).railAuto),
        detachTab,
        closeTab,
      }),
    [running, repoPath, refs, recents, changes, tabCount, openDialog],
  );
  const items = useMemo(() => rankCommands(query, commands, recent), [query, commands, recent]);
  const cur = Math.min(active, Math.max(items.length - 1, 0));
  const optionId = (i: number) => `${listId}-${i}`;

  useEffect(() => {
    document.getElementById(optionId(cur))?.scrollIntoView?.({ block: "nearest" });
  });

  function run(index: number) {
    const c = items[index];
    if (!c || c.disabled) return;
    setOpen(false);
    markRun(c.id);
    c.run();
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") setActive(Math.min(cur + 1, items.length - 1));
    else if (e.key === "ArrowUp") setActive(Math.max(cur - 1, 0));
    else if (e.key === "Enter") run(cur);
    else if (e.key === "Escape") setOpen(false);
    else return;
    e.preventDefault();
  }

  let lastGroup: string | null = null;
  return createPortal(
    <div className={s.scrim} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className={s.panel} role="dialog" aria-label="Command palette">
        <div className={s.head}>
          <Search size={16} aria-hidden />
          <input
            autoFocus
            className={s.input}
            role="combobox"
            aria-label="Command palette"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={items.length ? optionId(cur) : undefined}
            aria-autocomplete="list"
            placeholder="Type a command, branch, or repository"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            spellCheck={false}
          />
          <Kbd>Esc</Kbd>
        </div>
        <div id={listId} role="listbox" aria-label="Commands" className={s.list}>
          {items.length === 0 && <div className={s.none}>No matching commands</div>}
          {items.map((c, i) => {
            const head = c.group !== lastGroup ? <div className={s.group}>{c.group}</div> : null;
            lastGroup = c.group;
            return (
              <div key={`${c.group}:${c.id}`}>
                {head}
                <div
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === cur}
                  aria-disabled={c.disabled ? true : undefined}
                  title={c.disabled}
                  className={cx(s.item, i === cur && s.active, c.disabled && s.disabled)}
                  onMouseMove={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => run(i)}
                >
                  <span className={s.icon}>{c.icon}</span>
                  <span className={s.label}>{c.label}</span>
                  {c.kbd && <Kbd>{c.kbd}</Kbd>}
                </div>
              </div>
            );
          })}
        </div>
        <div className={s.foot}>↑↓ navigate · ↵ run · Esc close</div>
      </div>
    </div>,
    document.body,
  );
}
