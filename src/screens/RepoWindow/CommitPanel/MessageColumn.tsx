import { Check, GitCommitHorizontal, History, TriangleAlert } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { getAuthor, toAppError } from "../../../api/ipc";
import type { AppError, Author } from "../../../api/types";
import { Button } from "../../../components/ui/Button/Button";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { Menu, MenuItem } from "../../../components/ui/Menu/Menu";
import { PanelHeader } from "../../../components/ui/PanelHeader/PanelHeader";
import { cx } from "../../../lib/cx";
import { loadHistory, splitMessage } from "../../../lib/msgHistory";
import { useCommitStore } from "../../../store/commitStore";
import { useDialogStore } from "../../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import s from "./CommitPanel.module.css";

export const SUMMARY_LIMIT = 72;

/** Message editor (summary + body), amend / sign-off, author line, Commit (Ctrl+Enter). */
export function MessageColumn() {
  const repoId = useRepoStore((st) => st.repo?.id ?? null);
  const summary = useCommitStore((st) => st.summary);
  const body = useCommitStore((st) => st.body);
  const amend = useCommitStore((st) => st.amend);
  const signoff = useCommitStore((st) => st.signoff);
  const busy = useCommitStore((st) => st.busy);
  const running = useOpsStore(selectRunning);
  const setSummary = useCommitStore((st) => st.setSummary);
  const setBody = useCommitStore((st) => st.setBody);
  const setSignoff = useCommitStore((st) => st.setSignoff);
  const setAmend = useCommitStore((st) => st.setAmend);
  const useMessage = useCommitStore((st) => st.useMessage);
  const commit = useCommitStore((st) => st.commit);
  const stagedCount = useStatusStore((st) => st.status?.staged ?? 0);

  const [author, setAuthor] = useState<Author | null>(null);
  const [authorError, setAuthorError] = useState<AppError | null>(null);
  useEffect(() => {
    setAuthor(null);
    setAuthorError(null);
    if (!repoId) return;
    let live = true;
    getAuthor(repoId)
      .then((a) => live && setAuthor(a))
      .catch((e: unknown) => live && setAuthorError(toAppError(e)));
    return () => {
      live = false;
    };
  }, [repoId]);

  const [histOpen, setHistOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  function toggleHistory() {
    if (histOpen) setHistOpen(false);
    else {
      setHistory(repoId ? loadHistory(repoId) : []);
      setHistOpen(true);
    }
  }

  const noIdentity = authorError?.kind === "config";
  const canCommit = !busy && !!summary.trim() && (stagedCount > 0 || amend) && !noIdentity;

  /** Commits, then opens the Push dialog (which carries the remote / upstream options). */
  async function commitAndPush() {
    if (!canCommit || running) return;
    // An amend keeps a non-empty editor no longer, but the oid is the only reliable success signal.
    if (await commit()) useDialogStore.getState().open({ kind: "push" });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canCommit) {
      e.preventDefault();
      void commit();
    }
  }

  return (
    <div className={s.col}>
      <PanelHeader icon={<GitCommitHorizontal size={14} aria-hidden />} title="Commit message">
        <Menu
          open={histOpen}
          onClose={() => setHistOpen(false)}
          label="Message history"
          anchor={
            <IconButton label="Message history" on={histOpen} onClick={toggleHistory}>
              <History size={16} aria-hidden />
            </IconButton>
          }
        >
          {history.length === 0 ? (
            <MenuItem disabled>No recent messages</MenuItem>
          ) : (
            history.map((m, i) => (
              <MenuItem
                key={i}
                title={m}
                onClick={() => {
                  useMessage(m);
                  setHistOpen(false);
                }}
              >
                {splitMessage(m).summary}
              </MenuItem>
            ))
          )}
        </Menu>
      </PanelHeader>
      <div className={s.msgBody} onKeyDown={onKeyDown}>
        <div className={s.editor}>
          <div className={s.summaryRow}>
            <input
              className={cx(s.summary, "selectable")}
              value={summary}
              onChange={(e) => setSummary(e.target.value.replace(/[\r\n]+/g, " "))}
              placeholder="Summary"
              aria-label="Summary"
              /* `readOnly`, not `disabled`: a stage/unstage landing mid-typing must not steal focus. */
              readOnly={busy}
              aria-busy={busy}
            />
            <span className={cx(s.counter, summary.length > SUMMARY_LIMIT && s.over)} aria-label={`${summary.length} of ${SUMMARY_LIMIT} characters`}>
              {summary.length}/{SUMMARY_LIMIT}
            </span>
          </div>
          <textarea
            className={cx(s.body, "selectable")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Body — what and why. Wrap at 72."
            aria-label="Body"
            readOnly={busy}
            aria-busy={busy}
          />
        </div>
        <div className={s.checks}>
          <Checkbox checked={amend} onChange={(v) => void setAmend(v)} disabled={busy}>
            Amend last commit
          </Checkbox>
          <Checkbox checked={signoff} onChange={setSignoff} disabled={busy}>
            Add Signed-off-by
          </Checkbox>
        </div>
        {noIdentity ? (
          <div className={cx(s.author, s.warn)} role="alert">
            <TriangleAlert size={12} aria-hidden />
            Set user.name and user.email
          </div>
        ) : authorError ? (
          <div className={s.author}>{authorError.message}</div>
        ) : (
          author && (
            <div className={s.author} title={`${author.name} <${author.email}>`}>
              {author.name} &lt;{author.email}&gt; · will commit {stagedCount} staged file{stagedCount === 1 ? "" : "s"}
            </div>
          )
        )}
        <div className={s.actions}>
          <Button variant="primary" className={s.commitBtn} icon={<Check size={14} aria-hidden />} disabled={!canCommit} onClick={() => void commit()}>
            Commit
          </Button>
          <Button disabled={!canCommit || running} title={running ? "Operation in progress" : "Commit, then open the Push dialog"} onClick={() => void commitAndPush()}>
            Commit &amp; Push
          </Button>
        </div>
      </div>
    </div>
  );
}
