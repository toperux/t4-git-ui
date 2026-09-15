import { CircleCheck, Cloud, GitBranch, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, type RefObject } from "react";
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
import { useStatusStore } from "../../store/statusStore";
import { useTabsStore } from "../../store/tabsStore";
import { useViewStore } from "../../store/viewStore";
import { bisectMark, bisectReset, checkoutBranch, cherryPickAbort, mergeAbort, openCommitPanel, rebaseAbort, rebaseContinue, rebaseSkip, revertAbort } from "./actions";
import { computeBanners, defaultBranch, type BannerAction } from "./banners";
import { ChangesView } from "./ChangesView";
import { CommandPalette } from "./CommandPalette/CommandPalette";
import { useCommitSync } from "./CommitPanel/CommitPanel";
import { DetailsPane } from "./DetailsPane";
import { DialogHost } from "./dialogs/DialogHost";
import { useLayout } from "./layout";
import { OutputDock } from "./OutputDock";
import s from "./RepoWindow.module.css";
import { RevisionGrid } from "./RevisionGrid/RevisionGrid";
import { Sidebar } from "./Sidebar";
import { SidebarRail } from "./SidebarRail";
import { TabStrip } from "./TabStrip";
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
  const view = useViewStore((st) => st.view);
  // The width decides the sidebar unless the user said otherwise with Ctrl+Shift+` (spec §2).
  const railAuto = useLayout().railAuto;
  const railOverride = useViewStore((st) => st.railOverride);
  // The override holds until the user toggles back to what the width would pick (`toggleRail`), not
  // until a resize happens to pass a width that agrees with it: forced on at 1400, a round trip
  // through 900 must not hand the sidebar back on the way out.
  const rail = railOverride ?? railAuto;
  // One status sync serves the panel, the commit dialog (which can open from the toolbar with the
  // panel hidden) and the stash browser's working-tree row, which shows the same two lists.
  const commitOpen = useDialogStore((st) => st.dialog?.kind === "commit");
  const stashesOpen = useDialogStore((st) => st.dialog?.kind === "stashes");
  useCommitSync(view === "changes" || commitOpen || stashesOpen);
  const dockOpen = useOpsStore((st) => st.open);
  // Set while the user is working the output separator, by pointer or by key. Half of the answer to
  // "is this height the user's?" — `DockPanel`'s `onResize` holds the other half.
  const dockGesture = useRef(false);
  const dockGestureFrame = useRef(0);
  // The flag has to outlive the gesture by a frame or two. `onResize` reaches us from a
  // ResizeObserver rather than from the event that caused it, so clearing the instant the key or the
  // pointer came up threw away the resize it was there to authorise — walked as a keyboard tap that
  // moved the dock to 320 and was then healed straight back to 160.
  // What the dock does with a gesture once it is over; `DockPanel` fills it in.
  const dockGestureEnd = useRef<() => void>(() => {});
  const releaseDockGesture = useCallback(() => {
    cancelAnimationFrame(dockGestureFrame.current);
    dockGestureFrame.current = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // Every pointerup in the window lands here; only one that ends a gesture has anything to do.
        if (!dockGesture.current) return;
        dockGesture.current = false;
        dockGestureEnd.current();
      }),
    );
  }, []);
  const armDockGesture = () => {
    cancelAnimationFrame(dockGestureFrame.current);
    dockGesture.current = true;
  };
  // The dock heals against the height this group actually has, not the window's: the tab strip sits
  // outside the group and appears with the second tab, so it gives height back with no window resize.
  const dockGroup = useRef<HTMLDivElement | null>(null);
  // Registered once rather than per press. A release can land anywhere — outside the separator,
  // outside the window, or nowhere at all if focus is taken mid-drag — and a per-press listener that
  // never fires is also one that never clears the flag, which hands every later squeeze the
  // authority of a deliberate drag.
  useEffect(() => {
    window.addEventListener("pointerup", releaseDockGesture);
    window.addEventListener("pointercancel", releaseDockGesture);
    window.addEventListener("blur", releaseDockGesture);
    return () => {
      cancelAnimationFrame(dockGestureFrame.current);
      window.removeEventListener("pointerup", releaseDockGesture);
      window.removeEventListener("pointercancel", releaseDockGesture);
      window.removeEventListener("blur", releaseDockGesture);
    };
  }, [releaseDockGesture]);
  // With one tab there is nothing to switch to, and the toolbar already names the repository — but a
  // tab dragged here from another window needs somewhere to show its drop caret.
  const stripped = useTabsStore((st) => st.tabs.length > 1 || st.caret !== null);
  useShortcuts();

  return (
    <div className={s.window}>
      {stripped && <TabStrip />}
      <Toolbar />
      <Group orientation="vertical" className={s.main} elementRef={dockGroup}>
        <Panel minSize={200} className={s.panel}>
          <div className={s.row}>
            {rail && <SidebarRail />}
            <Group orientation="horizontal" className={s.main}>
              {/* The group itself never remounts: a remount would throw away the grid's scroll position
                  and the details pane every time the sidebar is toggled or the width crosses the breakpoint. */}
              {!rail && (
                <>
                  {/* 260 is the design width, and now held there through a window resize instead of drifting
                      off it. The range is wide enough that dragging visibly does something. */}
                  <Panel defaultSize={260} minSize={180} maxSize={560} groupResizeBehavior="preserve-pixel-size" className={s.panel}>
                    <Sidebar />
                  </Panel>
                  <Separator className={s.splitH} aria-label="Resize sidebar" />
                </>
              )}
              {/* The absorber: a wider window lands here. The `minSize` earns its place now that the sidebar
                  holds its pixels — without it the sidebar is first in DOM order with nothing to stop it, so a
                  560px one kept through `railOverride` would squeeze this to nothing as the window narrows. */}
              <Panel minSize={440} className={s.content}>
                <StateBanners />
                {/* One view at a time (spec §1). History unmounts while Changes shows: the selection and
                    the reveal request live in the store, and the grid scrolls to them when it comes back. */}
                {view === "changes" ? (
                  <ChangesView />
                ) : (
                  <Group orientation="vertical" className={s.rows}>
                    <Panel defaultSize="60%" minSize={120} className={s.panel}>
                      <RevisionGrid />
                    </Panel>
                    <Separator className={s.splitV} aria-label="Resize details" />
                    {/* Fixed height: the grid above takes the window's extra, so this keeps what it was dragged to. */}
                    <Panel minSize={120} groupResizeBehavior="preserve-pixel-size" className={s.panel}>
                      <DetailsPane />
                    </Panel>
                  </Group>
                )}
              </Panel>
            </Group>
          </div>
        </Panel>
        {/* Nothing to resize while the dock is collapsed to its header bar. */}
        <Separator
          className={s.splitV}
          aria-label="Resize output"
          disabled={!dockOpen}
          onPointerDown={(e) => {
            if (armsDockGesture(e, dockOpen)) armDockGesture();
          }}
          // Arrow keys and Home/End resize a separator too, and the library treats them as the same
          // user interaction a drag is. Leaving them out dropped the height a keyboard user picked,
          // and then the heal put its own value back over the top of it. There is no keyup half:
          // the release is deferred, so a tap too quick to hold the flag still records its resize.
          onKeyDown={() => {
            if (!dockOpen) return;
            armDockGesture();
            releaseDockGesture();
          }}
          // Double-click resets the panel to its `defaultSize`, and lands after the release, so there
          // is no gesture left to observe — raise one for as long as that resize takes to arrive.
          onDoubleClick={() => {
            if (!dockOpen) return;
            armDockGesture();
            releaseDockGesture();
          }}
        />
        <DockPanel open={dockOpen} gesture={dockGesture} gestureEnd={dockGestureEnd} group={dockGroup} />
      </Group>
      <RepoStatusBar />
      <DialogHost />
      <CommandPalette />
      <ToastStack />
    </div>
  );
}

