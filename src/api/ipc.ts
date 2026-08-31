// Typed wrappers around Tauri `invoke`, one per Rust command. Every rejection is an `AppError`.
import { invoke } from "@tauri-apps/api/core";
import type {
  AppError,
  Author,
  CommitDetail,
  DiffOptions,
  DiffTarget,
  FileChange,
  FileDiff,
  LogFilter,
  LogPage,
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
