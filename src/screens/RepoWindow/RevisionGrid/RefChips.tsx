import type { ReactNode } from "react";
import type { RefLabel } from "../../../api/types";
import { Chip } from "../../../components/ui/Chip/Chip";
import s from "./RevisionGrid.module.css";

const MAX_VISIBLE = 3;

/**
 * Ref chips for one row, in label order (HEAD → current → local → remote → tag).
 * The current branch renders as a HEAD chip followed by its own chip; a synced
 * tracking remote becomes the chip's `.rem` segment. Max 3 chips, then `+N`.
 */
export function RefChips({ labels }: { labels: RefLabel[] }) {
  if (labels.length === 0) return null;
  const chips: { name: string; node: ReactNode }[] = [];
  for (const l of labels) {
    if (l.isCurrent) chips.push({ name: "HEAD", node: <Chip key="HEAD" kind="head" name="HEAD" title="HEAD" /> });
    const title = l.remote ? `${l.name} (synced with ${l.remote})` : l.name;
    chips.push({
      name: l.name,
      node: <Chip key={`${l.kind}:${l.name}`} kind={l.kind} name={l.name} remote={l.remote} current={l.isCurrent} title={title} />,
    });
  }
  const hidden = chips.slice(MAX_VISIBLE);
  return (
    <span className={s.chips}>
      {chips.slice(0, MAX_VISIBLE).map((c) => c.node)}
      {hidden.length > 0 && <Chip kind="remote" name={`+${hidden.length}`} title={hidden.map((c) => c.name).join(", ")} />}
    </span>
  );
}
