import { Group, Panel, Separator } from "react-resizable-panels";
import { Dialog } from "../../../components/ui/Dialog/Dialog";
import { useTreeMode } from "../../../store/treeModeStore";
import { DiffColumn } from "../CommitPanel/CommitPanel";
import s from "../CommitPanel/CommitPanel.module.css";
import { StagedFiles, UnstagedFiles } from "../CommitPanel/FilesColumn";
import { MessageColumn } from "../CommitPanel/MessageColumn";
import w from "../RepoWindow.module.css";

/**
 * The commit panel as a full-window dialog: Unstaged / Staged / Message stacked on the left, the
 * diff taking the rest. Same stores as the panel (`RepoWindow` runs the one status sync for both),
 * so both show one selection. Closes after a commit.
 */
export function CommitDialog({ onClose }: { onClose: () => void }) {
  const [tree, toggleTree] = useTreeMode();
  return (
    <Dialog title="Commit" full onClose={onClose}>
      <Group orientation="horizontal" className={s.pane}>
        <Panel defaultSize={380} minSize={260} maxSize={640} className={w.panel}>
          <Group orientation="vertical" className={s.pane}>
            <Panel minSize={80} className={w.panel}>
              <UnstagedFiles tree={tree} onToggleTree={toggleTree} />
            </Panel>
            <Separator className={w.splitV} aria-label="Resize unstaged files" />
            <Panel minSize={80} className={w.panel}>
              <StagedFiles tree={tree} />
            </Panel>
            <Separator className={w.splitV} aria-label="Resize commit message" />
            <Panel defaultSize={300} minSize={240} className={w.panel}>
              <MessageColumn autoFocus onCommitted={onClose} />
            </Panel>
          </Group>
        </Panel>
        <Separator className={w.splitH} aria-label="Resize file lists" />
        <Panel minSize={200} className={w.panel}>
          <DiffColumn />
        </Panel>
      </Group>
    </Dialog>
  );
}
