// The stash browser: push form + entry list beside the previewed stash's files and diffs.
import { Archive } from "lucide-react";
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
import { selectRunning, useOpsStore } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { selectChangeCount, useStatusStore } from "../../../store/statusStore";
import { stashApply, stashClear, stashDrop, stashPop } from "../actions";
import { ChangedFileList } from "../ChangedFileList/ChangedFileList";
import { CommitDiff } from "../DetailsPane";
import d from "../DetailsPane.module.css";
import w from "../RepoWindow.module.css";
import { gitCmd, stashClearArgs } from "./gitArgs";
import { EMPTY_PUSH, StashMenuItems, StashPushFields, stashPushOp, stashPushPreview } from "./StashDialogs";
import s from "./StashesDialog.module.css";

const NO_STASHES: Stash[] = [];

/**
 * Every stash at once: the inline push form and the list on the left, the previewed entry's changed
 * files and diff on the right — the same stores as the pane behind the scrim, so both show one stash.
 */
export function StashesDialog({ onClose }: { onClose: () => void }) {
  const stashes = useRepoStore((st) => st.refs?.stashes ?? NO_STASHES);
  const preview = useRepoStore((st) => st.preview);
  const previewStash = useRepoStore((st) => st.previewStash);
  const running = useOpsStore(selectRunning);
  const changes = useStatusStore(selectChangeCount);
  const [push, setPush] = useState(EMPTY_PUSH);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; stash: Stash } | null>(null);
  /** Where the preview last was, so a pop / drop moves to the entry that took its place. */
  const lastIndex = useRef(0);
  /** Set while a push of ours is in flight, holding the entry that was on top before it. */
  const pushed = useRef<{ from: string | null } | null>(null);

  useEffect(() => {
    if (preview) lastIndex.current = preview.index;
  }, [preview]);
  // Opening with nothing previewed lands on stash@{0}; losing the preview (pop / drop / clear here
  // or in a terminal) lands on whatever now sits where it was. The pane behind keeps the plain clear.
  useEffect(() => {
    if (preview || stashes.length === 0) return;
    previewStash(stashes[Math.min(lastIndex.current, stashes.length - 1)]);
  }, [preview, stashes, previewStash]);

  // The stash a push of ours just made, as soon as the refs refresh brings it: that is what the
  // user asked to see.
  useEffect(() => {
    const top = stashes[0];
    if (!pushed.current || !top || top.oid === pushed.current.from) return;
    pushed.current = null;
    previewStash(top);
  }, [stashes, previewStash]);

  /** Every header button acts on the previewed entry. */
  const on = (fn: (st: Stash) => unknown) => () => {
    if (preview) void fn(preview);
  };
  const busy = running ? "Operation in progress" : undefined;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (stashes.length === 0) return;
    if (e.key === "Delete" && preview) {
      e.preventDefault();
      void stashDrop(preview.index, preview.message);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const at = preview ? stashes.findIndex((st) => st.oid === preview.oid) : -1;
    const next = Math.min(stashes.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)));
    previewStash(stashes[next]);
  }

  const canPush = changes > 0 && !running;
  function submitPush() {
    if (!canPush) return;
    pushed.current = { from: stashes[0]?.oid ?? null };
    void stashPushOp(push).then((out) => {
      if (out.ok) setPush(EMPTY_PUSH);
      else pushed.current = null;
    });
  }

  return (
    <Dialog title="Stashes" full onClose={onClose} onSubmit={submitPush}>
      <Group orientation="horizontal" className={d.pane}>
        <Panel defaultSize={280} minSize={220} maxSize={420} className={w.panel}>
          <div className={s.side}>
            <div className={s.form}>
              <StashPushFields value={push} onChange={setPush} />
              <div className={s.formFoot}>
                <span className={s.preview}>{stashPushPreview(push)}</span>
                <Button size="sm" variant="primary" disabled={!canPush} title={changes === 0 ? "No changes" : running ? "Operation in progress" : undefined} onClick={submitPush}>
                  Stash
                </Button>
              </div>
            </div>
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
            {stashes.length === 0 ? (
              <EmptyState icon={<Archive size={24} aria-hidden />} title="No stashes" />
            ) : (
              <div className={cx(s.list, TREE_PANE_CLASS)} role="listbox" aria-label="Stashes" tabIndex={0} onKeyDown={onKeyDown}>
                {stashes.map((st) => (
                  <TreeRow
                    key={st.oid}
                    role="option"
                    icon={<Archive size={14} aria-hidden />}
                    label={st.message}
                    title={`stash@{${st.index}}: ${st.message}`}
                    selected={preview?.oid === st.oid}
                    meta={
                      <>
                        {st.hasUntracked && <span className={s.dot} title="Includes untracked files" />}
                        {relativeDate(st.time)}
                      </>
                    }
                    onClick={() => previewStash(st)}
                    onContextMenu={(e: MouseEvent<HTMLElement>) => {
                      e.preventDefault();
                      previewStash(st);
                      setMenu({ at: { x: e.clientX, y: e.clientY }, stash: st });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>
        <Separator className={w.splitH} aria-label="Resize stash list" />
        {/* 200, as in the pane: the list header needs 199px before the title gets any. */}
        <Panel defaultSize={320} minSize={200} maxSize={640} className={w.panel}>
          <ChangedFileList />
        </Panel>
        <Separator className={w.splitH} aria-label="Resize file list" />
        <Panel minSize={200} className={w.panel}>
          <CommitDiff />
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
