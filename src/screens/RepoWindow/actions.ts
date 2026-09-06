// Operations shared by the toolbar, menus, banners and shortcuts. Everything goes through `runOp`.
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open as openFolder } from "@tauri-apps/plugin-dialog";
import * as ipc from "../../api/ipc";
import { toAppError } from "../../api/ipc";
import type { Branch, Remote, RemoteBranch } from "../../api/types";
import { splitArgs } from "../../lib/argv";
import { useCmdHistoryStore } from "../../store/cmdHistoryStore";
import { useDialogStore } from "../../store/dialogStore";
import { runOp, selectRunning, useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useStatusStore } from "../../store/statusStore";
import { toastError, useToastStore } from "../../store/toastStore";
import { gitCmd } from "./dialogs/gitArgs";

export const currentBranch = (): Branch | null => useRepoStore.getState().refs?.local.find((b) => b.isHead) ?? null;

/** `branch.<current>.remote` → `origin` → first remote; `null` without remotes. */
export async function defaultRemote(): Promise<string | null> {
  const st = useRepoStore.getState();
  if (!st.repo) return null;
  const fromConfig = await ipc.getDefaultRemote(st.repo.id).catch(() => null);
  return fromConfig ?? st.refs?.remotes[0]?.name ?? null;
}

/** `remote/name` → `name` when the branch belongs to `remote`. */
export const stripRemote = (rb: RemoteBranch, remote: string) => (rb.name.startsWith(`${remote}/`) ? rb.name.slice(remote.length + 1) : rb.name);

/**
 * Short names never offered for deletion: `main`, `master` and whatever a remote's HEAD points at
 * (`origin/HEAD → origin/develop` keeps `develop` on every remote and locally).
 */
export function protectedNames(remotes: Remote[]): Set<string> {
  const out = new Set(["main", "master"]);
  for (const r of remotes) if (r.head?.startsWith(`${r.name}/`)) out.add(r.head.slice(r.name.length + 1));
  return out;
}

/** Fetch one remote with prune and no tags; `null` = every remote. */
export const fetchRemote = (remote: string | null) =>
  runOp(`Fetching ${remote ?? "all remotes"}…`, (id) => ipc.fetch(id, remote, true, false), { success: `Fetched ${remote ?? "all remotes"}` });

/** Toolbar Fetch: prune, no tags, default remote (all remotes without one). */
export async function fetchDefault() {
  return fetchRemote(await defaultRemote());
}

export const checkoutBranch = (name: string) => runOp(`Checking out ${name}…`, (id) => ipc.checkout(id, name, null, false), { success: `Checked out ${name}` });

/** Creates a tracking local branch of the same short name (or checks out the existing one). */
export function checkoutRemoteBranch(rb: RemoteBranch, remote: string) {
  const local = stripRemote(rb, remote);
  if (useRepoStore.getState().refs?.local.some((b) => b.name === local)) return checkoutBranch(local);
  return runOp(`Checking out ${local}…`, (id) => ipc.checkout(id, rb.name, local, true), { success: `Checked out ${local} (tracking ${rb.name})` });
}

/** Tag or commit → detached HEAD. */
export const checkoutDetached = (target: string, label = target) =>
  runOp(`Checking out ${label}…`, (id) => ipc.checkout(id, target, null, false, true), { success: `Checked out ${label} (detached)` });

/** Tag → detached HEAD, by its full ref: `git checkout` reads a bare name as a branch first, so a branch called the same would win. */
export const checkoutTag = (name: string) => checkoutDetached(`refs/tags/${name}`, name);

export const mergeAbort = () => runOp("Aborting merge…", (id) => ipc.mergeAbort(id), { success: "Merge aborted" });
export const rebaseAbort = () => runOp("Aborting rebase…", (id) => ipc.rebaseAbort(id), { success: "Rebase aborted" });
export const rebaseContinue = () => runOp("Continuing rebase…", (id) => ipc.rebaseContinue(id), { success: "Rebase continued" });

