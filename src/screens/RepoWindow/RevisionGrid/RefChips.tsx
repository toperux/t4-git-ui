import { useState, type MouseEvent, type ReactNode } from "react";
import type { RefLabel } from "../../../api/types";
import { Chip } from "../../../components/ui/Chip/Chip";
import { ContextMenu, MenuItem } from "../../../components/ui/Menu/Menu";
import s from "./RevisionGrid.module.css";

const MAX_VISIBLE = 3;

/**
 * Ref chips for one row, in label order (HEAD → current → local → remote → tag).
 * The current branch renders as a HEAD chip followed by its own chip; a synced
 * tracking remote becomes the chip's `.rem` segment. Max 3 chips, then `+N`,
 * which opens a popover listing the rest (style guide §4).
 */
export function RefChips({ labels }: { labels: RefLabel[] }) {
  // Rows live in a virtualized `overflow: auto` container, so the popover is portalled to a
  // viewport point (`ContextMenu`) rather than dropped in flow, which would be clipped.
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

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

  // The chip is its own control: clicking it must not move the grid selection.
  function openPopover(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setAt({ x: r.left, y: r.bottom + 2 });
  }

  return (
    <span className={s.chips}>
      {chips.slice(0, MAX_VISIBLE).map((c) => c.node)}
      {hidden.length > 0 && (
        <>
          <button
            type="button"
            className={s.moreChip}
            aria-haspopup="menu"
            aria-expanded={at !== null}
            title={`${hidden.length} more ref${hidden.length === 1 ? "" : "s"}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={openPopover}
          >
            <Chip kind="remote" name={`+${hidden.length}`} title={`${hidden.length} more`} />
          </button>
          <ContextMenu at={at} onClose={() => setAt(null)} label="More refs">
            {hidden.map((c) => (
              <MenuItem key={c.name} onClick={() => setAt(null)}>
                {c.name}
              </MenuItem>
            ))}
          </ContextMenu>
        </>
      )}
    </span>
  );
}
