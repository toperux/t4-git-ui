import {
  Archive,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronDown,
  Cloud,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Terminal,
  X,
} from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import type { RevSpec, Stash } from "../../api/types";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { ThemeToggle } from "../../components/ui/ThemeToggle/ThemeToggle";
import { Input, Select } from "../../components/ui/Input/Input";
import { Menu, MenuItem, MenuSeparator } from "../../components/ui/Menu/Menu";
import { ToolbarButton, ToolbarSeparator } from "../../components/ui/ToolbarButton/ToolbarButton";
import tb from "../../components/ui/ToolbarButton/ToolbarButton.module.css";
import { useDialogStore, type DialogSpec } from "../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../store/opsStore";
import { useRecentsStore } from "../../store/recentsStore";
import { useMerging, useRepoStore } from "../../store/repoStore";
import { selectChangeCount, useStatusStore } from "../../store/statusStore";
import { closeRepo, fetchDefault, openCommitPanel, pickAndOpenRepo, refreshAll, stashApply, stashPop, switchRepo } from "./actions";
import s from "./Toolbar.module.css";

const SEARCH_DEBOUNCE_MS = 250;
const BUSY = "Operation in progress";
const NO_STASHES: Stash[] = [];

export function Toolbar() {
  const specKind = useRepoStore((st) => st.spec.kind);
  const startLog = useRepoStore((st) => st.startLog);
  const stashes = useRepoStore((st) => st.refs?.stashes ?? NO_STASHES);
  const head = useRepoStore((st) => st.refs?.local.find((b) => b.isHead) ?? null);
  const changes = useStatusStore(selectChangeCount);
  const merging = useMerging();
  const running = useOpsStore(selectRunning);
  const openDialog = useDialogStore((st) => st.open);
  const repo = useRepoStore((st) => st.repo);
  const recents = useRecentsStore((st) => st.recents);
  const [text, setText] = useState(() => useRepoStore.getState().filter.text ?? "");
  const [repoMenu, setRepoMenu] = useState(false);
  const [branchMenu, setBranchMenu] = useState(false);
  const [stashMenu, setStashMenu] = useState(false);
  const others = recents.filter((r) => r.path !== repo?.path);

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
  /** A dialog opened from a menu item: the item unmounts in the same commit, so name the menu's trigger. */
  const pickDialog = (spec: DialogSpec, close: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
    const trigger = (e.currentTarget.closest('[role="menu"]')?.previousElementSibling as HTMLElement | null) ?? null;
    close();
    openDialog(spec, { returnFocusTo: trigger });
  };

  return (
    <div className={s.toolbar} role="toolbar" aria-label="Repository">
      <Menu
        open={repoMenu}
        onClose={() => setRepoMenu(false)}
        label="Repository"
        align="left"
        anchor={
          <ToolbarButton
            icon={<FolderGit2 size={18} aria-hidden />}
            className={s.repo}
            title={repo?.path ?? "Repository"}
            aria-haspopup="menu"
            aria-expanded={repoMenu}
            onClick={() => setRepoMenu((o) => !o)}
          >
            <span className={s.repoName}>{repo?.name ?? "Repository"}</span>
          </ToolbarButton>
        }
      >
        <MenuItem icon={<GitCommitHorizontal size={16} aria-hidden />} onClick={pickDialog({ kind: "commit" }, () => setRepoMenu(false))}>
          Commit…
        </MenuItem>
        <MenuItem icon={<Cloud size={16} aria-hidden />} disabled={running} title={running ? BUSY : undefined} onClick={pickDialog({ kind: "addRemote" }, () => setRepoMenu(false))}>
          Add remote…
        </MenuItem>
        <MenuItem icon={<Terminal size={16} aria-hidden />} kbd="Ctrl+Shift+R" disabled={running} title={running ? BUSY : undefined} onClick={pickDialog({ kind: "runCommand" }, () => setRepoMenu(false))}>
          Run git command…
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<FolderOpen size={16} aria-hidden />} disabled={running} title={running ? BUSY : undefined} onClick={pick(() => void pickAndOpenRepo(), () => setRepoMenu(false))}>
          Open repository…
        </MenuItem>
        {others.length === 0 ? (
          <MenuItem disabled>No other recent repositories</MenuItem>
        ) : (
          others.map((r) => (
            <MenuItem key={r.path} icon={<FolderGit2 size={16} aria-hidden />} disabled={running} title={running ? BUSY : r.path} onClick={pick(() => switchRepo(r.path), () => setRepoMenu(false))}>
              {r.name}
            </MenuItem>
          ))
        )}
        <MenuSeparator />
        <MenuItem icon={<X size={16} aria-hidden />} kbd="Ctrl+Shift+W" disabled={running} title={running ? BUSY : undefined} onClick={pick(closeRepo, () => setRepoMenu(false))}>
          Close repository
        </MenuItem>
      </Menu>
      <ToolbarSeparator />
      <span className={tb.split}>
        <ToolbarButton
          icon={<ArrowDown size={18} aria-hidden />}
          className={tb.splitMain}
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
        count={head?.behind}
        disabled={running}
        title={opTitle("Pull", "Ctrl+Shift+L")}
        onClick={() => openDialog({ kind: "pull" })}
      >
        Pull
      </ToolbarButton>
      <ToolbarButton
        icon={<ArrowUp size={18} aria-hidden />}
        count={head?.ahead}
        disabled={running}
        title={opTitle("Push", "Ctrl+Shift+U")}
        onClick={() => openDialog({ kind: "push" })}
      >
        Push
      </ToolbarButton>
      <ToolbarSeparator />
      <Menu
        open={branchMenu}
        onClose={() => setBranchMenu(false)}
        label="Branch"
        align="left"
        anchor={
          <ToolbarButton
            icon={<GitBranch size={18} aria-hidden />}
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
        <MenuItem icon={<Plus size={16} aria-hidden />} kbd="Ctrl+B" onClick={pickDialog({ kind: "createBranch" }, () => setBranchMenu(false))}>
          Create branch…
        </MenuItem>
        <MenuItem icon={<GitBranch size={16} aria-hidden />} onClick={pickDialog({ kind: "checkout" }, () => setBranchMenu(false))}>
          Checkout…
        </MenuItem>
        <MenuItem icon={<GitMerge size={16} aria-hidden />} onClick={pickDialog({ kind: "merge" }, () => setBranchMenu(false))}>
          Merge…
        </MenuItem>
        <MenuItem icon={<GitMerge size={16} aria-hidden />} onClick={pickDialog({ kind: "rebase" }, () => setBranchMenu(false))}>
          Rebase…
        </MenuItem>
      </Menu>
      <Menu
        open={stashMenu}
        onClose={() => setStashMenu(false)}
        label="Stash"
        align="left"
        anchor={
          <ToolbarButton
            icon={<Archive size={18} aria-hidden />}
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
        <MenuItem icon={<Archive size={16} aria-hidden />} disabled={changes === 0} onClick={pickDialog({ kind: "stashPush" }, () => setStashMenu(false))}>
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
              onClick={pickDialog({ kind: "stash", index: st.index, message: st.message }, () => setStashMenu(false))}
            >
              {st.message}
            </MenuItem>
          ))
        )}
      </Menu>
      <ToolbarSeparator />
      <ToolbarButton
        icon={<GitCommitHorizontal size={18} aria-hidden />}
        count={changes}
        disabled={changes === 0 && !merging}
        title={changes === 0 ? (merging ? "Merge to commit" : "No changes") : `${changes} change${changes === 1 ? "" : "s"}`}
        onClick={openCommitPanel}
      >
        Commit
      </ToolbarButton>
      <div className={s.grow} />
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
      <ToolbarSeparator />
      <IconButton label="Refresh" title="Refresh (F5)" onClick={refreshAll}>
        <RefreshCw size={16} aria-hidden />
      </IconButton>
      <ThemeToggle />
      <IconButton label="Settings" onClick={() => openDialog({ kind: "settings" })}>
        <Settings size={16} aria-hidden />
      </IconButton>
    </div>
  );
}
