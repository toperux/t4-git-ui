import { Copy, ExternalLink, FolderOpen, GitMerge, Minus, Plus, Trash2 } from "lucide-react";
import * as ipc from "../../../api/ipc";
import { toAppError } from "../../../api/ipc";
import type { StatusEntry } from "../../../api/types";
import { ContextMenu, MenuItem, MenuSeparator } from "../../../components/ui/Menu/Menu";
import { sideLabel, sideName } from "../../../lib/conflictSides";
import { useCommitStore, type ListId } from "../../../store/commitStore";
import { selectRunning, useOpsStore } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { toastError } from "../../../store/toastStore";
import { copyText } from "../actions";

/** Where to put the menu, and the paths it was opened over — a snapshot: the list moves under it. */
export interface FileMenuState {
  at: { x: number; y: number };
  paths: string[];
}

export interface FileContextMenuProps {
  list: ListId;
  /** The selection as it was when the menu opened (the right-clicked row is always in it). */
  paths: string[];
  entries: StatusEntry[];
  menu: FileMenuState | null;
  onClose: () => void;
  act(paths: string[]): void;
  discard(paths: string[]): void;
}

/** What every partial stage says about the conflicted files it left behind: the header button, a folder row's action and this menu all word it the same. */
export const stageSkipNote = (skipped: number) => `Conflicted files are staged one by one, once resolved (${skipped} skipped)`;

/** File-row actions: stage / unstage, discard, keep a conflict side, copy the path, open the file. */
export function FileContextMenu({ list, paths, entries, menu, onClose, act, discard }: FileContextMenuProps) {
  const running = useOpsStore(selectRunning);
  const busy = useCommitStore((st) => st.busy);
  const repoId = useRepoStore((st) => st.repo?.id ?? null);
  const sides = useRepoStore((st) => st.refs?.conflictSides);
  const resolveConflict = useCommitStore((st) => st.resolveConflict);
  if (!menu || paths.length === 0) return null;

  const n = paths.length;
  const many = n > 1 ? ` ${n} files` : "";
  const entryOf = (path: string) => entries.find((e) => e.path === path);
  // Both sides are only meaningful while every selected file still has three stages.
  const conflicted = paths.every((p) => entryOf(p)?.conflicted);
  const single = n === 1 ? entryOf(paths[0]) : undefined;
  // Nothing on disk to hand the OS: a deletion staged or not.
  const gone = !single || single.workdir === "deleted" || single.index === "deleted";
  // Staging a conflicted file is "mark resolved" with the markers still in it — one file at a time,
  // on purpose: a lone file is the row's own Stage action, so it stages; more than one skips them,
  // like "Stage all".
  const target = list === "unstaged" && n > 1 ? paths.filter((p) => !entryOf(p)?.conflicted) : paths;
  const skipped = n - target.length;
  // A conflicted file has no single version to go back to — its two sides are the items below — so
  // Discard skips them however few there are, and is refused only when every file is conflicted.
  const discardTarget = paths.filter((p) => !entryOf(p)?.conflicted);
  const discardSkipped = n - discardTarget.length;

  /** Every item closes the menu first. */
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  // Everything that touches the repository is greyed while an operation runs, like the toolbar, and
  // while the commit store is mid-mutation (it would drop the call silently); copy / open only read.
  const op: { disabled?: boolean; title?: string } = running || busy ? { disabled: true, title: "Operation in progress" } : {};

  const open = (reveal: boolean) => {
    if (!repoId) return;
    void ipc.openPath(repoId, paths[0], reveal).catch((e: unknown) => toastError(toAppError(e), reveal ? "Couldn't reveal the file" : "Couldn't open the file"));
  };

  return (
    <ContextMenu at={menu.at} onClose={onClose} label="File actions">
      <MenuItem
        icon={list === "unstaged" ? <Plus size={16} aria-hidden /> : <Minus size={16} aria-hidden />}
        {...op}
        disabled={op.disabled || target.length === 0}
        title={skipped > 0 ? stageSkipNote(skipped) : op.title}
        onClick={run(() => act(target))}
      >
        {list === "unstaged" ? "Stage" : "Unstage"}
        {many}
      </MenuItem>
      {list === "unstaged" && (
        <MenuItem
          icon={<Trash2 size={16} aria-hidden />}
          danger
          kbd="Delete"
          {...op}
          disabled={op.disabled || discardTarget.length === 0}
          title={
            discardTarget.length === 0
              ? "A conflict is resolved by keeping a side, not discarded"
              : discardSkipped > 0
                ? `A conflict is resolved by keeping a side, not discarded (${discardSkipped} skipped)`
                : op.title
          }
          onClick={run(() => discard(discardTarget))}
        >
          Discard{many}…
        </MenuItem>
      )}
      {conflicted && (
        <MenuItem icon={<GitMerge size={16} aria-hidden />} {...op} onClick={run(() => void resolveConflict(paths, "ours", sideName(sides, "ours")))}>
          {sideLabel(sides, "ours")}
        </MenuItem>
      )}
      {conflicted && (
        <MenuItem icon={<GitMerge size={16} aria-hidden />} {...op} onClick={run(() => void resolveConflict(paths, "theirs", sideName(sides, "theirs")))}>
          {sideLabel(sides, "theirs")}
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon={<Copy size={16} aria-hidden />} onClick={run(() => copyText(paths.join("\n"), "path"))}>
        Copy path
      </MenuItem>
      {n === 1 && (
        <MenuItem icon={<ExternalLink size={16} aria-hidden />} disabled={gone} title={gone ? "The file is not in the working tree" : undefined} onClick={run(() => open(false))}>
          Open
        </MenuItem>
      )}
      {n === 1 && (
        <MenuItem icon={<FolderOpen size={16} aria-hidden />} disabled={gone} title={gone ? "The file is not in the working tree" : undefined} onClick={run(() => open(true))}>
          Reveal in folder
        </MenuItem>
      )}
    </ContextMenu>
  );
}
