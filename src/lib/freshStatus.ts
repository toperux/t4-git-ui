// The one freshness rule every status consumer routes through. Pure on purpose: `banners.ts` is
// store-free, so this cannot reach for `statusStore` (zustand + ipc, and a cycle through `repoStore`).
import type { RepoState, WorkdirStatus } from "../api/types";

/**
 * The status, but only as far as it describes the state the refs are in now. A scan that ran in
 * another state predates the change and says nothing about the new one: it has to read as "not known
 * yet", exactly as a status that has not arrived yet does — never as "clean". What "not known yet"
 * resolves to is the caller's call: whichever answer neither destroys user state nor churns the walk.
 */
export const freshStatus = (status: WorkdirStatus | null, refsState: RepoState | undefined): WorkdirStatus | null =>
  status && status.state === refsState ? status : null;
