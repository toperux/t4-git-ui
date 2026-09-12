import { Group, Panel, Separator } from "react-resizable-panels";
import { Dialog } from "../../../components/ui/Dialog/Dialog";
import { selectCompare, useRepoStore, type RepoStore } from "../../../store/repoStore";
import { ChangedFileList } from "../ChangedFileList/ChangedFileList";
import { CommitDiff } from "../DetailsPane";
import s from "../DetailsPane.module.css";
import w from "../RepoWindow.module.css";

/** `Diff — <short> <summary>` for a commit, `Diff — <from>…<to>` for a compare. */
function diffTitle(st: RepoStore): string {
  const compare = selectCompare(st);
  if (compare) return `Diff — ${compare.from.short}…${compare.to.short}`;
  const commit = st.selectedIndex === null ? undefined : st.rows[st.selectedIndex]?.row.commit;
  return commit ? `Diff — ${commit.short} ${commit.summary}` : "Diff";
}

/**
 * The details pane's changed files + diff as a full-window dialog. Same stores as the pane (which
 * stays mounted behind the scrim and keeps loading them), so both show one selection.
 */
export function DiffDialog({ onClose }: { onClose: () => void }) {
  const title = useRepoStore(diffTitle);
  return (
    <Dialog title={title} full onClose={onClose}>
      <Group orientation="horizontal" className={s.pane}>
        {/* 200, as in the pane: the list header needs 199px before the title gets any. */}
        <Panel defaultSize={320} minSize={200} maxSize={640} className={w.panel}>
          <ChangedFileList autoFocus />
        </Panel>
        <Separator className={w.splitH} aria-label="Resize file list" />
        <Panel minSize={200} className={w.panel}>
          <CommitDiff />
        </Panel>
      </Group>
    </Dialog>
  );
}
