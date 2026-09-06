import { CircleCheck, Cloud, GitBranch, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import type { RepoState } from "../../api/types";
import { Banner } from "../../components/ui/Banner/Banner";
import { Button } from "../../components/ui/Button/Button";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { StatusBar, StatusItem } from "../../components/ui/StatusBar/StatusBar";
import { ToastStack } from "../../components/ui/Toast/Toast";
import { AheadBehind } from "../../components/ui/TreeRow/TreeRow";
import { prettyUrl } from "../../lib/paths";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useShowWorkingTree, useStatusStore } from "../../store/statusStore";
import { checkoutBranch, mergeAbort, openCommitPanel, rebaseAbort, rebaseContinue } from "./actions";
import { computeBanners, defaultBranch, type BannerAction } from "./banners";
import { CommitPanel, useCommitSync } from "./CommitPanel/CommitPanel";
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

/** Output dock: collapsed header height, and the open range from the style guide (§4 "bottom, 160–320px"). */
const DOCK_COLLAPSED_H = 28;
const DOCK_MIN_H = 160;
const DOCK_MAX_H = 320;
const DOCK_DEFAULT_H = 200;

export function RepoWindow() {
  const selectedWt = useRepoStore((st) => st.wtSelected);
  const showWt = useShowWorkingTree();
  // The commit panel belongs to the working-tree row: it can only show while the grid shows that row.
  const wtSelected = selectedWt && showWt;
  // One status sync serves the panel and the commit dialog (which can open from the toolbar with the panel hidden).
  const commitOpen = useDialogStore((st) => st.dialog?.kind === "commit");
  useCommitSync(wtSelected || commitOpen);
  const dockOpen = useOpsStore((st) => st.open);
  useShortcuts();

  return (
    <div className={s.window}>
      <Toolbar />
      <Group orientation="vertical" className={s.main}>
        <Panel minSize={200} className={s.panel}>
          <Group orientation="horizontal" className={s.main}>
            {/* 260 is the design width; the range is wide enough that dragging visibly does something. */}
            <Panel defaultSize={260} minSize={180} maxSize={560} className={s.panel}>
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
        </Panel>
        {/* Nothing to resize while the dock is collapsed to its header bar. */}
        <Separator className={s.splitV} aria-label="Resize output" disabled={!dockOpen} />
        <DockPanel open={dockOpen} />
      </Group>
      <RepoStatusBar />
      <DialogHost />
      <ToastStack />
    </div>
  );
}

/**
 * The output dock as a resizable panel: 160–320px open (style guide §4), collapsed to the
 * 28px header bar otherwise. The height is per session: 200px on the first open, then whatever it
 * was last dragged to — a bare `expand()` lands on `minSize`.
 */
export function DockPanel({ open }: { open: boolean }) {
  const panel = usePanelRef();
  const lastOpenH = useRef(DOCK_DEFAULT_H);

  // `defaultSize` already puts the panel in the right state at mount — and the imperative API is not
  // usable yet there (the Group registers itself after its children's effects run). Only react to changes.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current === open) return;
    wasOpen.current = open;
    if (!open) panel.current?.collapse();
    else panel.current?.resize(lastOpenH.current);
  }, [open, panel]);

  return (
    <Panel
      panelRef={panel}
      collapsible
      collapsedSize={DOCK_COLLAPSED_H}
      defaultSize={open ? DOCK_DEFAULT_H : DOCK_COLLAPSED_H}
      minSize={DOCK_MIN_H}
      maxSize={DOCK_MAX_H}
      onResize={(size) => {
        if (size.inPixels > DOCK_COLLAPSED_H) lastOpenH.current = size.inPixels;
      }}
      className={s.panel}
    >
      <OutputDock />
    </Panel>
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
  // The branch's own remote, else origin, else whatever comes first — not the alphabetical first.
  const remote = refs?.remotes.find((r) => current?.upstream?.startsWith(`${r.name}/`)) ?? refs?.remotes.find((r) => r.name === "origin") ?? refs?.remotes[0];
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
