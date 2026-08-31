import { Archive, ArrowDown, ArrowDownUp, ArrowUp, GitBranch, GitCommitHorizontal, RefreshCw, Search, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import type { RevSpec } from "../../api/types";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { Input, Select } from "../../components/ui/Input/Input";
import { ToolbarButton, ToolbarSeparator } from "../../components/ui/ToolbarButton/ToolbarButton";
import { useRepoStore } from "../../store/repoStore";
import s from "./Toolbar.module.css";

const SEARCH_DEBOUNCE_MS = 250;
const M4 = "Coming in M4";
const M5 = "Coming in M5";

export function Toolbar() {
  const specKind = useRepoStore((st) => st.spec.kind);
  const startLog = useRepoStore((st) => st.startLog);
  const refreshRefs = useRepoStore((st) => st.refreshRefs);
  const [text, setText] = useState(() => useRepoStore.getState().filter.text ?? "");

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

  function onRefresh() {
    const st = useRepoStore.getState();
    void refreshRefs();
    void startLog(st.spec, st.filter);
  }

  return (
    <div className={s.toolbar} role="toolbar" aria-label="Repository">
      <ToolbarButton icon={<ArrowDown size={18} aria-hidden />} disabled title={M4}>
        Fetch
      </ToolbarButton>
      <ToolbarButton icon={<ArrowDownUp size={18} aria-hidden />} disabled title={M4}>
        Pull
      </ToolbarButton>
      <ToolbarButton icon={<ArrowUp size={18} aria-hidden />} disabled title={M4}>
        Push
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton icon={<GitBranch size={18} aria-hidden />} disabled title={M4}>
        Branch
      </ToolbarButton>
      <ToolbarButton icon={<Archive size={18} aria-hidden />} disabled title={M4}>
        Stash
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton icon={<GitCommitHorizontal size={18} aria-hidden />} disabled title={M4}>
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
      <IconButton label="Refresh" onClick={onRefresh}>
        <RefreshCw size={16} aria-hidden />
      </IconButton>
      <IconButton label="Settings" title={M5} disabled>
        <Settings size={16} aria-hidden />
      </IconButton>
    </div>
  );
}
