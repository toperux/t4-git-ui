// Operations shared by the toolbar, menus, banners and shortcuts. Everything goes through `runOp`.
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open as openFolder } from "@tauri-apps/plugin-dialog";
import * as ipc from "../../api/ipc";
import { toAppError } from "../../api/ipc";
import type { Branch, RemoteBranch } from "../../api/types";
import { useDialogStore } from "../../store/dialogStore";
import { runOp, selectRunning, useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useStatusStore } from "../../store/statusStore";
import { toastError, useToastStore } from "../../store/toastStore";

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

/** Toolbar Fetch: prune, no tags, default remote (all remotes without one). */
export async function fetchDefault() {
  const remote = await defaultRemote();
  return runOp(`Fetching ${remote ?? "all remotes"}…`, (id) => ipc.fetch(id, remote, true, false), { success: `Fetched ${remote ?? "all remotes"}` });
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
  runOp(`Checking out ${label}…`, (id) => ipc.checkout(id, target, null, false), { success: `Checked out ${label} (detached)` });

export const mergeAbort = () => runOp("Aborting merge…", (id) => ipc.mergeAbort(id), { success: "Merge aborted" });
export const rebaseAbort = () => runOp("Aborting rebase…", (id) => ipc.rebaseAbort(id), { success: "Rebase aborted" });
export const rebaseContinue = () => runOp("Continuing rebase…", (id) => ipc.rebaseContinue(id), { success: "Rebase continued" });

export const stashApply = (index: number) => runOp(`Applying stash@{${index}}…`, (id) => ipc.stashApply(id, index), { success: `Applied stash@{${index}}` });
export const stashPop = (index: number) => runOp(`Popping stash@{${index}}…`, (id) => ipc.stashPop(id, index), { success: `Popped stash@{${index}}` });
export const stashDrop = (index: number) => runOp(`Dropping stash@{${index}}…`, (id) => ipc.stashDrop(id, index), { success: `Dropped stash@{${index}}` });

export function copyText(text: string, what: string) {
  void writeText(text)
    .then(() => useToastStore.getState().push({ kind: "info", title: `Copied ${what}`, detail: text }))
    .catch((e: unknown) => useToastStore.getState().push({ kind: "error", title: "Copy failed", detail: String(e) }));
}

export const openCommitPanel = () => useRepoStore.getState().selectWorkingTree();

/** Switches to another repository (toolbar repo menu); failures stay on the current one. */
export function switchRepo(path: string) {
  void useRepoStore
    .getState()
    .openRepo(path)
    .catch((e: unknown) => toastError(toAppError(e), "Couldn't open repository"));
}

/** Folder picker → open (toolbar repo menu). A cancelled picker does nothing. */
export async function pickAndOpenRepo() {
  const dir = await openFolder({ directory: true, multiple: false, title: "Open repository" }).catch(() => null);
  if (dir) switchRepo(dir);
}

/**
 * Back to the start screen (repo menu / Ctrl+Shift+W). Refused while a dialog owns the window or an
 * operation is running against the repository.
 */
export function closeRepo() {
  if (!useRepoStore.getState().repo || useDialogStore.getState().dialog) return;
  if (selectRunning(useOpsStore.getState())) {
    useToastStore.getState().push({ kind: "info", title: "Operation in progress", detail: "Wait for it to finish before closing the repository" });
    return;
  }
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
