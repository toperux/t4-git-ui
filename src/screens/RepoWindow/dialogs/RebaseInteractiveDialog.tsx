// Interactive rebase: git writes the todo, this dialog edits it, git replays it (docs/plans/2026-09-07-interactive-rebase.md).
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import * as ipc from "../../../api/ipc";
import { toAppError } from "../../../api/ipc";
import type { RebaseTodo } from "../../../api/types";
import { Button } from "../../../components/ui/Button/Button";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox";
import { Dialog, DialogText, Options } from "../../../components/ui/Dialog/Dialog";
import { IconButton } from "../../../components/ui/IconButton/IconButton";
import { Select } from "../../../components/ui/Input/Input";
import { cx } from "../../../lib/cx";
import { runOp } from "../../../store/opsStore";
import { useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { gitCmd, rebaseInteractiveArgs } from "./gitArgs";
import s from "./RebaseInteractiveDialog.module.css";
import {
  ACTIONS,
  buildItems,
  canMoveDown,
  canMoveUp,
  canSquash,
  defaultMessage,
  groupOf,
  isPickRow,
  moveRow,
  needsMessage,
  rowCommit,
  toSteps,
  updateRefsSupported,
  validate,
  type Action,
  type Item,
} from "./rebaseTodo";

export function RebaseInteractiveDialog({ onClose, base, ontoLabel }: { onClose: () => void; base: string; ontoLabel?: string }) {
  const refs = useRepoStore((st) => st.refs);
  const current = refs?.local.find((b) => b.isHead)?.name ?? "HEAD";
  const supported = updateRefsSupported(useRepoStore((st) => st.gitVersion));
  // The read step runs `git rebase -i` for real, so a dirty tree needs `--autostash` or git refuses.
  // Decided once, at open: a status change while the dialog is up must not re-read the todo
  // under the user's edits (a later dirty tree fails the run with git's own message instead).
  const dirty = useStatusStore((st) => (st.status ? st.status.staged + st.status.unstaged : 0)) > 0;
  const [autostash] = useState(dirty);
  const [confirmed, setConfirmed] = useState(!autostash);
  const [rebaseMerges, setRebaseMerges] = useState(true);
  const [updateRefs, setUpdateRefs] = useState(false);
  const [todo, setTodo] = useState<RebaseTodo | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  // True until the first read lands, or the empty `items` read as "Nothing to rebase" for one paint.
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<number | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  // Flatten reloads without merge lines, so the notice would take its own radios away with it.
  const [sawMerges, setSawMerges] = useState(0);

  useEffect(() => {
    if (!confirmed) return;
    const id = useRepoStore.getState().repo?.id;
    if (!id) return;
    let live = true;
    setLoading(true);
    setError(null);
    // Read with `--update-refs` whenever git has it: the checkbox only decides whether those lines go back.
    // `!ontoLabel` is the from-here open (the commit row); the backend refuses such a base when it is
    // not in HEAD's history — the row may sit on another branch in the All-branches view.
    void ipc.rebaseTodo(id, base, autostash, rebaseMerges, supported, !ontoLabel).then(
      (t) => {
        if (!live) return;
        const next = buildItems(t.lines);
        setTodo(t);
        setItems(next);
        setSel(null);
        setLoading(false);
        const merges = next.filter((it) => it.kind === "row" && it.line.kind === "merge").length;
        if (merges > 0) setSawMerges(merges);
      },
      (e) => {
        if (!live) return;
        setError(toAppError(e).message);
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [confirmed, rebaseMerges, base, autostash, supported, ontoLabel]);

  const problem = loading || error ? null : validate(items, messages);
  const preview = gitCmd(rebaseInteractiveArgs(base, autostash, rebaseMerges, updateRefs));
  const group = sel === null ? [] : groupOf(items, sel);
  const head = group.length > 0 ? items[group[0]] : undefined;
  const headCommit = isPickRow(head) ? rowCommit(head) : null;
  const showMessage = sel !== null && isPickRow(items[sel]) && needsMessage(items, group);

  function move(i: number, dir: -1 | 1) {
    const next = moveRow(items, i, dir);
    if (next === items) return;
    setItems(next);
    setSel(i + dir);
  }

  // Alt+↑ / Alt+↓ on the focused row; the rows are keyed by oid, so the moved one keeps the focus.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!e.altKey || sel === null || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    move(sel, e.key === "ArrowUp" ? -1 : 1);
  }

  function setAction(i: number, action: Action) {
    setItems(items.map((it, j) => (j === i && it.kind === "row" ? { ...it, action } : it)));
  }

  function submit() {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    if (!todo || loading || error || problem) return;
    onClose();
    const steps = toSteps(items, messages, updateRefs);
    void runOp(`Rebasing ${current}…`, (id) => ipc.rebaseInteractive(id, todo.head, todo.baseOid, base, steps, autostash, rebaseMerges, updateRefs), {
      success: `Rebased ${current}`,
    });
  }

  return (
    <Dialog
      title={ontoLabel ? `Rebase ${current} onto ${ontoLabel}` : `Rebase ${current}`}
      wide
      onClose={onClose}
      onSubmit={submit}
      preview={preview}
      footer={
        confirmed ? (
          <>
            {problem && <span className={s.problem}>{problem}</span>}
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={loading || !!error || !!problem}>
              Rebase
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit">
              Stash and continue
            </Button>
          </>
        )
      }
    >
      {!confirmed ? (
        <DialogText>Uncommitted changes will be stashed before the rebase and restored after it.</DialogText>
      ) : loading ? (
        <DialogText>Loading…</DialogText>
      ) : error ? (
        <DialogText>{error}</DialogText>
      ) : (
        <>
          <div className={s.list} onKeyDown={onKeyDown}>
            {items.map((it, i) => {
              if (it.kind === "hidden") return null;
              const c = rowCommit(it);
              const merge = it.line.kind === "merge";
              return (
                <div
                  key={merge ? `m${i}` : c!.oid}
                  className={cx(s.row, sel === i && s.rowActive)}
                  onClick={() => setSel(i)}
                  onFocus={() => setSel(i)}
                >
                  {merge ? (
                    <span className={s.fixed}>merge</span>
                  ) : (
                    <Select className={s.action} aria-label={`Action for ${c!.short}`} value={it.action} onChange={(e) => setAction(i, e.target.value as Action)}>
                      {ACTIONS.map((a) => {
                        const off = (a === "squash" || a === "fixup") && !canSquash(items, i);
                        return (
                          <option key={a} value={a} disabled={off} title={off ? "No commit above to squash into" : undefined}>
                            {a}
                          </option>
                        );
                      })}
                    </Select>
                  )}
                  {!merge && <span className={s.short}>{c!.short}</span>}
                  <span className={s.subject} title={c?.summary}>
                    {c?.summary ?? it.line.text}
                  </span>
                  {!merge && (
                    <>
                      <IconButton label="Move up" disabled={!canMoveUp(items, i)} onClick={() => move(i, -1)}>
                        <ArrowUp size={14} aria-hidden />
                      </IconButton>
                      <IconButton label="Move down" disabled={!canMoveDown(items, i)} onClick={() => move(i, 1)}>
                        <ArrowDown size={14} aria-hidden />
                      </IconButton>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {showMessage && headCommit && (
            <textarea
              className={cx(s.message, "selectable")}
              aria-label={`Message for ${headCommit.short}`}
              value={messages[headCommit.oid] ?? defaultMessage(items, group)}
              onChange={(e) => setMessages({ ...messages, [headCommit.oid]: e.target.value })}
            />
          )}
          {sawMerges > 0 && (
            <>
              <DialogText>
                {sawMerges} merge commit{sawMerges === 1 ? "" : "s"} in this range
              </DialogText>
              <div className={s.radios}>
                <label className={s.radio}>
                  <input type="radio" name="merges" checked={rebaseMerges} onChange={() => setRebaseMerges(true)} />
                  Keep merges
                </label>
                <label className={s.radio}>
                  <input type="radio" name="merges" checked={!rebaseMerges} onChange={() => setRebaseMerges(false)} />
                  Flatten
                </label>
              </div>
            </>
          )}
          {supported && (
            <Options>
              <Checkbox checked={updateRefs} onChange={setUpdateRefs} title="Branches inside the replayed range follow their commit">
                Update branches that point into this range (--update-refs)
              </Checkbox>
            </Options>
          )}
        </>
      )}
    </Dialog>
  );
}
