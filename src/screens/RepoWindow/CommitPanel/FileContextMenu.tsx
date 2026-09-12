import { Copy, ExternalLink, FolderOpen, GitMerge, Minus, Plus, Trash2, UserSearch } from "lucide-react";
import * as ipc from "../../../api/ipc";
import { toAppError } from "../../../api/ipc";
import type { StatusEntry } from "../../../api/types";
import { ContextMenu, MenuItem, MenuSeparator } from "../../../components/ui/Menu/Menu";
import { sideLabel, sideName } from "../../../lib/conflictSides";
import { useCommitStore, type ListId } from "../../../store/commitStore";
import { selectRunning, useOpsStore } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { toastError } from "../../../store/toastStore";
import { blameAt, copyText } from "../actions";
import { stageTarget } from "./stageTarget";

/** Where to put the menu, and the paths it was opened over — a snapshot: the list moves under it. */
export interface FileMenuState {
  at: { x: number; y: number };
  paths: string[];
  /** Opened over a folder row: its files are a group however few they are, like the row's own action. */
  folder?: boolean;
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

/** File-row actions: stage / unstage, discard, keep a conflict side, copy the path, open the file. */
export function FileContextMenu({ list, paths, entries, menu, onClose, act, discard }: FileContextMenuProps) {
  const running = useOpsStore(selectRunning);
  const busy = useCommitStore((st) => st.busy);
  const repoId = useRepoStore((st) => st.repo?.id ?? null);
  const head = useRepoStore((st) => st.refs?.head.oid ?? null);
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
  // Blame from here resolves the working-tree file to HEAD: the working-tree row renders this panel,
  // not `ChangedFileList`, so it has no Files tab of its own. A file that HEAD has never seen (or an
  // unborn HEAD) has nothing to blame against; a rename is blamed under the name HEAD knows.
  const newFile = !single || single.workdir === "untracked" || single.index === "added";
  const blameOid = newFile ? null : head;
  const blamePath = single?.oldPath ?? paths[0];
  // A lone file is the row's own Stage action, so it stages; more than one skips the conflicts. Over
  // a folder it is that row's action, word for word — a folder is a group whatever is under it.
  const { target, note } = stageTarget(list, entries, paths, menu.folder ? { bulk: true, where: "in this folder" } : { where: "you selected" });
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
        /* A dead item's title is hoverable, so the running operation — what actually killed it — comes first. */
        title={op.title ?? note}
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
      <MenuItem icon={<Copy size={16} aria-hidden />} onClick={run(() => copyText(paths.join("\n"), n === 1 ? "path" : `${n} paths`))}>
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
      {n === 1 && (
        <MenuItem
          icon={<UserSearch size={16} aria-hidden />}
          disabled={!blameOid}
          title={newFile ? "The file has never been committed" : head ? undefined : "Nothing is committed yet"}
          onClick={run(() => blameOid && void blameAt(blameOid, blamePath))}
        >
          Blame
        </MenuItem>
      )}
    </ContextMenu>
  );
}