/**
 * Whether a dock height is one the user could have meant, rather than one the layout forced. The
 * open range is the whole of what a person can choose, but a drag is *not* held inside it: under the
 * 94px midpoint the library snaps a collapsible panel to its 28px bar, and a group too short for
 * `minSize` reports the squeezed box. This is the value half of the gate at a gesture's end; the gesture
 * ref is the cause half, and neither is sufficient on its own — both were walked failing alone.
 */
export const isDraggedHeight = (px: number) => px >= DOCK_MIN_H && px <= DOCK_MAX_H;

/**
 * Whether a pointer press on the output separator begins a resize the user asked for. `disabled` on
 * a `Separator` renders `aria-disabled` on a plain div, which stops the library from resizing but
 * not the event from reaching us; and a non-primary button raises a context menu or starts
 * autoscroll rather than dragging, often swallowing the release that would clear the flag.
 */
export const armsDockGesture = (e: { pointerType?: string; button?: number }, dockOpen: boolean) =>
  dockOpen && !(e.pointerType === "mouse" && (e.button ?? 0) > 0);

/**
 * The output dock as a resizable panel: 160–320px open (style guide §4), collapsed to the
 * 28px header bar otherwise. The height is per session: 200px on the first open, then whatever it
 * was last dragged to — a bare `expand()` lands on `minSize`.
 */
