import { Archive, ArrowDown, ArrowDownUp, ArrowUp, GitBranch, GitCommitHorizontal, GitMerge, Plus, RefreshCw, Search, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import type { RevSpec, Stash } from "../../api/types";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { Input, Select } from "../../components/ui/Input/Input";
import { Menu, MenuItem, MenuSeparator } from "../../components/ui/Menu/Menu";
import { ToolbarButton, ToolbarSeparator } from "../../components/ui/ToolbarButton/ToolbarButton";
import { useDialogStore } from "../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { selectChangeCount, useStatusStore } from "../../store/statusStore";
import { fetchDefault, refreshAll, stashApply, stashPop } from "./actions";
import s from "./Toolbar.module.css";

const SEARCH_DEBOUNCE_MS = 250;
const M5 = "Coming in M5";
const BUSY = "Operation in progress";
const NO_STASHES: Stash[] = [];

export function Toolbar() {
  const specKind = useRepoStore((st) => st.spec.kind);
  const startLog = useRepoStore((st) => st.startLog);
  const selectWorkingTree = useRepoStore((st) => st.selectWorkingTree);
  const stashes = useRepoStore((st) => st.refs?.stashes ?? NO_STASHES);
  const head = useRepoStore((st) => st.refs?.local.find((b) => b.isHead) ?? null);
  const changes = useStatusStore(selectChangeCount);
  const running = useOpsStore(selectRunning);
  const openDialog = useDialogStore((st) => st.open);
  const [text, setText] = useState(() => useRepoStore.getState().filter.text ?? "");
  const [branchMenu, setBranchMenu] = useState(false);
  const [stashMenu, setStashMenu] = useState(false);

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

  return (
    <div className={s.toolbar} role="toolbar" aria-label="Repository">
      <ToolbarButton icon={<ArrowDown size={18} aria-hidden />} disabled={running} title={opTitle("Fetch from the default remote")} onClick={() => void fetchDefault()}>
        Fetch
      </ToolbarButton>
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
        <MenuItem icon={<Plus size={16} aria-hidden />} kbd="Ctrl+B" onClick={pick(() => openDialog({ kind: "createBranch" }), () => setBranchMenu(false))}>
          Create branch…
        </MenuItem>
        <MenuItem icon={<GitBranch size={16} aria-hidden />} onClick={pick(() => openDialog({ kind: "checkout" }), () => setBranchMenu(false))}>
          Checkout…
        </MenuItem>
        <MenuItem icon={<GitMerge size={16} aria-hidden />} onClick={pick(() => openDialog({ kind: "merge" }), () => setBranchMenu(false))}>
          Merge…
        </MenuItem>
        <MenuItem icon={<GitMerge size={16} aria-hidden />} onClick={pick(() => openDialog({ kind: "rebase" }), () => setBranchMenu(false))}>
          Rebase…
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<ArrowDown size={16} aria-hidden />} onClick={pick(() => openDialog({ kind: "fetch" }), () => setBranchMenu(false))}>
          Fetch…
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
        <MenuItem icon={<Archive size={16} aria-hidden />} disabled={changes === 0} onClick={pick(() => openDialog({ kind: "stashPush" }), () => setStashMenu(false))}>
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
              onClick={pick(() => openDialog({ kind: "stash", index: st.index, message: st.message }), () => setStashMenu(false))}
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
        disabled={changes === 0}
        title={changes === 0 ? "No changes" : `${changes} change${changes === 1 ? "" : "s"}`}
        onClick={() => selectWorkingTree()}
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
      <IconButton label="Settings" title={M5} disabled>
        <Settings size={16} aria-hidden />
      </IconButton>
    </div>
  );
}
