// Typed wrappers around Tauri `invoke`, one per Rust command. Every rejection is an `AppError`.
import { invoke } from "@tauri-apps/api/core";
import type {
  AppError,
  Author,
  CommitDetail,
  DiffOptions,
  DiffTarget,
  FfMode,
  FileChange,
  FileDiff,
  LogFilter,
  LogPage,
  OpResult,
  PullMode,
  RefsSnapshot,
  RepoId,
  RepoSummary,
  RevSpec,
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

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toAppError(e);
  }
}

/** `git --version` with the configured executable; rejects with kind `gitNotFound`. */
export const probeGit = () => call<string>("probe_git");

export const openRepo = (path: string) => call<RepoSummary>("open_repo", { path });

export const closeRepo = (id: RepoId) => call<void>("close_repo", { id });

export const getRefs = (id: RepoId) => call<RefsSnapshot>("get_refs", { id });

export const getCommit = (id: RepoId, oid: string) => call<CommitDetail>("get_commit", { id, oid });

/** Starts a background walk; resolves with its generation. Progress arrives via `log://progress`. */
export const startLog = (id: RepoId, spec: RevSpec, filter: LogFilter) =>
  call<number>("start_log", { id, spec, filter });

/** Rows `[offset, offset+limit)`; a stale `generation` rejects with kind `internal`. */
export const getLogPage = (id: RepoId, generation: number, offset: number, limit: number) =>
  call<LogPage>("get_log_page", { id, generation, offset, limit });

/** Recomputes ref labels for the current walk; resolves with the current generation. */
export const refreshLabels = (id: RepoId) => call<number>("refresh_labels", { id });

// --- src-tauri/src/commands/diff.rs ---

/** Files changed by `oid` vs its first parent. */
export const getCommitFiles = (id: RepoId, oid: string) => call<FileChange[]>("get_commit_files", { id, oid });

export const getChangedFiles = (id: RepoId, target: DiffTarget) =>
  call<FileChange[]>("get_changed_files", { id, target });

/** Hunks of one file (a renamed file is also found by its old path). */
export const getFileDiff = (id: RepoId, target: DiffTarget, path: string, opts?: DiffOptions) =>
  call<FileDiff>("get_file_diff", { id, target, path, opts });

export const getStatus = (id: RepoId) => call<WorkdirStatus>("get_status", { id });

// --- src-tauri/src/commands/stage.rs ---
// Mutations emit one `repo://changed` afterwards (even on error).

export const stagePaths = (id: RepoId, paths: string[]) => call<void>("stage_paths", { id, paths });

export const unstagePaths = (id: RepoId, paths: string[]) => call<void>("unstage_paths", { id, paths });

/** Discards unstaged changes (tracked: restore from index; untracked: delete). Resolves with the paths touched. */
export const discardPaths = (id: RepoId, paths: string[]) => call<string[]>("discard_paths", { id, paths });

/** Hunk indices into the `unstaged` diff of `path` (`staged` when `reverse`, which unstages). */
export const stageHunks = (id: RepoId, path: string, hunks: number[], reverse: boolean) =>
  call<void>("stage_hunks", { id, path, hunks, reverse });

/** `[hunkIndex, lineIndexWithinHunk]` pairs; same target rule as `stageHunks`. */
export const stageLines = (id: RepoId, path: string, lines: [number, number][], reverse: boolean) =>
  call<void>("stage_lines", { id, path, lines, reverse });

/** `git commit` via the CLI (hook output streams as `op://event`); resolves with the new HEAD oid. */
export const commit = (id: RepoId, message: string, amend: boolean, signoff: boolean) =>
  call<string>("commit", { id, message, amend, signoff });

/** Full HEAD message (`null` on an unborn HEAD). */
export const getHeadMessage = (id: RepoId) => call<string | null>("get_head_message", { id });

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

/** `git checkout [--track] [-b <createBranch>] <target>`; `track` only applies with `createBranch`. */
export const checkout = (id: RepoId, target: string, createBranch: string | null, track: boolean) =>
  call<OpResult>("checkout", { id, target, createBranch, track });

/** `git stash push [-u] [-k] [-m <msg>]` */
export const stashPush = (id: RepoId, message: string | null, includeUntracked: boolean, keepIndex: boolean) =>
  call<OpResult>("stash_push", { id, message, includeUntracked, keepIndex });

export const stashApply = (id: RepoId, index: number) => call<OpResult>("stash_apply", { id, index });

export const stashPop = (id: RepoId, index: number) => call<OpResult>("stash_pop", { id, index });

export const stashDrop = (id: RepoId, index: number) => call<OpResult>("stash_drop", { id, index });

/** `git push <remote> --delete <name>` */
export const deleteRemoteBranch = (id: RepoId, remote: string, name: string) =>
  call<OpResult>("delete_remote_branch", { id, remote, name });

// git2-backed (no stream); `checkout: true` runs `git checkout -b` and rejects with kind `cli` on failure.
export const createBranch = (id: RepoId, name: string, target: string, checkout: boolean) =>
  call<void>("create_branch", { id, name, target, checkout });

/** Rejects with kind `refused` when the branch is unmerged and `force` is off. */
export const deleteBranch = (id: RepoId, name: string, force: boolean) => call<void>("delete_branch", { id, name, force });

export const renameBranch = (id: RepoId, old: string, next: string, force: boolean) =>
  call<void>("rename_branch", { id, old, new: next, force });

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
