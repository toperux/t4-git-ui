// The stash browser: the working tree and every stash in one list, beside what the selected one holds.
import { Archive, CircleDashed } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { Stash } from "../../../api/types";
import { Button } from "../../../components/ui/Button/Button";
import { Dialog } from "../../../components/ui/Dialog/Dialog";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState";
import { ContextMenu } from "../../../components/ui/Menu/Menu";
import { TreeRow, TREE_PANE_CLASS } from "../../../components/ui/TreeRow/TreeRow";
import { cx } from "../../../lib/cx";
import { relativeDate } from "../../../lib/relativeDate";
import { useDiffStore } from "../../../store/diffStore";
import { selectRunning, useOpsStore } from "../../../store/opsStore";
import { selectSelectedOid, useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { stashApply, stashClear, stashDrop, stashPop } from "../actions";
import { ChangedFileList } from "../ChangedFileList/ChangedFileList";
import { DiffColumn } from "../CommitPanel/CommitPanel";
import { FilesColumn } from "../CommitPanel/FilesColumn";
import { CommitDiff } from "../DetailsPane";
import d from "../DetailsPane.module.css";
import w from "../RepoWindow.module.css";
import { gitCmd, stashClearArgs } from "./gitArgs";
import { EMPTY_PUSH, StashMenuItems, StashPushFields, StashSkipNote, stashBlocker, stashFiles, stashLabel, stashPushOp, stashPushPreview, useStashFiles } from "./StashDialogs";
import s from "./StashesDialog.module.css";

const NO_STASHES: Stash[] = [];

/**
 * Every stash at once, with the working tree above them: the list on the left, and on the right what
 * the selected row holds — the commit panel's own columns for the tree, the previewed entry's changed
 * files and diff for a stash (the same stores as the pane behind the scrim, so both show one stash).
 */
export function StashesDialog({ onClose }: { onClose: () => void }) {
  // What the pane showed before the browser opened, put back on dismiss. Captured in the first render:
  // the effect below previews stash@{0} on mount, and a preview clears the compare.
  const [before] = useState(() => {
    const st = useRepoStore.getState();
    return { preview: st.preview, compare: st.compare, wtSelected: st.wtSelected };
  });
  const stashes = useRepoStore((st) => st.refs?.stashes ?? NO_STASHES);
  const preview = useRepoStore((st) => st.preview);
  const previewStash = useRepoStore((st) => st.previewStash);
  const running = useOpsStore(selectRunning);
  const [push, setPush] = useState(EMPTY_PUSH);
  /** The Working tree row is selected. A dirty tree opens on it: that is what the user came to stash. */
  const [wt, setWt] = useState(() => stashFiles(useStatusStore.getState().status, EMPTY_PUSH.untracked).length > 0);
  const files = useStashFiles(push.untracked);
  const empty = useStatusStore((st) => stashBlocker(st.status) ?? "No changes");
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; stash: Stash } | null>(null);
  /** Where the preview last was, so a pop / drop moves to the entry that took its place. */
  const lastIndex = useRef(0);
  /** Set while a push of ours is in flight, holding the entry that was on top before it. */
  const pushed = useRef<{ from: string | null } | null>(null);

  useEffect(() => {
    if (preview) lastIndex.current = preview.index;
  }, [preview]);
  // The details pane loads a preview only in History; opened from Changes nothing else would, and the
  // list and diff would show whatever that pane last held. Keyed on the oid: a refs refresh re-creates
  // `preview`.
  const repoId = useRepoStore((st) => st.repo?.id ?? null);
  const previewOid = preview?.oid ?? null;
  useEffect(() => {
    const diff = useDiffStore.getState();
    if (!previewOid || (diff.repoId === repoId && diff.target?.kind === "stash" && diff.target.oid === previewOid)) return;
    void diff.load(repoId, { kind: "stash", oid: previewOid });
  }, [repoId, previewOid]);
  // Opening with nothing previewed lands on stash@{0}; losing the preview (pop / drop / clear here
  // or in a terminal) lands on whatever now sits where it was, or on the working tree once the
  // list is empty. The pane behind keeps the plain clear.
  useEffect(() => {
    if (wt || preview) return;
    if (stashes.length === 0) setWt(true);
    else previewStash(stashes[Math.min(lastIndex.current, stashes.length - 1)]);
  }, [wt, preview, stashes, previewStash]);

  // The stash a push of ours just made, as soon as the refs refresh brings it: that is what the
  // user asked to see.
  useEffect(() => {
    const top = stashes[0];
    if (!pushed.current || !top || top.oid === pushed.current.from) return;
    pushed.current = null;
    previewStash(top);
    // Leaving the working tree here, not when the push resolves: until the refs bring the entry
    // the list can still be empty, and an empty list lands back on the tree.
    setWt(false);
  }, [stashes, previewStash]);

  /** Every header button acts on the previewed entry. */
  const on = (fn: (st: Stash) => unknown) => () => {
    if (preview) void fn(preview);
  };
  const busy = running ? "Operation in progress" : undefined;
  /** Picking a stash row always leaves the working tree. */
  const select = (st: Stash) => {
    previewStash(st);
    setWt(false);
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Delete") {
      if (wt || !preview) return;
      e.preventDefault();
      void stashDrop(preview.index, preview.message);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    // The working tree is index -1, above stash@{0}.
    const at = wt ? -1 : preview ? stashes.findIndex((st) => st.oid === preview.oid) : -1;
    const next = Math.min(stashes.length - 1, Math.max(-1, at + (e.key === "ArrowDown" ? 1 : -1)));
    if (next < 0) setWt(true);
    else select(stashes[next]);
  }

  /**
   * Esc or ×: the pane goes back to what it showed before. The stash is re-found by oid (a push or drop
   * here shifts every index), and the compare comes back only while the selection is still one of its
   * pair. A conflicted Apply / Pop here moved the selection onto the working tree: nothing comes back
   * then. Not an unmount cleanup: a tab switch closes the dialog before the next tab's store comes in.
   */
  function dismiss() {
    const st = useRepoStore.getState();
    if (!before.wtSelected && st.wtSelected) st.previewStash(null);
    else {
      const preview = before.preview ? (st.refs?.stashes.find((x) => x.oid === before.preview?.oid) ?? null) : null;
      const oid = selectSelectedOid(st);
      const compare = before.compare && (oid === before.compare.from.oid || oid === before.compare.to.oid) ? before.compare : null;
      useRepoStore.setState({ preview, compare });
    }
    onClose();
  }

  const canPush = files.length > 0 && !running;
  function submitPush() {
    if (!canPush) return;
    pushed.current = { from: stashes[0]?.oid ?? null };
    void stashPushOp(push).then((out) => {
      if (!out.ok) {
        pushed.current = null;
        return;
      }
      setPush(EMPTY_PUSH);
    });
  }

  return (
    <Dialog title="Stashes" full onClose={dismiss} onSubmit={submitPush}>
      <Group orientation="horizontal" className={d.pane}>
        <Panel defaultSize={280} minSize={220} maxSize={420} className={w.panel}>
          <div className={s.side}>
            {wt ? (
              <div className={s.controls}>
                <StashPushFields value={push} onChange={setPush} />
                <span className={s.preview}>{stashPushPreview(push)}</span>
                <Button className={s.push} variant="primary" disabled={!canPush} title={files.length === 0 ? empty : busy} onClick={submitPush}>
                  {stashLabel(files.length)}
                </Button>
                <StashSkipNote untracked={push.untracked} />
              </div>
            ) : (
              <div className={s.bar}>
                <Button size="sm" disabled={!preview || running} title={busy} onClick={on((st) => stashApply(st.index))}>
                  Apply
                </Button>
                <Button size="sm" disabled={!preview || running} title={busy} onClick={on((st) => stashPop(st.index))}>
                  Pop
                </Button>
                <Button size="sm" variant="danger" disabled={!preview || running} title={busy} onClick={on((st) => stashDrop(st.index, st.message))}>
                  Drop…
                </Button>
                <Button size="sm" variant="danger" disabled={stashes.length === 0 || running} title={busy ?? gitCmd(stashClearArgs())} onClick={() => void stashClear(stashes.length)}>
                  Clear all…
                </Button>
              </div>
            )}
            <div className={cx(s.list, TREE_PANE_CLASS)} role="listbox" aria-label="Stashes" tabIndex={0} onKeyDown={onKeyDown}>
              <TreeRow
                role="option"
                icon={<CircleDashed size={14} aria-hidden />}
                /* The span, not the row's `className`: that would tint the meta too. */
                label={<span className={s.wt}>Working tree</span>}
                selected={wt}
                meta={files.length === 0 ? empty : `${files.length} changes`}
                onClick={() => setWt(true)}
              />
              {stashes.length === 0 ? (
                <EmptyState icon={<Archive size={24} aria-hidden />} title="No stashes" />
              ) : (
                stashes.map((st) => (
                  <TreeRow
                    key={st.oid}
                    role="option"
                    icon={<Archive size={14} aria-hidden />}
                    label={st.message}
                    title={`stash@{${st.index}}: ${st.message}`}
                    selected={!wt && preview?.oid === st.oid}
                    meta={
                      <>
                        {st.hasUntracked && <span className={s.dot} title="Includes untracked files" />}
                        {relativeDate(st.time)}
                      </>
                    }
                    onClick={() => select(st)}
                    onContextMenu={(e: MouseEvent<HTMLElement>) => {
                      e.preventDefault();
                      select(st);
                      setMenu({ at: { x: e.clientX, y: e.clientY }, stash: st });
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </Panel>
        <Separator className={w.splitH} aria-label="Resize stash list" />
        {/* 200, as in the pane: the list header needs 199px before the title gets any. */}
        <Panel defaultSize={320} minSize={200} maxSize={640} className={w.panel}>
          {wt ? <FilesColumn /> : <ChangedFileList />}
        </Panel>
        <Separator className={w.splitH} aria-label="Resize file list" />
        <Panel minSize={200} className={w.panel}>
          {wt ? <DiffColumn /> : <CommitDiff />}
        </Panel>
      </Group>
      {menu && (
        <ContextMenu at={menu.at} onClose={() => setMenu(null)} label="Stash actions">
          <StashMenuItems stash={menu.stash} onPick={() => setMenu(null)} />
        </ContextMenu>
      )}
    </Dialog>
  );
}
