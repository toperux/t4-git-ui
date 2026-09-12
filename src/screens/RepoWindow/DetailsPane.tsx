import { Copy, GitCommitHorizontal, GitCompare, Tag as TagIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { getCommit, toAppError } from "../../api/ipc";
import type { CommitDetail, CommitInfo } from "../../api/types";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../components/ui/PanelHeader/PanelHeader";
import { absoluteDate, relativeDate } from "../../lib/relativeDate";
import { useDialogStore } from "../../store/dialogStore";
import { useDiffStore } from "../../store/diffStore";
import { selectCompare, selectSelectedOid, useRepoStore } from "../../store/repoStore";
import { copyText, openInDiffTool } from "./actions";
import { ChangedFileList } from "./ChangedFileList/ChangedFileList";
import s from "./DetailsPane.module.css";
import { DiffViewer } from "./DiffViewer/DiffViewer";
import { FileContent } from "./DiffViewer/FileContent";
import w from "./RepoWindow.module.css";
import { RefChips } from "./RevisionGrid/RefChips";

export function DetailsPane() {
  const repoId = useRepoStore((st) => st.repo?.id ?? null);
  const oid = useRepoStore(selectSelectedOid);
  const compare = useRepoStore(selectCompare);
  const load = useDiffStore((st) => st.load);
  const open = useDialogStore((st) => st.open);
  // Memoised: a fresh object every render would re-run the effect (and re-fetch) on every store touch.
  const target = useMemo(
    () => (compare ? ({ kind: "commitRange", from: compare.from.oid, to: compare.to.oid } as const) : oid ? ({ kind: "commit", oid } as const) : null),
    [oid, compare],
  );
  useEffect(() => {
    void load(repoId, target);
  }, [repoId, target, load]);

  return (
    <Group orientation="horizontal" className={s.pane}>
      <Panel defaultSize={340} minSize={240} maxSize={560} className={w.panel}>
        {compare ? <CompareDetails compare={compare} /> : <CommitDetails />}
      </Panel>
      <Separator className={w.splitH} aria-label="Resize commit details" />
      {/* 200: the list header (icon, Changes | Files, two toggles) needs 199px before the title gets any. */}
      <Panel defaultSize={320} minSize={200} maxSize={640} className={w.panel}>
        <ChangedFileList />
      </Panel>
      <Separator className={w.splitH} aria-label="Resize file list" />
      <Panel minSize={200} className={w.panel}>
        <CommitDiff onExpand={target ? (opener) => open({ kind: "diff" }, { returnFocusTo: opener }) : undefined} />
      </Panel>
    </Group>
  );
}

/** `DiffViewer` bound to `diffStore` — or `FileContent` while the Files tab is up (the selected commit's file either way). */
export function CommitDiff({ onExpand }: { onExpand?: (opener: HTMLElement) => void }) {
  const path = useDiffStore((st) => st.selectedPath);
  const file = useDiffStore((st) => st.files.find((f) => f.path === st.selectedPath));
  const diff = useDiffStore((st) => st.diff);
  const loading = useDiffStore((st) => st.diffLoading);
  const error = useDiffStore((st) => st.diffError);
  const target = useDiffStore((st) => st.target);
  const tab = useDiffStore((st) => st.tab);
  const treePath = useDiffStore((st) => st.treeSelectedPath);
  const content = useDiffStore((st) => st.content);
  const contentLoading = useDiffStore((st) => st.contentLoading);
  const contentError = useDiffStore((st) => st.contentError);
  if (tab === "files") return <FileContent path={treePath} content={content} loading={contentLoading} error={contentError} onExpand={onExpand} />;
  return (
    <DiffViewer
      path={path}
      oldPath={file?.oldPath ?? null}
      stats={file ?? null}
      diff={diff}
      loading={loading}
      error={error}
      onExpand={onExpand}
      onOpenExternal={target && path ? () => void openInDiffTool(target, path, file?.oldPath ?? null) : undefined}
    />
  );
}

function CommitDetails() {
  const repoId = useRepoStore((st) => st.repo?.id ?? null);
  const oid = useRepoStore(selectSelectedOid);
  const labels = useRepoStore((st) => (st.selectedIndex === null ? undefined : st.rows[st.selectedIndex]?.labels));
  const revealOid = useRepoStore((st) => st.revealOid);
  // A lightweight tag is just a name — only an annotated one has a message of its own.
  const tags = useRepoStore((st) => st.refs?.tags);
  const annotations = useMemo(() => (tags ?? []).filter((t) => t.oid === oid && t.message), [tags, oid]);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Blank for the round trip: the previous commit's body — or its error — is not this one's.
    setDetail(null);
    setError(null);
    if (!repoId || !oid) return;
    let live = true;
    getCommit(repoId, oid)
      .then((d) => live && setDetail(d))
      .catch((e: unknown) => live && setError(toAppError(e).message));
    return () => {
      live = false;
    };
  }, [repoId, oid]);

  const info = detail?.info;
  // Body = full message minus the summary line.
  const body = detail ? detail.message.replace(/^[^\n]*\n?/, "").trim() : "";
  const committerDiffers = detail && (detail.committerName !== info?.authorName || detail.committerEmail !== info?.authorEmail);

  return (
    <div className={s.commit}>
      <PanelHeader icon={<GitCommitHorizontal size={14} aria-hidden />} title="Commit">
        {info && (
          <IconButton label="Copy SHA" onClick={() => copyText(info.oid, "SHA")}>
            <Copy size={16} aria-hidden />
          </IconButton>
        )}
      </PanelHeader>
      {!oid ? (
        <EmptyState icon={<GitCommitHorizontal size={24} aria-hidden />} title="No commit selected" hint="Select a row in the history" />
      ) : error ? (
        <div className={s.body}>
          <span className={s.error}>{error}</span>
        </div>
      ) : (
        info && (
          <div className={s.body}>
            {labels && labels.length > 0 && (
              <div className={s.chips}>
                <RefChips labels={labels} />
              </div>
            )}
            <div className={`${s.summary} selectable`}>{info.summary}</div>
            {body && <div className={`${s.message} selectable`}>{body}</div>}
            {annotations.map((t) => (
              <div key={t.name} className={s.tagNote}>
                <div className={s.tagName}>
                  <TagIcon size={12} aria-hidden />
                  {t.name}
                </div>
                <div className={`${s.message} selectable`}>{t.message}</div>
              </div>
            ))}
            <div className={s.kv}>
              <Kv k="Author" v={`${info.authorName} <${info.authorEmail}>`} />
              {committerDiffers && <Kv k="Committer" v={`${detail.committerName} <${detail.committerEmail}>`} />}
              <Kv k="Date" v={`${absoluteDate(info.authorTime)} (${relativeDate(info.authorTime)})`} />
              <Kv k="SHA" v={<span className={`${s.mono} selectable`}>{info.oid}</span>} />
              {info.parents.length > 0 && (
                <Kv
                  k={info.parents.length > 1 ? "Parents" : "Parent"}
                  v={info.parents.map((p, i) => (
                    <span key={p}>
                      {i > 0 && " "}
                      <button type="button" className={s.link} title={p} onClick={() => void revealOid(p)}>
                        {p.slice(0, 7)}
                      </button>
                    </span>
                  ))}
                />
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}

/** The gesture's own name for the hint: `mods()` counts ⌘ as Ctrl on macOS, so the text should too. */
const CTRL = /Mac/.test(navigator.userAgent) ? "⌘" : "Ctrl";

/** Ctrl+click compare: the two commits the file list and the diffs are the range between. */
function CompareDetails({ compare }: { compare: { from: CommitInfo; to: CommitInfo } }) {
  return (
    <div className={s.commit}>
      <PanelHeader icon={<GitCompare size={14} aria-hidden />} title="Compare" />
      <div className={s.body}>
        <Kv k="From" v={signature(compare.from)} />
        <Kv k="To" v={signature(compare.to)} />
        <div className={s.hint}>Files and diffs are what the {CTRL}+clicked commit changed relative to the selected one. {CTRL}+click either row to leave.</div>
      </div>
    </div>
  );
}

/** One compared commit on a `Kv` line: its short SHA, summary and age — all of it already in the grid's row. */
function signature(c: CommitInfo) {
  return (
    <>
      <span className={s.mono}>{c.short}</span> {c.summary} · {relativeDate(c.authorTime)}
    </>
  );
}

function Kv({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className={s.kvRow}>
      <span className={s.kvKey}>{k}</span>
      <span className={s.kvVal} title={typeof v === "string" ? v : undefined}>
        {v}
      </span>
    </div>
  );
}
