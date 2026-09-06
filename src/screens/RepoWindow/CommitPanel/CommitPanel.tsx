import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import * as ipc from "../../../api/ipc";
import { toAppError } from "../../../api/ipc";
import type { FileDiff } from "../../../api/types";
import { sideName } from "../../../lib/conflictSides";
import { useCommitStore } from "../../../store/commitStore";
import { useDialogStore } from "../../../store/dialogStore";
import { useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { toastError, useToastStore } from "../../../store/toastStore";
import { openInDiffTool } from "../actions";
import { DiffViewer, type DiffActions } from "../DiffViewer/DiffViewer";
import w from "../RepoWindow.module.css";
import s from "./CommitPanel.module.css";
import { FilesColumn } from "./FilesColumn";
import { MessageColumn } from "./MessageColumn";

/**
 * Feeds every status refresh into the commit store (selection pruning, diff reload) while `on`.
 * Mounted once, in `RepoWindow`, above the panel and the commit dialog: each mounted list registers
 * its display order in its own effect, and this one must run after those (child effects first).
 */
export function useCommitSync(on: boolean) {
  const status = useStatusStore((st) => st.status);
  const sync = useCommitStore((st) => st.syncWithStatus);
  useEffect(() => {
    if (on) sync(status);
  }, [on, status, sync]);
}

/** Bottom pane while the working-tree row is selected: Unstaged/Staged 320 | Diff | Message 340 (Commit.mjs). */
export function CommitPanel() {
  const open = useDialogStore((st) => st.open);
  return (
    <Group orientation="horizontal" className={s.pane}>
      <Panel defaultSize={320} minSize={220} maxSize={560} className={w.panel}>
        <FilesColumn />
      </Panel>
      <Separator className={w.splitH} aria-label="Resize file lists" />
      <Panel minSize={200} className={w.panel}>
        <DiffColumn />
      </Panel>
      <Separator className={w.splitH} aria-label="Resize commit message" />
      <Panel defaultSize={340} minSize={260} maxSize={560} className={w.panel}>
        <MessageColumn onExpand={(opener) => open({ kind: "commit" }, { returnFocusTo: opener })} />
      </Panel>
    </Group>
  );
}

/** `DiffViewer` in actions mode for the focused working-tree file. */
export function DiffColumn() {
  const diff = useCommitStore((st) => st.diff);
  const path = useCommitStore((st) => st.diffPath);
  const list = useCommitStore((st) => st.diffList);
  const loading = useCommitStore((st) => st.diffLoading);
  const error = useCommitStore((st) => st.diffError);
  const busy = useCommitStore((st) => st.busy);
  const stats = useCommitStore((st) => (st.diffPath ? st.stats[st.diffList][st.diffPath] : undefined));
  const stageHunk = useCommitStore((st) => st.stageHunk);
  const stageLines = useCommitStore((st) => st.stageLines);
  const discardHunk = useCommitStore((st) => st.discardHunk);
  const discardLines = useCommitStore((st) => st.discardLines);
  const resolveConflict = useCommitStore((st) => st.resolveConflict);
  const entry = useStatusStore((st) => st.status?.entries.find((e) => e.path === path));

  const state = useRepoStore((st) => st.refs?.state);
  const sides = useRepoStore((st) => st.refs?.conflictSides);

  // Conflicted and untracked files can only be staged whole — no hunk or line indices to work with.
  const conflicted = list === "unstaged" && !!entry?.conflicted;
  const untracked = list === "unstaged" && entry?.workdir === "untracked";
  // Nor these: a truncated diff's last hunk is cut mid-hunk and the backend rebuilds it untruncated,
  // so the indices name something else; a typechange patch git refuses outright (blob ↔ symlink).
  const wholeOnly = !!diff && (diff.truncated || diff.status === "typechange" || entry?.workdir === "typechange" || entry?.index === "typechange");
  // Staging an unresolved file marks it resolved and drops its three index stages — git's own
  // behaviour, and no unstage brings them back. The markers are still in the file, so say so and
  // offer the one command that undoes it. Only mid-merge: a marker in a file is otherwise just text.
  const merging = state === "merge" || state === "rebase";
  const stranded = merging && !conflicted && !!diff && hasMarkers(diff);
  // Discard rewrites the working file: only a plain unstaged diff has one to rewrite (the staged
  // list edits the index, and untracked / conflicted files are whole-file anyway).
  const canDiscard = list === "unstaged" && !conflicted && !untracked;
  const actions: DiffActions | undefined = path
    ? {
        target: list,
        wholeFile: conflicted || untracked || wholeOnly,
        note: conflicted
          ? // The diff is "ours" against the file on disk: no hunks means the working copy is back to
            // ours — resolved outside the app (an editor, rerere) — and the body has nothing to show.
            diff?.path === path && diff.hunks.length === 0
            ? "No conflict markers left — stage the file to mark it resolved"
            : "Conflict — stage the file once resolved"
          : stranded
            ? "Marked resolved, but the conflict markers are still here"
            : untracked
              ? "Untracked — stage whole file"
              : undefined,
        busy,
        onResolve: conflicted ? () => void resolveInEditor(path) : undefined,
        sides: conflicted ? sides : undefined,
        onKeepSide: conflicted ? (side) => void resolveConflict([path], side, sideName(sides, side)) : undefined,
        onRestoreConflict: stranded && path ? () => void restoreConflict(path) : undefined,
        onStageHunk: (h) => void stageHunk(h),
        onStageLines: (l) => void stageLines(l),
        onDiscardHunk: canDiscard ? (h) => void discardHunk(h) : undefined,
        onDiscardLines: canDiscard ? (l) => void discardLines(l) : undefined,
      }
    : undefined;

  // The merge tool is a conflict's route, and an untracked file has nothing on the other side.
  const external = path && !conflicted && !untracked ? () => void openInDiffTool({ kind: list }, path, entry?.oldPath ?? null) : undefined;

  return (
    <DiffViewer
      path={path}
      oldPath={entry?.oldPath ?? null}
      stats={stats ?? null}
      diff={diff}
      loading={loading}
      error={error}
      actions={actions}
      onOpenExternal={external}
    />
  );
}

/** A `<<<<<<<` at the start of a line the diff carries: git's own conflict marker, seven of them. */
const hasMarkers = (diff: FileDiff) => diff.hunks.some((h) => h.lines.some((l) => l.text.startsWith("<<<<<<<")));

/**
 * Puts the file back the way the merge left it. This overwrites the working file — that is the
 * point, and it is why it asks first: whatever is in there now is a half-staged conflict.
 */
async function restoreConflict(path: string) {
  const repo = useRepoStore.getState().repo;
  if (!repo) return;
  const ok = await ask(`Bring back the conflict in ${path}?`, {
    title: "Restore conflict",
    kind: "warning",
    okLabel: "Restore",
    cancelLabel: "Cancel",
  });
  if (!ok) return;
  try {
    await ipc.recreateConflict(repo.id, [path]);
    await useStatusStore.getState().refresh();
  } catch (e) {
    toastError(toAppError(e), "Couldn't restore the conflict");
  }
}

/**
 * Hands the conflict's three sides to VS Code's merge editor. The editor writes the
 * working file, the watcher notices, and staging the file is still what marks it
 * resolved — nothing here waits for the editor to close.
 */
async function resolveInEditor(path: string) {
  const repo = useRepoStore.getState().repo;
  if (!repo) return;
  try {
    const editor = await ipc.openMergeEditor(repo.id, path);
    useToastStore.getState().push({ kind: "info", title: `Opened ${path} in ${editor}` });
  } catch (e) {
    toastError(toAppError(e), "Couldn't open the merge editor");
  }
}
