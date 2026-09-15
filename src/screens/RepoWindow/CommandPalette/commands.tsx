import { Archive, ArrowDown, ArrowDownUp, ArrowUp, Cloud, ExternalLink, FolderGit2, FolderOpen, GitBranch, GitCommitHorizontal, GitMerge, History, PanelLeft, Plus, RefreshCw, Settings, Terminal, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Branch, Remote, Stash } from "../../../api/types";
import type { DialogSpec } from "../../../store/dialogStore";
import type { RecentRepo } from "../../../store/recentsStore";

export type Group = "Recent" | "Views" | "Repository" | "Branch" | "Stash" | "Network" | "Go to branch" | "Repositories" | "Window";

export interface Command {
  /** Stable across builds: what Recent remembers (`view.changes`, `goto.origin/main`). */
  id: string;
  group: Group;
  label: string;
  icon?: ReactNode;
  kbd?: string;
  /** Why it cannot run right now — the item is disabled and this is its title. */
  disabled?: string;
  run(): void;
}

/** Everything the commands read, gathered by `CommandPalette` from the stores when it opens. */
export interface CommandContext {
  running: boolean;
  repoPath: string | null;
  local: Branch[];
  remotes: Remote[];
  stashes: Stash[];
  recents: RecentRepo[];
  changes: number;
  tabCount: number;
  setView(view: "history"): void;
  openChanges(): void;
  openDialog(spec: DialogSpec): void;
  revealOid(oid: string): void;
  switchRepo(path: string): void;
  pickAndOpenRepo(): void;
  fetchDefault(): void;
  stashPop(index: number): void;
  stashApply(index: number): void;
  refreshAll(): void;
  toggleRail(): void;
  detachTab(): void;
  closeTab(): void;
}

const BUSY = "Operation in progress";

