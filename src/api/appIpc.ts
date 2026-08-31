// Start-screen commands (src-tauri/src/commands/ops.rs: clone_repo / init_repo). Same contract as ipc.ts:
// every rejection is an `AppError`.
import { call } from "./ipc";
import type { RepoSummary } from "./types";

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
