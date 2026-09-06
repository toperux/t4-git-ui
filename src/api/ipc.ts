// Typed wrappers around Tauri `invoke`, one per Rust command. Every rejection is an `AppError`.
import { invoke } from "@tauri-apps/api/core";
import type {
  AppError,
  Author,
  CommitDetail,
  ConflictSide,
  DiffOptions,
  DiffTarget,
  FfMode,
  FileChange,
  FileDiff,
  LogFilter,
  LogPage,
  OpResult,
  PullMode,
  ResetMode,
  RefsSnapshot,
  RemoteTag,
  RepoId,
  RepoSummary,
  RevSpec,
  Tool,
  ToolKind,
  Tools,
  WorkdirStatus,
} from "./types";

export function isAppError(e: unknown): e is AppError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as AppError).kind === "string" &&
    typeof (e as AppError).message === "string"
  );
}

export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  return { kind: "unknown", message: e instanceof Error ? e.message : String(e) };
}

/** The one `invoke` wrapper: every rejection becomes an `AppError`. */
export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toAppError(e);
  }
}

/** `git --version` with the configured executable; rejects with kind `gitNotFound`. */
export const probeGit = () => call<string>("probe_git");

/** Uses `path` as the git executable from now on if it answers `--version` (resolves with it); otherwise rejects and keeps the old one. */
export const setGitPath = (path: string) => call<string>("set_git_path", { path });

export const openRepo = (path: string) => call<RepoSummary>("open_repo", { path });

export interface CloneArgs {
  url: string;
  /** Full destination path (`<parent>/<name>`); the parent is created if missing. */
  dest: string;
  recurseSubmodules: boolean;
  /** `--depth N`; omit for a full clone. */
  depth?: number;
}

/**
 * `git clone --progress …` (streams `op://event` with `repoId: null`), then opens the result.
 * A failed clone rejects with kind `cli` (stderr in the message); `cancelOp(opId)` → kind `cancelled`.
 */
export const cloneRepo = (args: CloneArgs) => call<RepoSummary>("clone_repo", { ...args });

/** `git init <path>` then opens it. An existing repository at `path` rejects with kind `refused`. */
export const initRepo = (path: string) => call<RepoSummary>("init_repo", { path });

export const closeRepo = (id: RepoId) => call<void>("close_repo", { id });

export const getRefs = (id: RepoId) => call<RefsSnapshot>("get_refs", { id });

export const getCommit = (id: RepoId, oid: string) => call<CommitDetail>("get_commit", { id, oid });

/** Starts a background walk; resolves with its generation. Progress arrives via `log://progress`. */
export const startLog = (id: RepoId, spec: RevSpec, filter: LogFilter) =>
  call<number>("start_log", { id, spec, filter });

/** Rows `[offset, offset+limit)`; a stale `generation` rejects with kind `staleGeneration`. */
export const getLogPage = (id: RepoId, generation: number, offset: number, limit: number) =>
  call<LogPage>("get_log_page", { id, generation, offset, limit });

/** Row index of `oid` among the rows walked so far (`null` when absent); a stale `generation` rejects with kind `staleGeneration`. */
export const findLogRow = (id: RepoId, generation: number, oid: string) =>
  call<number | null>("find_log_row", { id, generation, oid });

/** Recomputes ref labels for the current walk; resolves with the current generation. */
export const refreshLabels = (id: RepoId) => call<number>("refresh_labels", { id });

/** Opens a repository-relative working-tree file with the OS handler, or reveals it in the file manager. */
export const openPath = (id: RepoId, path: string, reveal: boolean) =>
  call<void>("open_path", { id, path, reveal });

// --- src-tauri/src/commands/diff.rs ---

export const getChangedFiles = (id: RepoId, target: DiffTarget) =>
  call<FileChange[]>("get_changed_files", { id, target });

/** Hunks of one file (a renamed file is also found by its old path). */
export const getFileDiff = (id: RepoId, target: DiffTarget, path: string, opts?: DiffOptions) =>
  call<FileDiff>("get_file_diff", { id, target, path, opts });

/** `git checkout --merge -- <paths>`: puts files staged without being resolved back in conflict. */
export const recreateConflict = (id: RepoId, paths: string[]) => call<void>("recreate_conflict", { id, paths });

/** Opens a conflicted file's three sides in the configured merge tool (VS Code without one); resolves with the launcher used. */
export const openMergeEditor = (id: RepoId, path: string) => call<string>("open_merge_editor", { id, path });

export const getStatus = (id: RepoId) => call<WorkdirStatus>("get_status", { id });

// --- src-tauri/src/commands/tools.rs ---
// The external diff / merge tools, in the global git config (`diff.guitool`, `difftool.<name>.*`).

