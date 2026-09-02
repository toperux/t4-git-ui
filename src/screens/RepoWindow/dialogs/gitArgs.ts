// Mirrors the argument builders in `crates/git-core/src/cli/ops.rs`, which is the source of truth:
// the backend builds the real argv there, this file only renders the dialogs' "Runs `git …`"
// preview line. Any flag change over there has to be made here too or the preview lies.
import type { FfMode, PullMode, ResetMode } from "../../../api/types";

const flag = (on: boolean, f: string) => (on ? [f] : []);

export const fetchArgs = (remote: string | null, prune: boolean, tags: boolean) => [
  "fetch",
  "--progress",
  ...flag(prune, "--prune"),
  ...flag(tags, "--tags"),
  remote ?? "--all",
];

const PULL_MODE: Record<PullMode, string> = { merge: "--no-rebase", rebase: "--rebase", ffOnly: "--ff-only" };

export const pullArgs = (remote: string | null, branch: string | null, mode: PullMode) => [
  "pull",
  "--progress",
  PULL_MODE[mode],
  ...(remote ? [remote, ...(branch ? [branch] : [])] : []),
];

export const pushArgs = (remote: string, refspec: string | null, setUpstream: boolean, forceWithLease: boolean, tags: boolean) => [
  "push",
  "--progress",
  ...flag(setUpstream, "-u"),
  ...flag(forceWithLease, "--force-with-lease"),
  ...flag(tags, "--tags"),
  remote,
  ...(refspec ? [refspec] : []),
];

const FF: Record<FfMode, string> = { auto: "--ff", only: "--ff-only", no: "--no-ff" };

export const mergeArgs = (branch: string, ff: FfMode, squash: boolean, message: string | null) => [
  "merge",
  FF[ff],
  ...flag(squash, "--squash"),
  ...(message ? ["-m", message] : []),
  branch,
];

export const rebaseArgs = (onto: string) => ["rebase", onto];

export const resetArgs = (mode: ResetMode, target: string) => ["reset", `--${mode}`, target];

export const resetBranchArgs = (branch: string, target: string) => ["branch", "-f", branch, target];

export const checkoutArgs = (target: string, createBranch: string | null, track: boolean) => [
  "checkout",
  ...(createBranch ? [...flag(track, "--track"), "-b", createBranch] : []),
  target,
];

export const stashPushArgs = (message: string | null, includeUntracked: boolean, keepIndex: boolean) => [
  "stash",
  "push",
  ...flag(includeUntracked, "-u"),
  ...flag(keepIndex, "-k"),
  ...(message ? ["-m", message] : []),
];

/** `git …` with shell-style quoting of arguments that need it (an empty one too, or it vanishes). */
export const gitCmd = (args: string[]) => `git ${args.map((a) => (a === "" || /[\s'"]/.test(a) ? `'${a.replace(/'/g, "'\\''")}'` : a)).join(" ")}`;