export function DockPanel({
  open,
  gesture,
  gestureEnd,
  group,
}: {
  open: boolean;
  gesture: RefObject<boolean>;
  gestureEnd: RefObject<() => void>;
  group: RefObject<HTMLDivElement | null>;
}) {
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

  // The size the panel actually has, squeezes included — as against `lastOpenH`, which only ever
  // holds a size the user chose.
  const currentH = useRef(DOCK_DEFAULT_H);
  // A squeezed dock keeps its squeezed pixels when the room comes back, because a pixel-size pane
  // keeps whatever it has: it can sit at its 28px bar, open by state with nothing under the header,
  // until someone thinks to toggle it. Put it back once there is room. `onResize` cannot carry this
  // — it runs off a ResizeObserver on the panel's own element, and a taller group changes neither
  // the dock's height nor its width, so nothing fires.
  useEffect(() => {
    const el = group.current;
    if (!open || !el) return;
    let prev = el.offsetHeight;
    let frame = 0;
    // The group rather than the window, because the group is the height actually being shared out:
    // the tab strip sits outside it, so closing the second tab hands room back with no window resize.
    const ro = new ResizeObserver(() => {
      const now = el.offsetHeight;
      const grew = now > prev;
      prev = now;
      // Only on the way up: the squeezed condition is just as true on the way down, where resizing
      // would fight the layout for room that is not there. And measured against the height the user
      // chose rather than the minimum — a group with room for 160 of a chosen 200 is still short,
      // and stopping at the minimum strands the rest, as the first walk of this fix did.
      if (!grew || currentH.current >= lastOpenH.current) return;
      cancelAnimationFrame(frame);
      // Two frames, not one. The library lays this same change out in the first of them, and a
      // `resize` issued inside that frame is overwritten — measured twice: a single frame healed the
      // dock to the library's own `minSize` instead of the height the user chose.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => panel.current?.resize(lastOpenH.current));
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [open, panel, group]);

  // A gesture is judged by where it ends, not by what it passed through on the way: a drag down to
  // the bar crosses 160 before it snaps, and a drag that closes the store mid-way disables the
  // separator under the pointer, so it can no longer be dragged back up. Ending inside the open
  // range is a height the user chose; ending on the bar is the dock shut, and the store has to say
  // so, or the header offers the wrong toggle and the heal above reopens a dock the user shut.
  const gestureH = useRef<number | null>(null);
  useEffect(() => {
    gestureEnd.current = () => {
      const h = gestureH.current;
      gestureH.current = null;
      if (h === null) return;
      if (isDraggedHeight(h)) lastOpenH.current = h;
      else if (h <= DOCK_COLLAPSED_H + 1) useOpsStore.getState().setOpen(false);
    };
  }, [gestureEnd]);

  // Pixel height across a window resize, so the collapsed bar stays exactly its 28px.
  return (
    <Panel
      panelRef={panel}
      collapsible
      groupResizeBehavior="preserve-pixel-size"
      collapsedSize={DOCK_COLLAPSED_H}
      defaultSize={open ? DOCK_DEFAULT_H : DOCK_COLLAPSED_H}
      minSize={DOCK_MIN_H}
      maxSize={DOCK_MAX_H}
      onResize={(size) => {
        currentH.current = size.inPixels;
        // Two questions, and this is the user's height only when both answer yes. Did they ask for
        // the resize? Only a gesture on the separator says so — never the layout, and never our own
        // `resize` calls, which run with no gesture in flight. And could they have meant this value?
        // Asking either one alone was walked failing: the cause alone records the 28px snap and the
        // squeezed box, the value alone records every squeeze that lands in range. The value is
        // asked once the gesture ends (`gestureEnd` above); here the gesture's latest size is held.
        if (gesture.current) gestureH.current = size.inPixels;
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
      case "rebaseSkip":
        void rebaseSkip();
        break;
      case "rebaseContinue":
        void rebaseContinue();
        break;
      case "cherryPickAbort":
        void cherryPickAbort();
        break;
      case "revertAbort":
        void revertAbort();
        break;
      // The bisect buttons all act on HEAD, the commit git checked out for this step.
      case "bisectGood":
        void bisectMark("good");
        break;
      case "bisectBad":
        void bisectMark("bad");
        break;
      case "bisectSkip":
        void bisectMark("skip");
        break;
      case "bisectReset":
        void bisectReset();
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
