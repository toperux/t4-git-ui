import { ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button/Button";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { PanelHeader } from "../../components/ui/PanelHeader/PanelHeader";
import { Spinner } from "../../components/ui/Spinner/Spinner";
import { cx } from "../../lib/cx";
import { selectLastOp, useOpsStore, type OpRecord } from "../../store/opsStore";
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
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
      </IconButton>
    </PanelHeader>
  );
  if (!open) return header;
  return (
    <div className={s.panel}>
      {header}
      <OutputBody ops={ops} />
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

const exitLine = (op: OpRecord) => `${op.code === 0 ? "✓" : "✗"} exit ${op.code} · ${secs(op.elapsedMs ?? 0)}`;

function OutputBody({ ops }: { ops: OpRecord[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const lineCount = ops.reduce((n, o) => n + o.lines.length + 2, 0);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lineCount]);
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
          {!op.running && <div className={op.code === 0 ? s.ok : s.err}>{exitLine(op)}</div>}
        </div>
      ))}
    </div>
  );
}
