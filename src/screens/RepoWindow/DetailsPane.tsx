import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, FileDiff, Files, GitCommitHorizontal } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getCommit, toAppError } from "../../api/ipc";
import type { CommitDetail } from "../../api/types";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../components/ui/PanelHeader/PanelHeader";
import { absoluteDate, relativeDate } from "../../lib/relativeDate";
import { selectSelectedOid, useRepoStore } from "../../store/repoStore";
import { RefChips } from "./RevisionGrid/RefChips";
import s from "./DetailsPane.module.css";

export function DetailsPane() {
  return (
    <div className={s.pane}>
      <CommitPanel />
      <div className={s.files}>
        <PanelHeader icon={<Files size={14} aria-hidden />} title="Files" />
        <EmptyState icon={<Files size={24} aria-hidden />} title="Changed files arrive in M2" />
      </div>
      <div className={s.diff}>
        <PanelHeader icon={<FileDiff size={14} aria-hidden />} title="Diff" />
        <EmptyState icon={<FileDiff size={24} aria-hidden />} title="Diff viewer arrives in M2" />
      </div>
    </div>
  );
}

function CommitPanel() {
  const repoId = useRepoStore((st) => st.repo?.id ?? null);
  const oid = useRepoStore(selectSelectedOid);
  const labels = useRepoStore((st) => (st.selectedIndex === null ? undefined : st.rows[st.selectedIndex]?.labels));
  const revealOid = useRepoStore((st) => st.revealOid);
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
          <IconButton label="Copy SHA" onClick={() => void writeText(info.oid)}>
            <Copy size={14} aria-hidden />
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