export const getTools = () => call<Tools>("get_tools");

/** Writes both selectors and the tool's entries; `null` clears the selectors and keeps the entries. */
export const setTool = (kind: ToolKind, tool: Tool | null) => call<void>("set_tool", { kind, tool });

/** Path of the first `rels` (under the install roots) or `names` (on PATH) that exists; `null` when nothing is installed. */
export const findTool = (names: string[], rels: string[]) => call<string | null>("find_tool", { names, rels });

/** Opens one file's two sides in the configured diff tool; resolves with the program that was spawned. */
export const openDiffTool = (id: RepoId, target: DiffTarget, path: string, oldPath: string | null) =>
  call<string>("open_diff_tool", { id, target, path, oldPath });

// --- src-tauri/src/commands/stage.rs ---
// Mutations emit one `repo://changed` afterwards (even on error).

export const stagePaths = (id: RepoId, paths: string[]) => call<void>("stage_paths", { id, paths });

export const unstagePaths = (id: RepoId, paths: string[]) => call<void>("unstage_paths", { id, paths });

/** Discards unstaged changes (tracked: restore from index; untracked: delete). Resolves with the paths touched. */
export const discardPaths = (id: RepoId, paths: string[]) => call<string[]>("discard_paths", { id, paths });

/** `git checkout --ours|--theirs -- <paths>` + stage: keeps one whole side of each conflict. */
export const resolveConflict = (id: RepoId, paths: string[], side: ConflictSide) =>
  call<void>("resolve_conflict", { id, paths, side });

/**
 * Hunk indices into the `unstaged` diff of `path` (`staged` when `reverse`, which unstages);
 * `context` must be the one the shown diff was loaded with, or the indices point elsewhere.
 */
export const stageHunks = (id: RepoId, path: string, hunks: number[], reverse: boolean, context: number) =>
  call<void>("stage_hunks", { id, path, hunks, reverse, context });

/** `[hunkIndex, lineIndexWithinHunk]` pairs; same target rule as `stageHunks`. */
export const stageLines = (id: RepoId, path: string, lines: [number, number][], reverse: boolean, context: number) =>
  call<void>("stage_lines", { id, path, lines, reverse, context });

/** Throws `hunks` of the `unstaged` diff away — the working file loses them, the index keeps what is staged. */
export const discardHunks = (id: RepoId, path: string, hunks: number[], context: number) =>
  call<void>("discard_hunks", { id, path, hunks, context });

/** `[hunkIndex, lineIndexWithinHunk]` pairs of the `unstaged` diff; same rule as `discardHunks`. */
export const discardLines = (id: RepoId, path: string, lines: [number, number][], context: number) =>
  call<void>("discard_lines", { id, path, lines, context });

/** `git commit` via the CLI (hook output streams as `op://event`); resolves with the new HEAD oid. */
export const commit = (id: RepoId, message: string, amend: boolean, signoff: boolean) =>
  call<string>("commit", { id, message, amend, signoff });

/** Full HEAD message (`null` on an unborn HEAD). */
export const getHeadMessage = (id: RepoId) => call<string | null>("get_head_message", { id });

/** `MERGE_MSG` without its comment lines — what `git commit` would open with mid-merge (`null` when there is none). */
export const getMergeMessage = (id: RepoId) => call<string | null>("get_merge_message", { id });

/** Rejects with kind `config` when `user.name` / `user.email` are missing. */
export const getAuthor = (id: RepoId) => call<Author>("get_author", { id });

/** Kills a running CLI op; `false` if unknown. */
export const cancelOp = (opId: string) => call<boolean>("cancel_op", { opId });

// --- src-tauri/src/commands/ops.rs ---
// Streaming ops: output arrives as `op://event`; a non-zero exit resolves with `OpResult.failure`.
// A second op while one runs rejects with kind `busy`. One `repo://changed` is emitted afterwards.

/** `git fetch --progress [--prune] [--tags] (<remote> | --all)` */
export const fetch = (id: RepoId, remote: string | null, prune: boolean, tags: boolean) =>
  call<OpResult>("fetch", { id, remote, prune, tags });

/** `git pull --progress <mode> [<remote> [<branch>]]` (`branch` needs `remote`). */
export const pull = (id: RepoId, remote: string | null, branch: string | null, mode: PullMode) =>
  call<OpResult>("pull", { id, remote, branch, mode });

/** `git push --progress [-u] [--force-with-lease] [--tags] <remote> [<refspec>]` */
export const push = (id: RepoId, remote: string, refspec: string | null, setUpstream: boolean, forceWithLease: boolean, tags: boolean) =>
  call<OpResult>("push", { id, remote, refspec, setUpstream, forceWithLease, tags });

