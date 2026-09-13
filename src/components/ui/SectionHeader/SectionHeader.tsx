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
  /** Extra controls beside the header, outside its button (a stash browser opener, say). */
  children?: ReactNode;
}

export function SectionHeader({ title, count, open, onToggle, children, ...rest }: SectionHeaderProps) {
  // The band is the wrapper, not the button: `children` is a control of its own and a button cannot
  // nest inside one.
  return (
    <div className={s.wrap}>
      <button type="button" className={s.header} aria-expanded={open} onClick={onToggle} {...rest}>
        <span className={s.tw}>{open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}</span>
        <span className={s.title}>{title}</span>
        {count !== undefined && <Badge>{count}</Badge>}
      </button>
      {children}
    </div>
  );
}