export const stashApply = (index: number) => runOp(`Applying stash@{${index}}…`, (id) => ipc.stashApply(id, index), { success: `Applied stash@{${index}}` });
export const stashPop = (index: number) => runOp(`Popping stash@{${index}}…`, (id) => ipc.stashPop(id, index), { success: `Popped stash@{${index}}` });
export const stashDrop = (index: number) => runOp(`Dropping stash@{${index}}…`, (id) => ipc.stashDrop(id, index), { success: `Dropped stash@{${index}}` });

/**
 * `git <line>` typed by the user. The line goes into the history as it runs (a failing command is
 * worth recalling too) and the dock opens for its output; no success or failure toast, the dock's
 * exit line is the result (`quietFailure`: a non-zero exit is often the answer).
 */
export function runGit(line: string) {
  const parsed = splitArgs(line);
  if (!parsed.ok || parsed.args.length === 0) return;
  useCmdHistoryStore.getState().push(line.trim());
  useOpsStore.getState().setOpen(true);
  return runOp(busyLabel(gitCmd(parsed.args)), (id) => ipc.runGit(id, parsed.args), { quietFailure: true });
}

/**
 * Statusbar-sized. Cut by code point (half an emoji is a broken glyph), and marked with `[…]`
 * rather than `…`: `runOp` strips a trailing `…` from its failure title, which would make the cut
 * command read as a complete one.
 */
export function busyLabel(cmd: string): string {
  const cps = [...cmd];
  return cps.length > 48 ? `${cps.slice(0, 45).join("")}[…]` : cmd;
}

export function copyText(text: string, what: string) {
  void writeText(text)
    .then(() => useToastStore.getState().push({ kind: "info", title: `Copied ${what}`, detail: text }))
    .catch((e: unknown) => useToastStore.getState().push({ kind: "error", title: "Copy failed", detail: String(e) }));
}

/**
 * Toolbar Commit, "Commit merge", "Open commit panel". A text filter flattens the walk, and the
 * pseudo-row (the only thing that mounts the panel) is suppressed while it does: clear it first, or
 * the click does nothing at all.
 */
export function openCommitPanel() {
  const st = useRepoStore.getState();
  if (st.log.flat) void st.startLog(st.spec, { ...st.filter, text: null });
  st.selectWorkingTree();
}

/** Switches to another repository (toolbar repo menu); failures stay on the current one. */
/**
 * Leaving the repository while an operation runs against it is refused: the op would finish
 * — and refresh — against a repository that is no longer the open one.
 */
function refusedWhileRunning(before: string): boolean {
  if (!selectRunning(useOpsStore.getState())) return false;
  useToastStore.getState().push({ kind: "info", title: "Operation in progress", detail: `Wait for it to finish before ${before}` });
  return true;
}

export function switchRepo(path: string) {
  if (refusedWhileRunning("opening another repository")) return;
  void useRepoStore
    .getState()
    .openRepo(path)
    .catch((e: unknown) => toastError(toAppError(e), "Couldn't open repository"));
}

/** Folder picker → open (toolbar repo menu). A cancelled picker does nothing. */
export async function pickAndOpenRepo() {
  // Before the picker: a folder chosen and then refused is worse than no picker.
  if (refusedWhileRunning("opening another repository")) return;
  const dir = await openFolder({ directory: true, multiple: false, title: "Open repository" }).catch(() => null);
  if (dir) switchRepo(dir);
}

/**
 * Back to the start screen (repo menu / Ctrl+Shift+W). Refused while a dialog owns the window or an
 * operation is running against the repository.
 */
export function closeRepo() {
  if (!useRepoStore.getState().repo || useDialogStore.getState().dialog) return;
  if (refusedWhileRunning("closing the repository")) return;
  void useRepoStore
    .getState()
    .closeRepo()
    .catch((e: unknown) => toastError(toAppError(e), "Couldn't close the repository"));
}

/** Refs + status + a fresh walk (toolbar Refresh / F5). `refresh` / `startLog` report their own errors. */
export function refreshAll() {
  const st = useRepoStore.getState();
  void st.refreshRefs().catch((e: unknown) => {
    const err = toAppError(e);
    // `internal` after a close just means the repo is gone.
    if (err.kind !== "internal") toastError(err, "Couldn't refresh references");
  });
  void useStatusStore.getState().refresh();
  void st.startLog(st.spec, st.filter);
}
