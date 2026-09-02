import { Check, ChevronDown, ChevronUp, Terminal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button/Button";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../components/ui/PanelHeader/PanelHeader";
import { CommandInput } from "../../components/ui/CommandInput/CommandInput";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { interactiveFlag, splitArgs } from "../../lib/argv";
import { cx } from "../../lib/cx";
import { useCmdHistoryStore } from "../../store/cmdHistoryStore";
import { selectLastOp, selectRunning, useOpsStore, type OpRecord } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { runGit } from "./actions";
import s from "./OutputDock.module.css";

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** Collapsed 28px bar with the last command + status; expanded 200px panel with the streamed lines (screens.mjs dock()). */
export function OutputDock() {
  const ops = useOpsStore((st) => st.ops);
  const last = useOpsStore(selectLastOp);
  const open = useOpsStore((st) => st.open);
  const setOpen = useOpsStore((st) => st.setOpen);
  const cancel = useOpsStore((st) => st.cancel);

  const header = (
    <PanelHeader
      className={cx(s.dock, open && s.dockOpen)}
      icon={<Terminal size={14} aria-hidden />}
      title={<span className={cx(s.cmdText, open && s.cmdTextOpen)}>{last ? `$ ${last.cmd}` : "No output yet"}</span>}
    >
      {last && <OpStatus op={last} />}
      {last?.running && (
        <Button size="sm" onClick={() => void cancel(last.opId)}>
          Cancel
        </Button>
      )}
      <IconButton label={open ? "Collapse output" : "Expand output"} disabled={!last} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
      </IconButton>
    </PanelHeader>
  );
  if (!open) return header;
  return (
    <div className={s.panel}>
      {header}
      <OutputBody ops={ops} />
      <DockPrompt />
    </div>
  );
}

/** `$ git …` line under the log: Enter runs (actions `runGit`), ↑ / ↓ recall earlier lines, disabled while an op runs. */
function DockPrompt() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = useOpsStore(selectRunning);
  const history = useCmdHistoryStore((st) => st.history);
  const refs = useRepoStore((st) => st.refs);

  function run() {
    const parsed = splitArgs(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (parsed.args.length === 0) return;
    const flag = interactiveFlag(parsed.args);
    if (flag) {
      setError(`${flag} needs a terminal`);
      return;
    }
    setText("");
    void runGit(text);
  }

  return (
    <div className={s.prompt}>
      <CommandInput
        aria-label="Run git command"
        placement="up"
        placeholder={busy ? "Running…" : "Type a git command"}
        disabled={busy}
        invalid={error !== null}
        value={text}
        onChange={(v) => {
          setText(v);
          setError(null);
        }}
        onSubmit={run}
        history={history}
        refs={refs}
      />
      {error && <span className={cx(s.xs, s.err)}>{error}</span>}
    </div>
  );
}

/** Elapsed seconds, ticking while the op runs. */
function useElapsed(op: OpRecord): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!op.running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [op.running]);
  return op.elapsedMs ?? now - op.startedAt;
}

function OpStatus({ op }: { op: OpRecord }) {
  const elapsed = useElapsed(op);
  if (op.running) {
    return (
      <>
        <span className={cx(s.xs, s.muted)}>{secs(elapsed)}</span>
        <Spinner size="sm" label="Running" />
      </>
    );
  }
  return <span className={cx(s.xs, op.code === 0 ? s.ok : s.err)}>{exitLine(op)}</span>;
}

/** Style guide §2: an icon, never a dingbat. The exit code keeps colour from being the sole carrier. */
function exitLine(op: OpRecord) {
  const ok = op.code === 0;
  return (
    <>
      {ok ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />} exit {op.code} · {secs(op.elapsedMs ?? 0)}
    </>
  );
}

function OutputBody({ ops }: { ops: OpRecord[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // Rows, not lines: the `$ cmd` header, and the exit line an op only grows once it has finished —
  // counting that one unconditionally left the last line of every op sitting below the fold.
  const rowCount = ops.reduce((n, o) => n + o.lines.length + (o.running ? 1 : 2), 0);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rowCount]);
  return (
    <div ref={ref} className={cx(s.output, "selectable")} role="log" aria-label="Command output">
      {ops.map((op) => (
        <div key={op.opId} className={s.op}>
          <div className={s.cmd}>$ {op.cmd}</div>
          {op.lines.map((l, i) => (
            <div key={i} className={l.kind === "stderr" ? s.stderr : undefined}>
              {l.text}
            </div>
          ))}
          {!op.running && <div className={cx(s.exit, op.code === 0 ? s.ok : s.err)}>{exitLine(op)}</div>}
        </div>
      ))}
    </div>
  );
}
