// Mirrors the Rust IPC contract (serde, all camelCase). Keep in sync with:
//   crates/git-core/src/log/types.rs, refs.rs, commit.rs, diff.rs, status.rs, watch.rs, cli/runner.rs, cli/ops.rs, error.rs
//   src-tauri/src/commands/{repo,stage,ops}.rs, src-tauri/src/error.rs

/** `git_core::RepoId` — serde(transparent) newtype over the canonical workdir path. */
export type RepoId = string;

export type AppErrorKind =
  | "git"
  | "io"
  | "cli"
  | "notARepo"
  | "gitNotFound"
  | "indexLocked"
  | "cancelled"
  | "conflicts"
  | "invalidPatch"
  /** Missing `user.name` / `user.email`. */
  | "config"
  /** A safety check declined the operation (e.g. deleting an unmerged branch). */
  | "refused"
  /** Another mutating operation holds the repo's op lock. */
  | "busy"
  /** The requested walk generation was superseded — restart the walk. */
  | "staleGeneration"
  | "internal"
  | "unknown";

export interface AppError {
  kind: AppErrorKind | string;
  message: string;
}

// --- log/types.rs ---

/** Times are unix seconds (UTC). */
export interface CommitInfo {
  /** Full 40-hex oid. */
  oid: string;
  /** First 7 hex chars. */
  short: string;
  summary: string;
  authorName: string;
  authorEmail: string;
  authorTime: number;
  committerTime: number;
  parents: string[];
  isMerge: boolean;
}

/**
 * - `branch`: leaves the node (row center, x = `lane`) and exits the bottom edge at `to` (`from` == `lane`).
 * - `merge`: enters the top edge at `from` and ends at the node (`to` == `lane`).
 * - `straight`: pass-through, top edge `from` → bottom edge `to`, never touches the node.
 */
export type LineKind = "branch" | "merge" | "straight";

export interface GraphLine {
  /** Column at the top edge of the row. */
  from: number;
  /** Column at the bottom edge of the row. */
  to: number;
  /** Index into the 8-entry lane palette. */
  color: number;
  kind: LineKind;
}

export interface GraphRow {
  commit: CommitInfo;
  lane: number;
  color: number;
  lines: GraphLine[];
  /** Highest column index touched by this row. */
  maxLane: number;
}

export type RefKind = "head" | "local" | "remote" | "tag" | "stash";

export interface RefLabel {
  /** Short name (`main`, `origin/main`, `v1.0`, `stash@{0}`, `HEAD`). */
  name: string;
  kind: RefKind;
  /** `true` for the checked-out local branch (no separate `head` label then). */
  isCurrent: boolean;
  /** Local label only: remote whose tracking branch sits at the same commit (synced chip). */
  remote: string | null;
}

export interface LogRow {
  row: GraphRow;
  labels: RefLabel[];
}

/** `#[serde(tag = "kind", content = "refs")]` */
export type RevSpec = { kind: "all" } | { kind: "head" } | { kind: "refs"; refs: string[] };

/** Only `text` is implemented; `author` / `path` are accepted but ignored. */
export interface LogFilter {
  text?: string | null;
  author?: string | null;
  path?: string | null;
}

// --- refs.rs ---

export interface HeadInfo {
  /** `null` when HEAD is unborn (empty repository). */
  oid: string | null;
  /** Short branch name when HEAD is symbolic. */
  branch: string | null;
  detached: boolean;
}

export interface Branch {
  name: string;
  oid: string;
  /** Short name of the configured tracking branch (`origin/main`). */
  upstream: string | null;
  /** `upstream` is configured but its ref no longer resolves. */
  gone: boolean;
  ahead: number;
  behind: number;
  isHead: boolean;
}

export interface RemoteBranch {
  /** Short name including the remote (`origin/main`). */
  name: string;
  oid: string;
}

export interface Remote {
  name: string;
  url: string | null;
  branches: RemoteBranch[];
}

export interface Tag {
  name: string;
  /** Peeled to the tagged commit. */
  oid: string;
}

export interface Stash {
  index: number;
  oid: string;
  message: string;
}

export type RepoState = "clean" | "merge" | "rebase" | "cherryPick" | "revert" | "bisect";

export interface RefsSnapshot {
  head: HeadInfo;
  state: RepoState;
  local: Branch[];
  remotes: Remote[];
  tags: Tag[];
  stashes: Stash[];
}

// --- commit.rs ---

export interface CommitDetail {
  info: CommitInfo;
  /** Full commit message (summary + body). */
  message: string;
  committerName: string;
  committerEmail: string;
}

