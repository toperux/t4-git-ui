import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { cx } from "../../../lib/cx";
import s from "./TreeRow.module.css";

/** Put on the scrollable pane so selected rows use `--bg-selected` only while it owns focus. */
export const TREE_PANE_CLASS = s.pane;

export interface TreeRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  depth?: number;
  /** `undefined` = leaf (empty chevron slot). */
  expanded?: boolean;
  /** 14px kind icon. */
  icon?: ReactNode;
  label: ReactNode;
  /** Right-aligned meta (ahead/behind, badges). */
  meta?: ReactNode;
  selected?: boolean;
  /** Current branch: semibold. */
  current?: boolean;
}

export function TreeRow({ depth = 0, expanded, icon, label, meta, selected, current, className, style, type = "button", ...rest }: TreeRowProps) {
  const chevron = expanded === undefined ? null : expanded ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />;
  return (
    <button
      type={type}
      className={cx(s.row, selected && s.selected, className)}
      style={{ ...style, "--d": depth } as CSSProperties}
      aria-selected={selected || undefined}
      aria-expanded={expanded}
      {...rest}
    >
      <span className={s.tw}>{chevron}</span>
      {icon && <span className={s.icon}>{icon}</span>}
      <span className={cx(s.label, current && s.current)}>{label}</span>
      {meta && <span className={s.meta}>{meta}</span>}
    </button>
  );
}

/** `↑2 ↓5` — renders nothing when both are 0. */
export function AheadBehind({ ahead, behind }: { ahead: number; behind: number }) {
  if (!ahead && !behind) return null;
  return (
    <span className={s.ab} title={`${ahead} ahead, ${behind} behind`}>
      {ahead > 0 && (
        <>
          <ArrowUp size={12} aria-hidden />
          {ahead}
        </>
      )}
      {behind > 0 && (
        <>
          <ArrowDown size={12} aria-hidden />
          {behind}
        </>
      )}
    </span>
  );
}