export function buildCommands(ctx: CommandContext): Command[] {
  const busy = ctx.running ? BUSY : undefined;
  const dialog = (spec: DialogSpec) => () => ctx.openDialog(spec);
  const latest = ctx.stashes[0];
  const noStash = latest ? undefined : "No stashes";
  return [
    { id: "view.history", group: "Views", label: "History", icon: <History size={16} aria-hidden />, kbd: "Alt+1", run: () => ctx.setView("history") },
    { id: "view.changes", group: "Views", label: ctx.changes ? `Changes (${ctx.changes})` : "Changes", icon: <GitCommitHorizontal size={16} aria-hidden />, kbd: "Alt+2", run: () => ctx.openChanges() },
    { id: "repo.commit", group: "Repository", label: "Commit…", icon: <GitCommitHorizontal size={16} aria-hidden />, run: dialog({ kind: "commit" }) },
    { id: "repo.addRemote", group: "Repository", label: "Add remote…", icon: <Cloud size={16} aria-hidden />, disabled: busy, run: dialog({ kind: "addRemote" }) },
    { id: "repo.addWorktree", group: "Repository", label: "Add worktree…", icon: <FolderGit2 size={16} aria-hidden />, disabled: busy, run: dialog({ kind: "addWorktree" }) },
    { id: "repo.run", group: "Repository", label: "Run git command…", icon: <Terminal size={16} aria-hidden />, kbd: "Ctrl+Shift+R", disabled: busy, run: dialog({ kind: "runCommand" }) },
    { id: "repo.open", group: "Repository", label: "Open repository…", icon: <FolderOpen size={16} aria-hidden />, kbd: "Ctrl+T", disabled: busy, run: () => ctx.pickAndOpenRepo() },
    { id: "branch.create", group: "Branch", label: "Create branch…", icon: <Plus size={16} aria-hidden />, kbd: "Ctrl+B", disabled: busy, run: dialog({ kind: "createBranch" }) },
    { id: "branch.checkout", group: "Branch", label: "Checkout…", icon: <GitBranch size={16} aria-hidden />, disabled: busy, run: dialog({ kind: "checkout" }) },
    { id: "branch.merge", group: "Branch", label: "Merge…", icon: <GitMerge size={16} aria-hidden />, disabled: busy, run: dialog({ kind: "merge" }) },
    { id: "branch.rebase", group: "Branch", label: "Rebase…", icon: <GitMerge size={16} aria-hidden />, disabled: busy, run: dialog({ kind: "rebase" }) },
    { id: "stash.push", group: "Stash", label: "Stash changes…", icon: <Archive size={16} aria-hidden />, disabled: busy ?? (ctx.changes === 0 ? "Nothing to stash" : undefined), run: dialog({ kind: "stashPush" }) },
    { id: "stash.manage", group: "Stash", label: "Manage stashes…", icon: <Archive size={16} aria-hidden />, kbd: "Ctrl+Shift+S", run: dialog({ kind: "stashes" }) },
    { id: "stash.pop", group: "Stash", label: latest ? `Pop latest: ${latest.message}` : "Pop latest", icon: <Archive size={16} aria-hidden />, disabled: busy ?? noStash, run: () => latest && ctx.stashPop(latest.index) },
    { id: "stash.apply", group: "Stash", label: latest ? `Apply latest: ${latest.message}` : "Apply latest", icon: <Archive size={16} aria-hidden />, disabled: busy ?? noStash, run: () => latest && ctx.stashApply(latest.index) },
    { id: "net.fetch", group: "Network", label: "Fetch", icon: <ArrowDown size={16} aria-hidden />, kbd: "Ctrl+F5", disabled: busy, run: () => ctx.fetchDefault() },
    { id: "net.pull", group: "Network", label: "Pull…", icon: <ArrowDownUp size={16} aria-hidden />, kbd: "Ctrl+Shift+L", disabled: busy, run: dialog({ kind: "pull" }) },
    { id: "net.push", group: "Network", label: "Push…", icon: <ArrowUp size={16} aria-hidden />, kbd: "Ctrl+Shift+U", disabled: busy, run: dialog({ kind: "push" }) },
    ...ctx.local.map<Command>((b) => ({ id: `goto.${b.name}`, group: "Go to branch", label: b.name, icon: <GitBranch size={16} aria-hidden />, run: () => ctx.revealOid(b.oid) })),
    ...ctx.remotes.flatMap((r) => r.branches.map<Command>((b) => ({ id: `goto.${b.name}`, group: "Go to branch", label: b.name, icon: <Cloud size={16} aria-hidden />, run: () => ctx.revealOid(b.oid) }))),
    ...ctx.recents.filter((r) => r.path !== ctx.repoPath).map<Command>((r) => ({ id: `repo.switch.${r.path}`, group: "Repositories", label: r.name, icon: <FolderGit2 size={16} aria-hidden />, disabled: busy, run: () => ctx.switchRepo(r.path) })),
    { id: "win.sidebar", group: "Window", label: "Toggle sidebar", icon: <PanelLeft size={16} aria-hidden />, kbd: "Ctrl+Shift+`", run: () => ctx.toggleRail() },
    { id: "win.refresh", group: "Window", label: "Refresh", icon: <RefreshCw size={16} aria-hidden />, kbd: "F5", run: () => ctx.refreshAll() },
    { id: "win.settings", group: "Window", label: "Settings", icon: <Settings size={16} aria-hidden />, run: dialog({ kind: "settings" }) },
    { id: "win.detach", group: "Window", label: "Move to new window", icon: <ExternalLink size={16} aria-hidden />, kbd: "Ctrl+Shift+N", disabled: busy ?? (ctx.tabCount < 2 ? "This tab is the only one in this window" : undefined), run: () => ctx.detachTab() },
    { id: "win.close", group: "Window", label: "Close tab", icon: <X size={16} aria-hidden />, kbd: "Ctrl+W", disabled: busy, run: () => ctx.closeTab() },
  ];
}
