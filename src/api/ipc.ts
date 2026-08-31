// Typed wrappers around Tauri `invoke`, one per Rust command. Every rejection is an `AppError`.
import { invoke } from "@tauri-apps/api/core";
import type {
  AppError,
  CommitDetail,
  LogFilter,
  LogPage,
  RefsSnapshot,
  RepoId,
  RepoSummary,
  RevSpec,
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
