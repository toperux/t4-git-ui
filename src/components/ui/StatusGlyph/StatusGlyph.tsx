import type { FileStatus } from "../../../api/types";
import { cx } from "../../../lib/cx";
import s from "./StatusGlyph.module.css";

/** Letter + colour class per status. `copied` shares the renamed colour, `typechange` the modified one. */
const GLYPH: Record<FileStatus, { letter: string; cls: string; label: string }> = {
  added: { letter: "A", cls: s.A, label: "Added" },
  modified: { letter: "M", cls: s.M, label: "Modified" },
  deleted: { letter: "D", cls: s.D, label: "Deleted" },
  renamed: { letter: "R", cls: s.R, label: "Renamed" },
  copied: { letter: "C", cls: s.R, label: "Copied" },
  typechange: { letter: "T", cls: s.M, label: "Type changed" },
  untracked: { letter: "U", cls: s.U, label: "Untracked" },
  conflicted: { letter: "C", cls: s.C, label: "Conflicted" },
  ignored: { letter: "I", cls: s.U, label: "Ignored" },
};

/** 16×16 mono xs 600 letter (style guide `StatusGlyph`). */
export function StatusGlyph({ status }: { status: FileStatus }) {
  const g = GLYPH[status];
  return (
    <span className={cx(s.glyph, g.cls)} title={g.label} aria-label={g.label} role="img">
      {g.letter}
    </span>
  );
}
