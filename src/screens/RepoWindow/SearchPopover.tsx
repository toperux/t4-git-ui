import { Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { Input, Select } from "../../components/ui/Input/Input";
import s from "./Toolbar.module.css";

export interface SearchPopoverProps {
  text: string;
  onText: (text: string) => void;
  spec: "all" | "head";
  onSpec: (spec: string) => void;
  /** The file-history chip, when there is one — it belongs beside the search box. */
  children?: ReactNode;
}

/** The `icons` tier's search: an icon button, and the search box + branch filter in a panel under it. */
export function SearchPopover({ text, onText, spec, onSpec, children }: SearchPopoverProps) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 4, right: window.innerWidth - r.right });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <IconButton ref={btn} label="Search commits" on={open || text.trim() !== ""} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Search size={16} aria-hidden />
      </IconButton>
      {open &&
        createPortal(
          <div ref={panel} className={s.searchPopover} style={{ top: at.top, right: at.right }} role="group" aria-label="Search commits">
            {children}
            <Input
              autoFocus
              icon={<Search size={14} aria-hidden />}
              type="search"
              placeholder="Search commits"
              aria-label="Search commits"
              value={text}
              onChange={(e) => onText(e.target.value)}
              spellCheck={false}
            />
            <Select aria-label="Branch filter" value={spec} onChange={(e) => onSpec(e.target.value)}>
              <option value="all">All branches</option>
              <option value="head">HEAD</option>
            </Select>
          </div>,
          document.body,
        )}
    </>
  );
}
