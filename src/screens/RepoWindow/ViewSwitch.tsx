import { GitCommitHorizontal, History } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import { selectChangeCount, useStatusStore } from "../../store/statusStore";
import { useViewStore, type View } from "../../store/viewStore";
import s from "./ViewSwitch.module.css";

/** The History | Changes segmented switch (spec §1). `compact` = icons only (toolbar `icons` tier). */
export function ViewSwitch({ compact = false }: { compact?: boolean }) {
  const view = useViewStore((st) => st.view);
  const setView = useViewStore((st) => st.setView);
  const changes = useStatusStore(selectChangeCount);
  const seg = (v: View, icon: ReactNode, label: string, name: string, kbd: string, count?: number) => (
    <button
      type="button"
      className={cx(s.seg, view === v && s.on)}
      aria-pressed={view === v}
      aria-label={name}
      title={`${label} (${kbd})`}
      onClick={() => setView(v)}
    >
      <span className={s.icon}>{icon}</span>
      {!compact && <span>{label}</span>}
      {count ? <span className={s.cnt}>{count}</span> : null}
    </button>
  );
  const changesName = changes ? `Changes, ${changes} change${changes === 1 ? "" : "s"}` : "Changes";
  return (
    <div className={s.switch} role="group" aria-label="View">
      {seg("history", <History size={14} aria-hidden />, "History", "History", "Alt+1")}
      {seg("changes", <GitCommitHorizontal size={14} aria-hidden />, "Changes", changesName, "Alt+2", changes)}
    </div>
  );
}
