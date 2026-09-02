import { Copy, ExternalLink, FolderOpen, Minus, Plus, Trash2 } from "lucide-react";
import * as ipc from "../../../api/ipc";
import { toAppError } from "../../../api/ipc";
import type { ConflictSides, StatusEntry } from "../../../api/types";
import { ContextMenu, MenuItem, MenuSeparator } from "../../../components/ui/Menu/Menu";
import { useCommitStore, type ListId } from "../../../store/commitStore";
import { selectRunning, useOpsStore } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { toastError } from "../../../store/toastStore";
import { copyText } from "../actions";

/** The right-clicked row: where to put the menu, and which file it came from. */
export interface FileMenuState {
  at: { x: number; y: number };
  el: HTMLElement;
  path: string;
}

/** Without a merge in progress the backend names no sides; git's own words do. */
const GENERIC_SIDES: ConflictSides = { ours: "our", theirs: "their" };

export interface FileContextMenuProps {
  list: ListId;
  /** The selection the items act on (the right-clicked row is always in it). */
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
  const repoId = useRepoStore((st) => st.repo?.id ?? null);
  const sides = useRepoStore((st) => st.refs?.conflictSides) ?? GENERIC_SIDES;
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

  /** Every item closes the menu first. */
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  // Everything that touches the repository is greyed while an operation runs, like the toolbar;
  // copy / open only read.
  const op = running ? { disabled: true, title: "Operation in progress" } : {};

  const open = (reveal: boolean) => {
    if (!repoId) return;
    void ipc.openPath(repoId, paths[0], reveal).catch((e: unknown) => toastError(toAppError(e), reveal ? "Couldn't reveal the file" : "Couldn't open the file"));
  };

  return (
    <ContextMenu at={menu.at} onClose={onClose} label="File actions">
      <MenuItem icon={list === "unstaged" ? <Plus size={16} aria-hidden /> : <Minus size={16} aria-hidden />} {...op} onClick={run(() => act(paths))}>
        {list === "unstaged" ? "Stage" : "Unstage"}
        {many}
      </MenuItem>
      {list === "unstaged" && (
        <MenuItem icon={<Trash2 size={16} aria-hidden />} danger kbd="Delete" {...op} onClick={run(() => discard(paths))}>
          Discard{many}…
        </MenuItem>
      )}
      {conflicted && (
        <MenuItem {...op} onClick={run(() => void resolveConflict(paths, "ours", sides.ours))}>
          Keep {sides.ours}&apos;s version
        </MenuItem>
      )}
      {conflicted && (
        <MenuItem {...op} onClick={run(() => void resolveConflict(paths, "theirs", sides.theirs))}>
          Keep {sides.theirs}&apos;s version
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