/** `git merge (--ff | --ff-only | --no-ff) [--squash] [-m <msg>] <branch>` */
export const merge = (id: RepoId, branch: string, ff: FfMode, squash: boolean, message: string | null) =>
  call<OpResult>("merge", { id, branch, ff, squash, message });

export const rebase = (id: RepoId, onto: string) => call<OpResult>("rebase", { id, onto });

export const rebaseContinue = (id: RepoId) => call<OpResult>("rebase_continue", { id });

export const rebaseAbort = (id: RepoId) => call<OpResult>("rebase_abort", { id });

export const mergeAbort = (id: RepoId) => call<OpResult>("merge_abort", { id });

/** `git checkout [--track] [-b <createBranch>] [--detach] <target>`; `track` only applies with `createBranch`, `detach` only without it. */
export const checkout = (id: RepoId, target: string, createBranch: string | null, track: boolean, detach = false) =>
  call<OpResult>("checkout", { id, target, createBranch, track, detach });

/** `git reset (--soft | --mixed | --hard) <target>` — moves the current branch (or a detached HEAD). */
export const reset = (id: RepoId, mode: ResetMode, target: string) => call<OpResult>("reset", { id, mode, target });

/** `git branch -f <branch> <target>` — moves a branch that is not checked out; the working tree is untouched. */
export const resetBranch = (id: RepoId, branch: string, target: string) => call<OpResult>("reset_branch", { id, branch, target });

/** `git stash push [-u] [-k] [-m <msg>]` */
export const stashPush = (id: RepoId, message: string | null, includeUntracked: boolean, keepIndex: boolean) =>
  call<OpResult>("stash_push", { id, message, includeUntracked, keepIndex });

export const stashApply = (id: RepoId, index: number) => call<OpResult>("stash_apply", { id, index });

export const stashPop = (id: RepoId, index: number) => call<OpResult>("stash_pop", { id, index });

export const stashDrop = (id: RepoId, index: number) => call<OpResult>("stash_drop", { id, index });

/** `git push <remote> --delete <name>` */
export const deleteRemoteBranch = (id: RepoId, remote: string, name: string) =>
  call<OpResult>("delete_remote_branch", { id, remote, name });

/** `git <args>` as typed by the user; rejects with kind `refused` for a flag that needs a terminal. */
export const runGit = (id: RepoId, args: string[]) => call<OpResult>("run_git", { id, args });

// git2-backed (no stream); `checkout: true` runs `git checkout -b` and rejects with kind `cli` on failure.
export const createBranch = (id: RepoId, name: string, target: string, checkout: boolean) =>
  call<void>("create_branch", { id, name, target, checkout });

/** Rejects with kind `refused` when the branch is unmerged and `force` is off. */
export const deleteBranch = (id: RepoId, name: string, force: boolean) => call<void>("delete_branch", { id, name, force });

export const renameBranch = (id: RepoId, old: string, next: string, force: boolean) =>
  call<void>("rename_branch", { id, old, new: next, force });

/** `git remote add <name> <url>`; rejects when the name is taken or invalid. */
export const addRemote = (id: RepoId, name: string, url: string) => call<void>("add_remote", { id, name, url });

/** `git remote rename <old> <new>` — the remote-tracking refs and the branches tracking them follow. */
export const renameRemote = (id: RepoId, old: string, next: string) => call<void>("rename_remote", { id, old, new: next });

/** `git remote set-url <name> <url>` (fetch URL only). */
export const setRemoteUrl = (id: RepoId, name: string, url: string) => call<void>("set_remote_url", { id, name, url });

/** `git remote remove <name>` — its remote-tracking branches go with it. */
export const removeRemote = (id: RepoId, name: string) => call<void>("remove_remote", { id, name });

/** Annotated when `message` is given, lightweight otherwise. */
export const createTag = (id: RepoId, name: string, target: string, message: string | null) =>
  call<void>("create_tag", { id, name, target, message });

export const deleteTag = (id: RepoId, name: string) => call<void>("delete_tag", { id, name });

/** Effective config value, `null` when unset. */
export const getConfig = (id: RepoId, key: string) => call<string | null>("get_config", { id, key });

/** Writes to the repo-local config. */
export const setConfig = (id: RepoId, key: string, value: string) => call<void>("set_config", { id, key, value });

/** The current branch's remote, else `origin` when it exists, else the only remote; `null` without remotes. */
export const getDefaultRemote = (id: RepoId) => call<string | null>("get_default_remote", { id });

/** Tags `remote` has right now (`git ls-remote`), peeled to their commits; rejects when the remote can't be reached. */
export const remoteTags = (id: RepoId, remote: string) => call<RemoteTag[]>("remote_tags", { id, remote });
