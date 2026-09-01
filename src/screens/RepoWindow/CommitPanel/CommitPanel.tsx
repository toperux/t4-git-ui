import { useEffect } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import * as ipc from "../../../api/ipc";
import { toAppError } from "../../../api/ipc";
import { useCommitStore } from "../../../store/commitStore";
import { useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { toastError, useToastStore } from "../../../store/toastStore";
import { DiffViewer, type DiffActions } from "../DiffViewer/DiffViewer";
import w from "../RepoWindow.module.css";
import s from "./CommitPanel.module.css";
import { FilesColumn } from "./FilesColumn";
import { MessageColumn } from "./MessageColumn";

/** Bottom pane while the working-tree row is selected: Unstaged/Staged 320 | Diff | Message 340 (Commit.mjs). */
export function CommitPanel() {
  const status = useStatusStore((st) => st.status);
  const sync = useCommitStore((st) => st.syncWithStatus);
  useEffect(() => sync(status), [status, sync]);

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
        <MessageColumn />
      </Panel>
    </Group>
  );
}

/** `DiffViewer` in actions mode for the focused working-tree file. */
function DiffColumn() {
  const diff = useCommitStore((st) => st.diff);
  const path = useCommitStore((st) => st.diffPath);
  const list = useCommitStore((st) => st.diffList);
  const loading = useCommitStore((st) => st.diffLoading);
  const error = useCommitStore((st) => st.diffError);
  const busy = useCommitStore((st) => st.busy);
  const stats = useCommitStore((st) => (st.diffPath ? st.stats[st.diffList][st.diffPath] : undefined));
  const stageHunk = useCommitStore((st) => st.stageHunk);
  const stageLines = useCommitStore((st) => st.stageLines);
  const entry = useStatusStore((st) => st.status?.entries.find((e) => e.path === path));

  // Conflicted and untracked files can only be staged whole — no hunk or line indices to work with.
  const conflicted = list === "unstaged" && !!entry?.conflicted;
  const untracked = list === "unstaged" && entry?.workdir === "untracked";
  const actions: DiffActions | undefined = path
    ? {
        target: list,
        wholeFile: conflicted || untracked,
        note: conflicted ? "Conflict — stage the file once resolved" : untracked ? "Untracked — stage whole file" : undefined,
        busy,
        onResolve: conflicted ? () => void resolveInEditor(path) : undefined,
        onStageHunk: (h) => void stageHunk(h),
        onStageLines: (l) => void stageLines(l),
      }
    : undefined;

  return <DiffViewer path={path} oldPath={entry?.oldPath ?? null} stats={stats ?? null} diff={diff} loading={loading} error={error} actions={actions} />;
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
