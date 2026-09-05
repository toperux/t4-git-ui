import { Check, GitCommitHorizontal, History, Maximize2, TriangleAlert } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
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
import { useMerging, useStatusStore } from "../../../store/statusStore";
import s from "./CommitPanel.module.css";

export const SUMMARY_LIMIT = 72;

export interface MessageColumnProps {
  /**
   * Header button that opens the commit dialog (the panel has one; the dialog itself doesn't).
   * Takes the button, which the dialog names as its opener — see `commitAndPush`.
   */
  onExpand?: (opener: HTMLElement) => void;
  /** Runs after a successful Commit — the dialog closes itself with it. */
  onCommitted?: () => void;
  /** Focus the summary on mount. */
  autoFocus?: boolean;
}

/** Message editor (summary + body), amend / sign-off, author line, Commit (Ctrl+Enter). */
export function MessageColumn({ onExpand, onCommitted, autoFocus }: MessageColumnProps) {
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
  const merging = useMerging();

  const author = useCommitStore((st) => st.author);
  const authorError = useCommitStore((st) => st.authorError);
  const loadAuthor = useCommitStore((st) => st.loadAuthor);
  useEffect(() => void loadAuthor(), [loadAuthor, repoId]);

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
  const canCommit = !busy && !!summary.trim() && (stagedCount > 0 || amend || merging) && !noIdentity;

  /** An amend keeps a non-empty editor no longer, but the oid is the only reliable success signal. */
  async function commitOnly() {
    if (await commit()) onCommitted?.();
  }

  /** Commits, then opens the Push dialog (which carries the remote / upstream options). */
  async function commitAndPush() {
    if (!canCommit || running) return;
    // Read before `onCommitted` closes the commit dialog (which clears it): Push hands focus back to
    // that dialog's opener, not to this button — it unmounts with the dialog. Every path that opens
    // the window names one, or this is null and Push falls back to the doomed button.
    const returnFocusTo = useDialogStore.getState().returnFocus;
    if (await commit()) {
      onCommitted?.();
      useDialogStore.getState().open({ kind: "push" }, { returnFocusTo });
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canCommit) {
      e.preventDefault();
      void commitOnly();
    }
  }

  return (
    <div className={s.col}>
      <PanelHeader icon={<GitCommitHorizontal size={14} aria-hidden />} title="Commit message">
        {onExpand && (
          <IconButton label="Open commit window" onClick={(e) => onExpand(e.currentTarget)}>
            <Maximize2 size={16} aria-hidden />
          </IconButton>
        )}
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
              autoFocus={autoFocus}
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
          <Button variant="primary" className={s.commitBtn} icon={<Check size={14} aria-hidden />} disabled={!canCommit} onClick={() => void commitOnly()}>
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
