import { Archive, Bug, Cloud, GitBranch, Tag } from "lucide-react";
import type { RefKind } from "../../../api/types";
import { cx } from "../../../lib/cx";
import s from "./Chip.module.css";

export interface ChipProps {
  kind: RefKind;
  name: string;
  /** Local chip only: the tracking branch at the same commit → `name · ☁ origin` (or `☁ origin/trunk`). */
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
  bisect: Bug,
};

export function Chip({ kind, name, remote, current, title, className }: ChipProps) {
  const Icon = ICONS[kind];
  return (
    // A bisect chip's name *is* its state (`good` / `bad` / `skip`), which is what colours it.
    <span className={cx(s.chip, s[kind], kind === "bisect" && s[name], current && s.current, className)} title={title ?? name}>
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
