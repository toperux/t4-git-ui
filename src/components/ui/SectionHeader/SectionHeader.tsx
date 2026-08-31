import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "../Badge/Badge";
import s from "./SectionHeader.module.css";

export interface SectionHeaderProps {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  /** Extra controls between the title and the count. */
  children?: ReactNode;
}

export function SectionHeader({ title, count, open, onToggle, children }: SectionHeaderProps) {
  return (
    <button type="button" className={s.header} aria-expanded={open} onClick={onToggle}>
      <span className={s.tw}>{open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}</span>
      <span className={s.title}>{title}</span>
      {children}
      {count !== undefined && <Badge>{count}</Badge>}
    </button>
  );
}
