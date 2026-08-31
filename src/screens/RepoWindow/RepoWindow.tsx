import { CircleCheck, Cloud, GitBranch, TriangleAlert } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { RepoState } from "../../api/types";
import { Banner } from "../../components/ui/Banner/Banner";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { StatusBar, StatusItem } from "../../components/ui/StatusBar/StatusBar";
import { AheadBehind } from "../../components/ui/TreeRow/TreeRow";
import { useRepoStore } from "../../store/repoStore";
import { DetailsPane } from "./DetailsPane";
import { OutputDock } from "./OutputDock";
import s from "./RepoWindow.module.css";
import { RevisionGrid } from "./RevisionGrid/RevisionGrid";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";

const STATE_LABEL: Record<RepoState, string> = {
  clean: "Clean",
  merge: "Merge in progress",
  rebase: "Rebase in progress",
  cherryPick: "Cherry-pick in progress",
  revert: "Revert in progress",
  bisect: "Bisect in progress",
};

/** `https://github.com/x/y.git` → `github.com/x/y` */
function prettyUrl(url: string) {
  return url.replace(/^[a-z+]+:\/\//i, "").replace(/^git@/, "").replace(/\.git$/, "");
}

export function RepoWindow() {
  const refs = useRepoStore((st) => st.refs);
  const head = refs?.head;
  const detached = !!head?.detached;

  return (
    <div className={s.window}>
      <Toolbar />
      <Group orientation="horizontal" className={s.main}>
        <Panel defaultSize={260} minSize={220} maxSize={320} className={s.panel}>
          <Sidebar />
        </Panel>
        <Separator className={s.splitH} aria-label="Resize sidebar" />
        <Panel className={s.content}>
          {detached && head?.oid && (
            <Banner kind="warning">
              Detached HEAD at <span className={s.mono}>{head.oid.slice(0, 7)}</span> — new commits won’t belong to any branch
            </Banner>
          )}
          <Group orientation="vertical" className={s.rows}>
            <Panel defaultSize="60%" minSize={120} className={s.panel}>
              <RevisionGrid />
            </Panel>
            <Separator className={s.splitV} aria-label="Resize details" />
            <Panel minSize={120} className={s.panel}>
              <DetailsPane />
            </Panel>
          </Group>
        </Panel>
      </Group>
      <OutputDock />
      <RepoStatusBar />
    </div>
  );
}

function RepoStatusBar() {
  const refs = useRepoStore((st) => st.refs);
  const total = useRepoStore((st) => st.log.total);
  const complete = useRepoStore((st) => st.log.complete);
  const gitVersion = useRepoStore((st) => st.gitVersion);
  const head = refs?.head;
  const current = refs?.local.find((b) => b.isHead);
  const remote = refs?.remotes[0];
  const state = refs?.state ?? "clean";

  return (
    <StatusBar
      left={
        <>
          <StatusItem>
            <GitBranch size={12} aria-hidden />
            {head?.detached && head.oid ? (
              <>
                <span className={s.mono}>{head.oid.slice(0, 7)}</span> (detached)
              </>
            ) : (
              (head?.branch ?? "") + (head && !head.oid ? " (unborn)" : "")
            )}
          </StatusItem>
          {current && !head?.detached && (
            <StatusItem>
              <AheadBehind ahead={current.ahead} behind={current.behind} />
            </StatusItem>
          )}
          {remote && (
            <StatusItem title={remote.url ?? undefined}>
              <Cloud size={12} aria-hidden />
              {remote.name}
              {remote.url ? ` · ${prettyUrl(remote.url)}` : ""}
            </StatusItem>
          )}
        </>
      }
      right={
        <>
          {!complete && (
            <StatusItem>
              <Spinner size="sm" label="Loading commits" />
              Loading commits… {total}
            </StatusItem>
          )}
          <StatusItem>
            {state === "clean" ? <CircleCheck size={12} aria-hidden /> : <TriangleAlert size={12} aria-hidden />}
            {STATE_LABEL[state]}
          </StatusItem>
          {gitVersion && <StatusItem>git {gitVersion.replace(/^git version\s*/i, "")}</StatusItem>}
        </>
      }
    />
  );
}
