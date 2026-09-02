// Completions for the word being typed in a `git …` line: history lines first, then subcommands,
// their flags, or refs from the repository, depending on where the caret is.
import type { RefsSnapshot } from "../api/types";
import { splitArgs } from "./argv";

export interface Completion {
  text: string;
  /** One line of context (a command's purpose, a flag's meaning, a ref's kind). */
  hint: string;
  kind: "history" | "command" | "flag" | "ref";
}

export interface Completions {
  items: Completion[];
  /** Index in the text an accepted item replaces from (a history item replaces the whole line). */
  replaceFrom: number;
}

export const MAX_ITEMS = 30;
/** History rows lead the list; capped on their own so they never crowd out the flags / refs. */
export const MAX_HISTORY_ITEMS = 8;

type Flags = [flag: string, hint: string][];

interface Cmd {
  hint: string;
  flags?: Flags;
  /** Second-level commands (`stash push`, `remote prune`). */
  subs?: Record<string, Cmd>;
  /** Takes refs (branches, tags, remotes, stashes) as arguments. */
  refs?: boolean;
}

/** Porcelain commands and their everyday flags. Not exhaustive: anything can still be typed. */
export const GIT_COMMANDS: Record<string, Cmd> = {
  status: { hint: "Working tree status", flags: [["-s", "short format"], ["-b", "show branch"], ["--porcelain", "stable output"], ["-u", "show untracked files"]] },
  add: { hint: "Stage files", flags: [["-A", "all changes"], ["-u", "tracked files only"], ["-n", "dry run"], ["-f", "ignored files too"]] },
  commit: {
    hint: "Record staged changes",
    flags: [["-m", "message"], ["-a", "stage tracked changes"], ["--amend", "rewrite HEAD"], ["--no-edit", "keep the message"], ["-s", "Signed-off-by"], ["--allow-empty", "no changes needed"], ["--no-verify", "skip hooks"]],
  },
  log: {
    hint: "Commit history",
    refs: true,
    flags: [["--oneline", "one line per commit"], ["--graph", "ASCII graph"], ["--all", "every ref"], ["--stat", "file stats"], ["-p", "show patches"], ["-n", "limit count"], ["--author", "filter by author"], ["--since", "after date"], ["--grep", "filter by message"], ["--first-parent", "mainline only"], ["--no-merges", "skip merges"]],
  },
  diff: { hint: "Changes between trees", refs: true, flags: [["--cached", "index vs HEAD"], ["--stat", "file stats"], ["--name-only", "paths only"], ["--name-status", "paths + status"], ["-w", "ignore whitespace"]] },
  branch: {
    hint: "List / create / delete branches",
    refs: true,
    flags: [["-a", "local and remote"], ["-r", "remote only"], ["-d", "delete merged"], ["-D", "force delete"], ["-m", "rename"], ["-f", "force move"], ["-u", "set upstream"], ["--unset-upstream", "drop upstream"], ["-v", "verbose"], ["--merged", "merged into HEAD"], ["--no-merged", "not merged"], ["--contains", "containing commit"]],
  },
  checkout: { hint: "Switch branch / restore files", refs: true, flags: [["-b", "new branch"], ["-B", "new or reset branch"], ["-t", "track upstream"], ["--detach", "detached HEAD"], ["-f", "discard local changes"], ["--", "paths follow"]] },
  switch: { hint: "Switch branch", refs: true, flags: [["-c", "create"], ["-C", "create or reset"], ["--detach", "detached HEAD"], ["-", "previous branch"]] },
  restore: { hint: "Restore working tree files", flags: [["--staged", "unstage"], ["--source", "from tree-ish"], ["-W", "worktree"]] },
  fetch: { hint: "Download from a remote", refs: true, flags: [["--all", "every remote"], ["--prune", "drop stale tracking branches"], ["--tags", "all tags"], ["--prune-tags", "drop stale tags"], ["--depth", "shallow depth"], ["--unshallow", "full history"], ["--dry-run", "show only"]] },
  pull: { hint: "Fetch and integrate", refs: true, flags: [["--rebase", "rebase onto upstream"], ["--no-rebase", "merge"], ["--ff-only", "fast-forward only"], ["--prune", "prune tracking branches"], ["--autostash", "stash around it"]] },
  push: { hint: "Upload to a remote", refs: true, flags: [["-u", "set upstream"], ["--force-with-lease", "safe force"], ["-f", "force"], ["--tags", "all tags"], ["--delete", "delete remote ref"], ["--dry-run", "show only"], ["--all", "every branch"], ["--prune", "delete stale remote refs"]] },
  merge: { hint: "Join histories", refs: true, flags: [["--ff-only", "fast-forward only"], ["--no-ff", "always a merge commit"], ["--squash", "no merge commit"], ["--abort", "abort in-progress merge"], ["--continue", "finish after conflicts"], ["-m", "message"], ["--no-commit", "stop before committing"]] },
  rebase: { hint: "Replay commits", refs: true, flags: [["--onto", "new base"], ["--continue", "resume"], ["--abort", "abort"], ["--skip", "skip this commit"], ["--autostash", "stash around it"]] },
  reset: { hint: "Move HEAD / unstage", refs: true, flags: [["--soft", "keep index + worktree"], ["--mixed", "keep worktree"], ["--hard", "discard everything"], ["--keep", "keep local changes"]] },
  stash: {
    hint: "Shelve changes",
    subs: {
      push: { hint: "Save changes", flags: [["-u", "untracked too"], ["-k", "keep index"], ["-m", "message"]] },
      pop: { hint: "Apply and drop", refs: true },
      apply: { hint: "Apply, keep", refs: true },
      drop: { hint: "Discard", refs: true },
      list: { hint: "List stashes" },
      show: { hint: "Show a stash", refs: true, flags: [["-p", "as patch"]] },
      branch: { hint: "New branch from stash", refs: true },
      clear: { hint: "Drop all" },
    },
  },
  remote: {
    hint: "Manage remotes",
    subs: {
      "-v": { hint: "List with URLs" },
      add: { hint: "Add a remote" },
      remove: { hint: "Remove", refs: true },
      rename: { hint: "Rename", refs: true },
      "set-url": { hint: "Change URL", refs: true },
      show: { hint: "Inspect", refs: true },
      prune: { hint: "Drop stale tracking branches", refs: true },
    },
  },
  tag: { hint: "List / create / delete tags", refs: true, flags: [["-a", "annotated"], ["-m", "message"], ["-d", "delete"], ["-l", "list"], ["-f", "replace"], ["-n", "show messages"], ["--contains", "containing commit"]] },
  "cherry-pick": { hint: "Apply a commit", refs: true, flags: [["--continue", "resume"], ["--abort", "abort"], ["--skip", "skip"], ["-n", "no commit"], ["-x", "note the source"]] },
  revert: { hint: "Undo a commit with a new one", refs: true, flags: [["--continue", "resume"], ["--abort", "abort"], ["-n", "no commit"], ["--no-edit", "keep message"]] },
  show: { hint: "Show objects", refs: true, flags: [["--stat", "file stats"], ["--name-only", "paths only"], ["-s", "no diff"], ["--format", "pretty format"]] },
  clean: { hint: "Remove untracked files", flags: [["-n", "dry run"], ["-f", "force"], ["-d", "directories too"], ["-x", "ignored too"], ["-X", "ignored only"]] },
  reflog: { hint: "Reference log", refs: true },
  "rev-parse": { hint: "Resolve revisions", refs: true },
  "merge-base": { hint: "Common ancestor", refs: true },
  describe: { hint: "Nearest tag name", refs: true },
  blame: { hint: "Line-by-line author" },
  grep: { hint: "Search tracked files" },
  "ls-files": { hint: "List tracked files" },
  mv: { hint: "Move / rename" },
  rm: { hint: "Remove from index" },
  config: { hint: "Get / set options", flags: [["--list", "all values"], ["--global", "user config"], ["--local", "repo config"], ["--unset", "remove"]] },
  shortlog: { hint: "Summarize log" },
  submodule: { hint: "Submodules", subs: { status: { hint: "Status" }, init: { hint: "Init" }, update: { hint: "Update", flags: [["--init", "init first"], ["--recursive", "nested too"]] } } },
  worktree: { hint: "Worktrees", subs: { list: { hint: "List" }, add: { hint: "Add" }, remove: { hint: "Remove" }, prune: { hint: "Prune" } } },
  gc: { hint: "Garbage collect" },
  fsck: { hint: "Verify objects" },
  "count-objects": { hint: "Object counts", flags: [["-v", "verbose"]] },
};

