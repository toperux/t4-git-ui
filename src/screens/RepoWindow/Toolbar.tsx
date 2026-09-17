import {
  Archive,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronDown,
  Cloud,
  Command,
  Ellipsis,
  ExternalLink,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  History,
  Moon,
  PanelLeft,
  Plus,
  Power,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Terminal,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { RevSpec, Stash } from "../../api/types";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { ThemeToggle } from "../../components/ui/ThemeToggle/ThemeToggle";
import { Input, Select } from "../../components/ui/Input/Input";
import { Menu, MenuItem, MenuSeparator } from "../../components/ui/Menu/Menu";
import { ToolbarButton, ToolbarSeparator } from "../../components/ui/ToolbarButton/ToolbarButton";
import { UpdateBadge } from "../../components/ui/UpdateBadge/UpdateBadge";
import tb from "../../components/ui/ToolbarButton/ToolbarButton.module.css";
import { useDialogStore, type DialogSpec } from "../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../store/opsStore";
import { cx } from "../../lib/cx";
import { baseName } from "../../lib/paths";
import { useRecentsStore, type RecentRepo } from "../../store/recentsStore";
import { useRepoStore } from "../../store/repoStore";
import { selectChangeCount, useStatusStore } from "../../store/statusStore";
import { useTabsStore } from "../../store/tabsStore";
import { useViewStore } from "../../store/viewStore";
import { toggleTheme, useTheme } from "../../theme/theme";
import { closeTab, detachTab, fetchDefault, pickAndOpenRepo, quitApp, refreshAll, stashApply, stashPop, switchRepo } from "./actions";
import { usePaletteStore } from "./CommandPalette/paletteStore";
import { HISTORY_CHIP_W, useLayout, useToolbarTier } from "./layout";
import { SearchPopover } from "./SearchPopover";
import { useTabDrag } from "./useTabDrag";
import { ViewSwitch } from "./ViewSwitch";
import s from "./Toolbar.module.css";

const SEARCH_DEBOUNCE_MS = 250;
const BUSY = "Operation in progress";
const NO_STASHES: Stash[] = [];
/** Recents listed in the menu itself; the rest go in the "More recent" submenu. */
const INLINE_RECENTS = 5;

export function Toolbar() {
  const layout = useLayout();
  // Two things in this row vary in width and decide where the tiers fall: the repo name (measured
  // below, not guessed at) and the file-history chip, which the search box is too small to absorb —
  // see layout.ts. The hook re-renders this only when the tier itself moves.
  const [nameWidth, setNameWidth] = useState(0);
  const view = useViewStore((st) => st.view);
  const historyPath = useRepoStore((st) => st.filter.path ?? null);
  const tier = useToolbarTier(nameWidth, view === "history" && historyPath ? HISTORY_CHIP_W : 0);
  // The sidebar toggle lives here so it is in one place whichever state the sidebar is in.
  const railOverride = useViewStore((st) => st.railOverride);
  const toggleRail = useViewStore((st) => st.toggleRail);
  const rail = railOverride ?? layout.railAuto;
  const theme = useTheme();
  const specKind = useRepoStore((st) => st.spec.kind);
  const startLog = useRepoStore((st) => st.startLog);
  const stashes = useRepoStore((st) => st.refs?.stashes ?? NO_STASHES);
  const head = useRepoStore((st) => st.refs?.local.find((b) => b.isHead) ?? null);
  const changes = useStatusStore(selectChangeCount);
  const running = useOpsStore(selectRunning);
  const openDialog = useDialogStore((st) => st.open);
  const repo = useRepoStore((st) => st.repo);
  const recents = useRecentsStore((st) => st.recents);
  const tabCount = useTabsStore((st) => st.tabs.length);
  const activeTab = useTabsStore((st) => st.tabs.find((t) => t.id === st.active) ?? null);
  const [text, setText] = useState(() => useRepoStore.getState().filter.text ?? "");
  const [repoMenu, setRepoMenu] = useState(false);
  const [branchMenu, setBranchMenu] = useState(false);
  const [stashMenu, setStashMenu] = useState(false);
  const [more, setMore] = useState(false);
  const repoBtn = useRef<HTMLButtonElement>(null);
  const branchBtn = useRef<HTMLButtonElement>(null);
  const stashBtn = useRef<HTMLButtonElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const repoNameEl = useRef<HTMLSpanElement>(null);
  // A rename is the one thing that moves the breakpoints, and the tier itself brings the name back
  // into view, so both belong in the deps.
  useLayoutEffect(() => {
    const w = repoNameEl.current?.getBoundingClientRect().width ?? 0;
    // ponytail: keep the last width the name actually had. The `icons` tier hides this span, and
    // taking the 0 would drop the floor, re-show the name, raise it again — a flap. The cost is that
    // a rename while in `icons` measures late, when the name is next on screen.
    if (w > 0) setNameWidth(w);
  }, [repo?.name, tier]);
  const others = recents.filter((r) => r.path !== repo?.path);
  // The strip is hidden with a single tab, so this button is the only handle that tab has: the same
  // pointer-capture drag, minus the reorder phase (there is no strip to reorder inside).
  const tabDrag = useTabDrag({ surface: repoBtn });

  // The toolbar outlives a repository switch; the store's filter does not (`openRepo` resets it).
  // The field also follows a filter cleared from elsewhere (`openCommitPanel`).
  const repoId = repo?.id;
  const filterText = useRepoStore((st) => st.filter.text ?? "");
  useEffect(() => {
    setText(useRepoStore.getState().filter.text ?? "");
  }, [repoId, filterText]);

  // Debounced text filter → new walk (only when the effective filter changed).
  useEffect(() => {
    const t = setTimeout(() => {
      const st = useRepoStore.getState();
      const next = text.trim() ? text : null;
      if ((st.filter.text?.trim() || null) !== (next?.trim() || null)) {
        void startLog(st.spec, { ...st.filter, text: next });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text, startLog]);

  function onSpecChange(kind: string) {
    const spec: RevSpec = kind === "head" ? { kind: "head" } : { kind: "all" };
    void startLog(spec, useRepoStore.getState().filter);
  }

  const opTitle = (label: string, shortcut?: string) => (running ? BUSY : shortcut ? `${label} (${shortcut})` : label);
  const pick = (open: () => void, close: () => void) => () => {
    close();
    open();
  };
  /**
   * A dialog opened from a menu item: the item unmounts in the same commit, so name the menu's
   * trigger — the ref itself, since an op starting while the dialog is open remounts that button
   * inside a `DisabledHint` and a node captured here would be detached by the time it closes.
   */
  const pickDialog = (spec: DialogSpec, close: () => void, trigger: RefObject<HTMLButtonElement | null>) => () => {
    close();
    openDialog(spec, { returnFocusTo: trigger });
  };
  /** Store order is already pinned first, then most recently opened; the same row either way. */
  const recentItem = (r: RecentRepo) => (
    <MenuItem key={r.path} icon={<FolderGit2 size={16} aria-hidden />} disabled={running} title={running ? BUSY : r.path} onClick={pick(() => switchRepo(r.path), () => setRepoMenu(false))}>
      {r.name}
    </MenuItem>
  );
  /** The same four rows, whether they hang off the Branch button or the overflow's submenu. */
  const branchItems = (close: () => void, trigger: RefObject<HTMLButtonElement | null>) => (
    <>
      <MenuItem icon={<Plus size={16} aria-hidden />} kbd="Ctrl+B" onClick={pickDialog({ kind: "createBranch" }, close, trigger)}>
        Create branch…
      </MenuItem>
      <MenuItem icon={<GitBranch size={16} aria-hidden />} onClick={pickDialog({ kind: "checkout" }, close, trigger)}>
        Checkout…
      </MenuItem>
      <MenuItem icon={<GitMerge size={16} aria-hidden />} onClick={pickDialog({ kind: "merge" }, close, trigger)}>
        Merge…
      </MenuItem>
      <MenuItem icon={<GitMerge size={16} aria-hidden />} onClick={pickDialog({ kind: "rebase" }, close, trigger)}>
        Rebase…
      </MenuItem>
    </>
  );
  /* File history (§3): its own filter, so `×` clears it and leaves the search text alone. */
  const historyChip = historyPath ? (
    <span className={s.history} title={historyPath}>
      <History size={13} aria-hidden />
      <span className={s.historyPath}>History: {baseName(historyPath)}</span>
      <IconButton
        className={s.historyClear}
        label="Clear the file history filter"
        onClick={() => {
          const st = useRepoStore.getState();
          void startLog(st.spec, { ...st.filter, path: null });
        }}
      >
        <X size={13} aria-hidden />
      </IconButton>
    </span>
  ) : null;

  return (
    <div className={cx(s.toolbar, tier === "tight" && s.tight, tier === "icons" && s.icons)} role="toolbar" aria-label="Repository">
      {/* Pressed while the sidebar shows. The only collapse/expand control there is: the sidebar
          scrolls and the rail is narrow, so neither of them can hold one that stays put. */}
      <IconButton label="Toggle sidebar" title="Toggle sidebar (Ctrl+Shift+`)" on={!rail} onClick={() => toggleRail(layout.railAuto)}>
        <PanelLeft size={16} aria-hidden />
      </IconButton>
      <ToolbarSeparator />
      <Menu
        open={repoMenu}
        onClose={() => setRepoMenu(false)}
        label="Repository"
        align="left"
        anchor={
          <ToolbarButton
            ref={repoBtn}
            icon={<FolderGit2 size={18} aria-hidden />}
            className={s.repo}
            title={`${repo?.path ?? "Repository"} — drag to move this tab to another window`}
            // The `icons` tier hides the name, so the button carries it itself.
            aria-label={repo?.name ?? "Repository"}
            aria-haspopup="menu"
            aria-expanded={repoMenu}
            onPointerDown={(e) => {
              if (activeTab) tabDrag.begin(e, activeTab);
            }}
            {...tabDrag.handlers}
            // A press that became a drag ends on this button too; only a real click opens the menu.
            onClick={() => {
              if (!tabDrag.dragged()) setRepoMenu((o) => !o);
            }}
          >
            <span className={s.repoName} ref={repoNameEl}>
              {repo?.name ?? "Repository"}
            </span>
          </ToolbarButton>
        }
      >
        <MenuItem icon={<GitCommitHorizontal size={16} aria-hidden />} onClick={pickDialog({ kind: "commit" }, () => setRepoMenu(false), repoBtn)}>
          Commit…
        </MenuItem>
        <MenuItem icon={<Cloud size={16} aria-hidden />} disabled={running} title={running ? BUSY : undefined} onClick={pickDialog({ kind: "addRemote" }, () => setRepoMenu(false), repoBtn)}>
          Add remote…
        </MenuItem>
        <MenuItem icon={<FolderGit2 size={16} aria-hidden />} disabled={running} title={running ? BUSY : undefined} onClick={pickDialog({ kind: "addWorktree" }, () => setRepoMenu(false), repoBtn)}>
          Add worktree…
        </MenuItem>
        <MenuItem icon={<Terminal size={16} aria-hidden />} kbd="Ctrl+Shift+R" disabled={running} title={running ? BUSY : undefined} onClick={pickDialog({ kind: "runCommand" }, () => setRepoMenu(false), repoBtn)}>
          Run git command…
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<FolderOpen size={16} aria-hidden />} disabled={running} title={running ? BUSY : undefined} onClick={pick(() => void pickAndOpenRepo(), () => setRepoMenu(false))}>
          Open repository…
        </MenuItem>
        {others.length === 0 ? <MenuItem disabled>No other recent repositories</MenuItem> : others.slice(0, INLINE_RECENTS).map(recentItem)}
        {others.length > INLINE_RECENTS && (
          <MenuItem icon={<FolderGit2 size={16} aria-hidden />} submenu={others.slice(INLINE_RECENTS).map(recentItem)}>
            More recent
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem
          icon={<ExternalLink size={16} aria-hidden />}
          kbd="Ctrl+Shift+N"
          // The last tab is already in a window of its own; moving it out has nowhere to go.
          disabled={running || tabCount < 2}
          title={running ? BUSY : tabCount < 2 ? "This tab is the only one in this window" : undefined}
          onClick={pick(detachTab, () => setRepoMenu(false))}
        >
          Move to new window
        </MenuItem>
        <MenuItem icon={<X size={16} aria-hidden />} kbd="Ctrl+W" disabled={running} title={running ? BUSY : undefined} onClick={pick(closeTab, () => setRepoMenu(false))}>
          Close tab
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Power size={16} aria-hidden />} kbd="Ctrl+Q" onClick={pick(quitApp, () => setRepoMenu(false))}>
          Quit
        </MenuItem>
      </Menu>
      {tabDrag.ghost}
      <ToolbarSeparator />
      <span className={tb.split}>
        <ToolbarButton
          icon={<ArrowDown size={18} aria-hidden />}
          className={cx(tb.splitMain, s.op)}
          disabled={running}
          title={opTitle("Fetch from the default remote", "Ctrl+F5")}
          onClick={() => void fetchDefault()}
        >
          Fetch
        </ToolbarButton>
        <ToolbarButton
          icon={<ChevronDown size={16} aria-hidden />}
          className={tb.splitMore}
          disabled={running}
          aria-label="Fetch options"
          title={opTitle("Fetch from a chosen remote, with options")}
          onClick={() => openDialog({ kind: "fetch" })}
        />
      </span>
      <ToolbarButton
        icon={<ArrowDownUp size={18} aria-hidden />}
        className={s.op}
        count={head?.behind}
        disabled={running}
        title={opTitle("Pull", "Ctrl+Shift+L")}
        onClick={() => openDialog({ kind: "pull" })}
      >
        Pull
      </ToolbarButton>
      <ToolbarButton
        icon={<ArrowUp size={18} aria-hidden />}
        className={s.op}
        count={head?.ahead}
        disabled={running}
        title={opTitle("Push", "Ctrl+Shift+U")}
        onClick={() => openDialog({ kind: "push" })}
      >
        Push
      </ToolbarButton>
      <ToolbarSeparator />
      {tier !== "icons" && (
        <Menu
          open={branchMenu}
          onClose={() => setBranchMenu(false)}
          label="Branch"
          align="left"
          anchor={
            <ToolbarButton
              ref={branchBtn}
              icon={<GitBranch size={18} aria-hidden />}
              className={s.op}
              disabled={running}
              title={opTitle("Branch operations")}
              aria-haspopup="menu"
              aria-expanded={branchMenu}
              onClick={() => setBranchMenu((o) => !o)}
            >
              Branch
            </ToolbarButton>
          }
        >
          {branchItems(() => setBranchMenu(false), branchBtn)}
        </Menu>
      )}
      {tier !== "icons" && (
        <Menu
          open={stashMenu}
          onClose={() => setStashMenu(false)}
          label="Stash"
          align="left"
          anchor={
            <ToolbarButton
              ref={stashBtn}
              icon={<Archive size={18} aria-hidden />}
              className={s.op}
              count={stashes.length}
              disabled={running}
              title={opTitle("Stash operations")}
              aria-haspopup="menu"
              aria-expanded={stashMenu}
              onClick={() => setStashMenu((o) => !o)}
            >
              Stash
            </ToolbarButton>
          }
        >
          <MenuItem icon={<Archive size={16} aria-hidden />} kbd="Ctrl+Shift+S" onClick={pickDialog({ kind: "stashes" }, () => setStashMenu(false), stashBtn)}>
            Manage stashes…
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Archive size={16} aria-hidden />} disabled={changes === 0} onClick={pickDialog({ kind: "stashPush" }, () => setStashMenu(false), stashBtn)}>
            Stash changes…
          </MenuItem>
          <MenuItem disabled={stashes.length === 0} onClick={pick(() => void stashPop(0), () => setStashMenu(false))}>
            Pop latest
          </MenuItem>
          <MenuItem disabled={stashes.length === 0} onClick={pick(() => void stashApply(0), () => setStashMenu(false))}>
            Apply latest
          </MenuItem>
          <MenuSeparator />
          {stashes.length === 0 ? (
            <MenuItem disabled>No stashes</MenuItem>
          ) : (
            stashes.map((st) => (
              <MenuItem
                key={st.index}
                title={`stash@{${st.index}}: ${st.message}`}
                onClick={pickDialog({ kind: "stash", index: st.index, message: st.message }, () => setStashMenu(false), stashBtn)}
              >
                {st.message}
              </MenuItem>
            ))
          )}
        </Menu>
      )}
      <ToolbarSeparator />
      <ViewSwitch compact={tier === "icons"} />
      <div className={s.grow} />
      {view === "history" &&
        (tier === "icons" ? (
          <SearchPopover text={text} onText={setText} spec={specKind === "head" ? "head" : "all"} onSpec={onSpecChange}>
            {historyChip}
          </SearchPopover>
        ) : (
          <>
            {historyChip}
            <Input
              className={s.search}
              icon={<Search size={14} aria-hidden />}
              type="search"
              placeholder="Search commits"
              aria-label="Search commits"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
            <Select className={s.filter} aria-label="Branch filter" value={specKind === "head" ? "head" : "all"} onChange={(e) => onSpecChange(e.target.value)}>
              <option value="all">All branches</option>
              <option value="head">HEAD</option>
            </Select>
          </>
        ))}
      <ToolbarSeparator />
      <IconButton label="Command palette" title="Command palette (Ctrl+K)" onClick={() => usePaletteStore.getState().setOpen(true)}>
        <Command size={16} aria-hidden />
      </IconButton>
      {tier !== "icons" ? (
        <>
          <IconButton label="Refresh" title="Refresh (F5)" onClick={refreshAll}>
            <RefreshCw size={16} aria-hidden />
          </IconButton>
          <ThemeToggle />
          <UpdateBadge onClick={() => openDialog({ kind: "settings" })} />
          <IconButton label="Settings" title="Settings (Ctrl+,)" onClick={() => openDialog({ kind: "settings" })}>
            <Settings size={16} aria-hidden />
          </IconButton>
        </>
      ) : (
        <>
          <UpdateBadge onClick={() => openDialog({ kind: "settings" })} />
          <Menu
            open={more}
            onClose={() => setMore(false)}
            label="More"
            anchor={
              <IconButton ref={moreBtn} label="More" on={more} aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((o) => !o)}>
                <Ellipsis size={16} aria-hidden />
              </IconButton>
            }
          >
            <MenuItem icon={<GitBranch size={16} aria-hidden />} disabled={running} title={running ? BUSY : undefined} submenu={branchItems(() => setMore(false), moreBtn)}>
              Branch
            </MenuItem>
            <MenuItem icon={<Archive size={16} aria-hidden />} kbd="Ctrl+Shift+S" onClick={pickDialog({ kind: "stashes" }, () => setMore(false), moreBtn)}>
              Stash…
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<RefreshCw size={16} aria-hidden />} kbd="F5" onClick={pick(refreshAll, () => setMore(false))}>
              Refresh
            </MenuItem>
            <MenuItem icon={theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />} onClick={pick(toggleTheme, () => setMore(false))}>
              {theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            </MenuItem>
            <MenuItem icon={<Settings size={16} aria-hidden />} kbd="Ctrl+," onClick={pickDialog({ kind: "settings" }, () => setMore(false), moreBtn)}>
              Settings
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Command size={16} aria-hidden />} kbd="Ctrl+K" onClick={pick(() => usePaletteStore.getState().setOpen(true), () => setMore(false))}>
              Command palette
            </MenuItem>
          </Menu>
        </>
      )}
    </div>
  );
}
