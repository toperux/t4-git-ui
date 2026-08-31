import { CircleCheck, Cloud, GitBranch, TriangleAlert } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { RepoState } from "../../api/types";
import { Banner } from "../../components/ui/Banner/Banner";
import { Button } from "../../components/ui/Button/Button";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { StatusBar, StatusItem } from "../../components/ui/StatusBar/StatusBar";
import { ToastStack } from "../../components/ui/Toast/Toast";
import { AheadBehind } from "../../components/ui/TreeRow/TreeRow";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useStatusStore } from "../../store/statusStore";
import { checkoutBranch, mergeAbort, openCommitPanel, rebaseAbort, rebaseContinue } from "./actions";
import { computeBanners, defaultBranch, type BannerAction } from "./banners";
import { CommitPanel } from "./CommitPanel/CommitPanel";
import { DetailsPane } from "./DetailsPane";
import { DialogHost } from "./dialogs/DialogHost";
import { OutputDock } from "./OutputDock";
import s from "./RepoWindow.module.css";
import { RevisionGrid } from "./RevisionGrid/RevisionGrid";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { useShortcuts } from "./useShortcuts";

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
  const wtSelected = useRepoStore((st) => st.wtSelected);
  useShortcuts();

  return (
    <div className={s.window}>
      <Toolbar />
      <Group orientation="horizontal" className={s.main}>
        <Panel defaultSize={260} minSize={220} maxSize={320} className={s.panel}>
          <Sidebar />
        </Panel>
        <Separator className={s.splitH} aria-label="Resize sidebar" />
        <Panel className={s.content}>
          <StateBanners />
          <Group orientation="vertical" className={s.rows}>
            <Panel defaultSize="60%" minSize={120} className={s.panel}>
              <RevisionGrid />
            </Panel>
            <Separator className={s.splitV} aria-label="Resize details" />
            <Panel minSize={120} className={s.panel}>
              {wtSelected ? <CommitPanel /> : <DetailsPane />}
            </Panel>
          </Group>
        </Panel>
      </Group>
      <OutputDock />
      <RepoStatusBar />
      <DialogHost />
      <ToastStack />
    </div>
  );
}

/** Detached HEAD / merge / rebase / conflict banners above the grid (States artboard). */
function StateBanners() {
  const refs = useRepoStore((st) => st.refs);
  const status = useStatusStore((st) => st.status);
  const openDialog = useDialogStore((st) => st.open);
  const banners = computeBanners(refs, status);
  if (banners.length === 0) return null;

  function act(action: BannerAction) {
    switch (action) {
      case "checkoutDefault": {
        const def = defaultBranch((refs?.local ?? []).filter((b) => !b.isHead));
        if (def) void checkoutBranch(def);
        break;
      }
      case "createBranch":
        openDialog({ kind: "createBranch" });
        break;
      case "mergeAbort":
        void mergeAbort();
        break;
      case "rebaseAbort":
        void rebaseAbort();
        break;
      case "rebaseContinue":
        void rebaseContinue();
        break;
      case "commitMerge":
      case "openCommitPanel":
        openCommitPanel();
        break;
    }
  }

  return (
    <>
      {banners.map((b) => (
        <Banner
          key={b.id}
          kind={b.kind}
          actions={b.buttons.map((btn) => (
            <Button key={btn.label} size="sm" variant={btn.primary ? "primary" : "secondary"} onClick={() => act(btn.action)}>
              {btn.label}
            </Button>
          ))}
        >
          {b.text}
        </Banner>
      ))}
    </>
  );
}

function RepoStatusBar() {
  const refs = useRepoStore((st) => st.refs);
  const total = useRepoStore((st) => st.log.total);
  const complete = useRepoStore((st) => st.log.complete);
  const gitVersion = useRepoStore((st) => st.gitVersion);
  const status = useStatusStore((st) => st.status);
  const busy = useOpsStore((st) => st.busy);
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
          {busy && (
            <StatusItem>
              <Spinner size="sm" label={busy} />
              {busy}
            </StatusItem>
          )}
          {!complete && (
            <StatusItem>
              <Spinner size="sm" label="Loading commits" />
              Loading commits… {total}
            </StatusItem>
          )}
          {status && status.entries.length > 0 && (
            <StatusItem>
              {status.unstaged + status.untracked} unstaged · {status.staged} staged
              {status.conflicted > 0 ? ` · ${status.conflicted} conflicted` : ""}
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