/**
 * Where the word being typed starts (after the last whitespace outside quotes); `null` inside an
 * open quote. Same rules as `splitArgs`: `\"` / `\'` outside quotes is a literal, whitespace is ASCII.
 */
function wordStart(text: string): number | null {
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "\\" && (text[i + 1] === '"' || text[i + 1] === "'")) i++;
    else if (c === '"' || c === "'") quote = c;
    else if (/[ \t\r\n]/.test(c)) start = i + 1;
  }
  return quote ? null : start;
}

/** Local branches, remote branches, tags, stashes, then remote names. */
function refList(refs: RefsSnapshot | null): Completion[] {
  if (!refs) return [];
  const ref = (text: string, hint: string): Completion => ({ text, hint, kind: "ref" });
  return [
    ...refs.local.map((b) => ref(b.name, "branch")),
    ...refs.remotes.flatMap((r) => r.branches.map((b) => ref(b.name, "remote branch"))),
    ...refs.tags.map((t) => ref(t.name, "tag")),
    ...refs.stashes.map((_, i) => ref(`stash@{${i}}`, "stash")),
    ...refs.remotes.map((r) => ref(r.name, "remote")),
  ];
}

const own = <T>(rec: Record<string, T> | undefined, key: string): T | undefined => (rec && Object.prototype.hasOwnProperty.call(rec, key) ? rec[key] : undefined);

