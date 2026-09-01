import { Copy, GitCommitHorizontal, Tag as TagIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { getCommit, toAppError } from "../../api/ipc";
import type { CommitDetail } from "../../api/types";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../components/ui/PanelHeader/PanelHeader";
import { absoluteDate, relativeDate } from "../../lib/relativeDate";
import { useDiffStore } from "../../store/diffStore";
import { selectSelectedOid, useRepoStore } from "../../store/repoStore";
import { copyText } from "./actions";
import { ChangedFileList } from "./ChangedFileList/ChangedFileList";
import s from "./DetailsPane.module.css";
import { DiffViewer } from "./DiffViewer/DiffViewer";
import w from "./RepoWindow.module.css";
import { RefChips } from "./RevisionGrid/RefChips";

export function DetailsPane() {
  const repoId = useRepoStore((st) => st.repo?.id ?? null);
  const oid = useRepoStore(selectSelectedOid);
  const loadCommit = useDiffStore((st) => st.loadCommit);
  useEffect(() => {
    void loadCommit(repoId, oid);
  }, [repoId, oid, loadCommit]);

  return (
    <Group orientation="horizontal" className={s.pane}>
      <Panel defaultSize={340} minSize={240} maxSize={560} className={w.panel}>
        <CommitDetails />
      </Panel>
      <Separator className={w.splitH} aria-label="Resize commit details" />
      <Panel defaultSize={320} minSize={180} maxSize={640} className={w.panel}>
        <ChangedFileList />
      </Panel>
      <Separator className={w.splitH} aria-label="Resize file list" />
      <Panel minSize={200} className={w.panel}>
        <CommitDiff />
      </Panel>
    </Group>
  );
}

/** `DiffViewer` bound to `diffStore` (the selected commit's file). */
function CommitDiff() {
  const path = useDiffStore((st) => st.selectedPath);
  const file = useDiffStore((st) => st.files.find((f) => f.path === st.selectedPath));
  const diff = useDiffStore((st) => st.diff);
  const loading = useDiffStore((st) => st.diffLoading);
  const error = useDiffStore((st) => st.diffError);
  return <DiffViewer path={path} oldPath={file?.oldPath ?? null} stats={file ?? null} diff={diff} loading={loading} error={error} />;
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
    if (!repoId || !oid) {
      setDetail(null);
      setError(null);
      return;
    }
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
