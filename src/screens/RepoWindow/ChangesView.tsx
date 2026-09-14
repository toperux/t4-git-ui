import { Archive, CircleCheck, GitCommitHorizontal, History } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Button } from "../../components/ui/Button/Button";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import { useDialogStore } from "../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../store/opsStore";
import { useMerging, useRepoStore } from "../../store/repoStore";
import { selectChangeCount, useStatusStore } from "../../store/statusStore";
import { useViewStore } from "../../store/viewStore";
import s from "./ChangesView.module.css";
import { CommitPanel } from "./CommitPanel/CommitPanel";
import { MessageColumn } from "./CommitPanel/MessageColumn";
import w from "./RepoWindow.module.css";

/** `Changes on <branch> · N unstaged · M staged [· K conflicted]`, with Stash… and History at the right. */
export function ChangesBar() {
  const head = useRepoStore((st) => st.refs?.head ?? null);
  const status = useStatusStore((st) => st.status);
  const running = useOpsStore(selectRunning);
  const openDialog = useDialogStore((st) => st.open);
  const setView = useViewStore((st) => st.setView);
  const unstaged = status ? status.unstaged + status.untracked : 0;
  const staged = status?.staged ?? 0;
  const conflicted = status?.conflicted ?? 0;
  const total = unstaged + staged + conflicted;
  const counts = total === 0 ? "· nothing to commit" : `· ${unstaged} unstaged · ${staged} staged${conflicted ? ` · ${conflicted} conflicted` : ""}`;
  // No refs yet (still loading) is not a detached head.
  const branch = !head ? "HEAD" : head.detached || !head.branch ? "detached HEAD" : head.branch;
  return (
    <div className={s.bar}>
      <GitCommitHorizontal size={14} aria-hidden />
      <span className={s.title}>
        Changes on <span className={s.branch}>{branch}</span> <span className={s.counts}>{counts}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        icon={<Archive size={14} aria-hidden />}
        disabled={running || total === 0}
        title={running ? "Operation in progress" : total === 0 ? "Nothing to stash" : undefined}
        onClick={() => openDialog({ kind: "stashPush" })}
      >
        Stash…
      </Button>
      <Button variant="ghost" size="sm" icon={<History size={14} aria-hidden />} title="History (Alt+1)" onClick={() => setView("history")}>
        History
      </Button>
    </div>
  );
}

/** The Changes view (spec §1): the bar over the commit panel — or, on a clean tree, the empty state beside the message column. */
export function ChangesView() {
  const changes = useStatusStore(selectChangeCount);
  const merging = useMerging();
  const clean = changes === 0 && !merging;
  return (
    <div className={s.view}>
      <ChangesBar />
      {clean ? (
        <Group orientation="horizontal" className={s.pane}>
          <Panel minSize={200} className={w.panel}>
            <EmptyState className={s.empty} icon={<CircleCheck size={24} aria-hidden />} title="Working tree clean" hint="Edit files, or amend the last commit." />
          </Panel>
          <Separator className={w.splitH} aria-label="Resize commit message" />
          <Panel defaultSize={340} minSize={260} maxSize={560} className={w.panel}>
            <MessageColumn />
          </Panel>
        </Group>
      ) : (
        <CommitPanel />
      )}
    </div>
  );
}