export function complete(text: string, refs: RefsSnapshot | null, history: string[]): Completions {
  const start = wordStart(text);
  if (start === null) return { items: [], replaceFrom: 0 };
  const cur = text.slice(start);
  const before = splitArgs(text.slice(0, start));
  const words = before.ok ? before.args : [];
  const items: Completion[] = [];
  const line = text.trimStart();
  if (line) {
    for (const h of history) {
      if (items.length === MAX_HISTORY_ITEMS) break;
      if (h.startsWith(line) && h !== line) items.push({ text: h, hint: "history", kind: "history" });
    }
  }

  const matches = (name: string) => name.startsWith(cur);
  const top = own(GIT_COMMANDS, words[0] ?? "");
  if (words.length === 0) {
    for (const [name, c] of Object.entries(GIT_COMMANDS)) if (matches(name)) items.push({ text: name, hint: c.hint, kind: "command" });
  } else if (top?.subs && words.length === 1) {
    for (const [name, c] of Object.entries(top.subs)) if (matches(name)) items.push({ text: name, hint: c.hint, kind: "command" });
  } else {
    const cmd = own(top?.subs, words[1] ?? "") ?? top;
    if (cur.startsWith("-")) {
      for (const [flag, hint] of cmd?.flags ?? []) if (matches(flag)) items.push({ text: flag, hint, kind: "flag" });
    } else if (cmd?.refs || (!cmd && cur)) {
      for (const r of refList(refs)) if (matches(r.text)) items.push(r);
    }
  }
  return { items: items.slice(0, MAX_ITEMS), replaceFrom: start };
}
