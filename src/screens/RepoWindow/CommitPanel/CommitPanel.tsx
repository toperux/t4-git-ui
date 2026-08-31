import { useEffect } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useCommitStore } from "../../../store/commitStore";
import { useStatusStore } from "../../../store/statusStore";
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

  const actions: DiffActions | undefined =
    path && !(entry?.conflicted && list === "unstaged")
      ? {
          target: list,
          wholeFile: list === "unstaged" && entry?.workdir === "untracked",
          busy,
          onStageHunk: (h) => void stageHunk(h),
          onStageLines: (l) => void stageLines(l),
        }
      : undefined;

  return <DiffViewer path={path} oldPath={entry?.oldPath ?? null} stats={stats ?? null} diff={diff} loading={loading} error={error} actions={actions} />;
}