// --- src-tauri/src/commands/repo.rs ---

export interface RepoSummary {
  id: RepoId;
  /** Directory name of the working directory. */
  name: string;
  path: string;
  head: HeadInfo;
}

export interface LogPage {
  rows: LogRow[];
  total: number;
  complete: boolean;
  generation: number;
}

/** Payload of the `log://progress` event. */
export interface LogProgress {
  repoId: RepoId;
  generation: number;
  total: number;
  complete: boolean;
  error: string | null;
}

// --- diff.rs ---

export type FileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "typechange"
  | "untracked"
  | "conflicted"
  | "ignored";

/** One entry of a changed-file list. */
export interface FileChange {
  /** New path (`/`-separated, repo-relative). */
  path: string;
  /** Old path for renames / copies. */
  oldPath: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
}

/** `#[serde(tag = "kind")]` — what to diff. */
export type DiffTarget =
  | { kind: "commit"; oid: string }
  | { kind: "commitRange"; from: string; to: string }
  | { kind: "staged" }
  | { kind: "unstaged" }
  | { kind: "workdir" };

export type DiffLineKind = "context" | "add" | "del";

export interface DiffLine {
  kind: DiffLineKind;
  oldNo: number | null;
  newNo: number | null;
  /** Without the trailing `\n`; a `\r` before it is kept so CRLF stays visible. */
  text: string;
  /** Last line of the file without a trailing newline. */
  noNewline: boolean;
}

export interface Hunk {
  /** `@@ -a,b +c,d @@ context` */
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  binary: boolean;
  hunks: Hunk[];
  /** Line collection stopped at `DiffOptions.maxLines`. */
  truncated: boolean;
  /** Full counts (not affected by truncation). */
  additions: number;
  deletions: number;
}

/** All fields default on the Rust side (context 3, maxLines 20 000, ignoreWhitespace false). */
export interface DiffOptions {
  context?: number;
  maxLines?: number;
  ignoreWhitespace?: boolean;
}

// --- status.rs ---

export interface StatusEntry {
  path: string;
  oldPath: string | null;
  /** HEAD → index change, `null` when nothing is staged. */
  index: FileStatus | null;
  /** Index → working directory change, `null` when the workdir matches the index. */
  workdir: FileStatus | null;
  conflicted: boolean;
}

export interface WorkdirStatus {
  /** Sorted by `path`. */
  entries: StatusEntry[];
  /** Entries with an `index` change. */
  staged: number;
  /** Entries with a tracked `workdir` change (not untracked). */
  unstaged: number;
  untracked: number;
  conflicted: number;
}

// --- watch.rs / src-tauri/src/commands/stage.rs ---

export type ChangeKind = "workdir" | "index" | "refs";

/** Payload of `repo://changed` (watcher, and once after each of our own mutating ops). */
export interface RepoChanged {
  repoId: RepoId;
  /** Distinct kinds, in first-seen order. */
  kinds: ChangeKind[];
  /** The watcher lost events; refresh everything. */
  rescan: boolean;
}

// --- cli/runner.rs ---

/** `#[serde(tag = "kind")]` — one streamed event of a running git command. */
export type CliEvent =
  | { kind: "started"; opId: string; cmd: string }
  | { kind: "stdout"; line: string }
  | { kind: "stderr"; line: string }
  /** A `\r`-terminated segment (progress meter redraw). */
  | { kind: "progress"; line: string }
  | { kind: "exit"; code: number; elapsedMs: number };

/** Payload of `op://event`. `repoId` is `null` for ops without a repo (clone). */
export interface OpEvent {
  repoId: RepoId | null;
  opId: string;
  event: CliEvent;
}

// --- cli/ops.rs / src-tauri/src/commands/ops.rs ---

export type PullMode = "merge" | "rebase" | "ffOnly";

/** `auto` = `--ff`, `only` = `--ff-only`, `no` = `--no-ff`. */
export type FfMode = "auto" | "only" | "no";

/** `#[serde(tag = "kind")]` — why a streamed op exited non-zero. */
export type OpFailure =
  | { kind: "conflicts"; paths: string[] }
  | { kind: "nonFastForward" }
  | { kind: "authFailed" }
  | { kind: "rejected"; message: string }
  | { kind: "other"; message: string };

/** Outcome of a streaming op after its process exited (a non-zero exit is a `failure`, not a rejection). */
export interface OpResult {
  opId: string;
  code: number;
  /** Conflicted paths (from the status after merge / rebase / pull failures). */
  conflicts: string[];
  failure: OpFailure | null;
}

export interface Author {
  name: string;
  email: string;
}
