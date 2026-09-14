import { Archive, Cloud, FolderGit2, GitBranch, Package, PanelLeft, Tag } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import { useRepoStore } from "../../store/repoStore";
import { useViewStore } from "../../store/viewStore";
import { useLayout } from "./layout";
import { Sidebar, type Section } from "./Sidebar";
import s from "./SidebarRail.module.css";

/** The sidebar collapsed to one button per section (spec §2); a click opens that section as a flyout. */
export function SidebarRail() {
  const refs = useRepoStore((st) => st.refs);
  const linked = useRepoStore((st) => st.linked);
  const toggleRail = useViewStore((st) => st.toggleRail);
  const railAuto = useLayout().railAuto;
  const [open, setOpen] = useState<Section | null>(null);
  const rail = useRef<HTMLElement>(null);
  const flyout = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // A row's context menu portals to `body`: a press on one of its items is not a press outside,
      // and closing here would unmount the menu before its click ran.
      if (t instanceof Element && t.closest('[role="menu"]')) return;
      if (!flyout.current?.contains(t) && !rail.current?.contains(t)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const worktrees = linked?.worktrees ?? [];
  const submodules = linked?.submodules ?? [];
  const btn = (section: Section, icon: ReactNode, title: string, count: number) => (
    <button
      type="button"
      className={cx(s.btn, open === section && s.on)}
      aria-label={`${title}, ${count}`}
      aria-expanded={open === section}
      title={title}
      onClick={() => setOpen((o) => (o === section ? null : section))}
    >
      {icon}
      {count > 0 && <span className={s.n}>{count}</span>}
    </button>
  );

  return (
    <div className={s.wrap}>
      {/* A nav, not a `toolbar`: that role promises arrow-key movement between the buttons. */}
      <nav ref={rail} className={s.rail} aria-label="Sidebar sections">
        {btn("local", <GitBranch size={16} aria-hidden />, "Local", refs?.local.length ?? 0)}
        {btn("remotes", <Cloud size={16} aria-hidden />, "Remotes", (refs?.remotes ?? []).reduce((n, r) => n + r.branches.length, 0))}
        {btn("tags", <Tag size={16} aria-hidden />, "Tags", refs?.tags.length ?? 0)}
        {btn("stashes", <Archive size={16} aria-hidden />, "Stashes", refs?.stashes.length ?? 0)}
        {worktrees.length > 1 && btn("worktrees", <FolderGit2 size={16} aria-hidden />, "Worktrees", worktrees.length)}
        {submodules.length > 0 && btn("submodules", <Package size={16} aria-hidden />, "Submodules", submodules.length)}
        <div className={s.grow} />
        <button type="button" className={s.btn} aria-label="Expand sidebar" title="Expand sidebar (Alt+0)" onClick={() => toggleRail(railAuto)}>
          <PanelLeft size={16} aria-hidden />
        </button>
      </nav>
      {open && (
        <div ref={flyout} className={s.flyout}>
          {/* Keyed: the Sidebar seeds "which sections are open" once, on mount, so a switch to another
              section remounts it with that one open. */}
          <Sidebar key={open} only={open} />
        </div>
      )}
    </div>
  );
}
