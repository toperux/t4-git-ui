import { ChevronDown, ChevronRight } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Badge } from "../Badge/Badge";
import s from "./SectionHeader.module.css";

/** `title` is the heading text, not the button's tooltip, so it is not one of the spread attributes. */
export interface SectionHeaderProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title" | "children"> {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  /** Extra controls between the title and the count. */
  children?: ReactNode;
}

export function SectionHeader({ title, count, open, onToggle, children, ...rest }: SectionHeaderProps) {
  return (
    <button type="button" className={s.header} aria-expanded={open} onClick={onToggle} {...rest}>
      <span className={s.tw}>{open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}</span>
      <span className={s.title}>{title}</span>
      {children}
      {count !== undefined && <Badge>{count}</Badge>}
    </button>
  );
}
