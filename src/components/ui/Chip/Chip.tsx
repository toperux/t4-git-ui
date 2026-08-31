import { Archive, Cloud, GitBranch, Tag } from "lucide-react";
import type { RefKind } from "../../../api/types";
import { cx } from "../../../lib/cx";
import s from "./Chip.module.css";

export interface ChipProps {
  kind: RefKind;
  name: string;
  /** Local chip only: remote(s) whose tracking branch is at the same commit → `name · ☁ origin`. */
  remote?: string | null;
  /** Checked-out branch: inset ring + semibold. */
  current?: boolean;
  title?: string;
  className?: string;
}

const ICONS: Partial<Record<RefKind, typeof GitBranch>> = {
  local: GitBranch,
  remote: Cloud,
  tag: Tag,
  stash: Archive,
};

export function Chip({ kind, name, remote, current, title, className }: ChipProps) {
  const Icon = ICONS[kind];
  return (
    <span className={cx(s.chip, s[kind], current && s.current, className)} title={title ?? name}>
      {Icon && <Icon size={11} aria-hidden />}
      {name}
      {remote && (
        <span className={s.rem}>
          <Cloud size={11} aria-hidden />
          {remote}
        </span>
      )}
    </span>
  );
}
