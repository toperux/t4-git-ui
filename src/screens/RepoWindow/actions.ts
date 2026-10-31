// Operations shared by the toolbar, menus, banners and shortcuts. Everything goes through `runOp`.
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ask, open as openFolder } from "@tauri-apps/plugin-dialog";
import * as ipc from "../../api/ipc";
import { toAppError } from "../../api/ipc";
import type { BisectTerm, Branch, DiffTarget, Remote, RemoteBranch } from "../../api/types";
import { splitArgs } from "../../lib/argv";
import { baseName } from "../../lib/paths";
import { useCmdHistoryStore } from "../../store/cmdHistoryStore";
import { useCommitStore } from "../../store/commitStore";
import { useDialogStore } from "../../store/dialogStore";
import { treeTargetOf, useDiffStore } from "../../store/diffStore";
import { runOp, selectRunning, useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useStatusStore } from "../../store/statusStore";
import { useTabsStore } from "../../store/tabsStore";
import { toastError, useToastStore } from "../../store/toastStore";
import { useViewStore } from "../../store/viewStore";
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
  runOp(`Fetching ${remote ?? "all remotes"}…`, (id) => ipc.fetch(id, remote, true, false), { success: `Fetched ${remote ?? "all remotes"}`, remote: remote ?? true });

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

/**
 * Moves a branch to remote branch `target` (its full ref, `refs/remotes/origin/x`) and checks it out, in
 * one `git checkout -B`: a failed checkout leaves the branch where it was, and git makes `target` its
 * upstream. `expect` is where the branch was seen: one moved since is refused rather than carried off;
 * `at` is where `target` was seen: one a fetch moved since is refused rather than landed on.
 */
export const checkoutAndResetBranch = (branch: string, target: string, expect: string, at: string) =>
  runOp(`Checking out ${branch}…`, (id) => ipc.checkout(id, target, branch, false, false, true, expect, at), {
    success: `Checked out ${branch} at ${target.replace(/^refs\/remotes\//, "")}`,
  });

/** The current branch onto remote branch `remote` (`origin/x`, seen at `at`), only if that is a fast-forward; no fetch. */
export const fastForwardTo = (branch: string, remote: string, at: string) =>
  runOp(`Fast-forwarding ${branch}…`, (id) => ipc.merge(id, `refs/remotes/${remote}`, "only", false, null, at), { success: `Fast-forwarded ${branch} to ${remote}` });

/** Tag or commit → detached HEAD. */
export const checkoutDetached = (target: string, label = target) =>
  runOp(`Checking out ${label}…`, (id) => ipc.checkout(id, target, null, false, true), { success: `Checked out ${label} (detached)` });

/** Tag → detached HEAD, by its full ref: `git checkout` reads a bare name as a branch first, so a branch called the same would win. */
export const checkoutTag = (name: string) => checkoutDetached(`refs/tags/${name}`, name);

export const mergeAbort = () => runOp("Aborting merge…", (id) => ipc.mergeAbort(id), { success: "Merge aborted" });
export const rebaseAbort = () => runOp("Aborting rebase…", (id) => ipc.rebaseAbort(id), { success: "Rebase aborted" });
export const rebaseContinue = () => runOp("Continuing rebase…", (id) => ipc.rebaseContinue(id), { success: "Rebase continued" });
export const rebaseSkip = () => runOp("Skipping the commit…", (id) => ipc.rebaseSkip(id), { success: "Commit skipped" });
export const cherryPickAbort = () => runOp("Aborting cherry-pick…", (id) => ipc.cherryPickAbort(id), { success: "Cherry-pick aborted" });
export const revertAbort = () => runOp("Aborting revert…", (id) => ipc.revertAbort(id), { success: "Revert aborted" });

/**
 * Marks `oid` — or HEAD from the banner's buttons. The first mark from a commit row starts the
 * bisect itself, and the backend decides that from the repository's own state: `refs` here can be
 * null or a refresh behind, and a second `git bisect start` wipes `refs/bisect/*` and the log.
 */
export const bisectMark = (term: BisectTerm, oid?: string) =>
  runOp(`git bisect ${term}…`, (id) => ipc.bisectMark(id, term, oid ?? null), { success: `Marked ${oid ? oid.slice(0, 7) : "HEAD"} ${term}` });

export const bisectReset = () => runOp("Resetting the bisect…", (id) => ipc.bisectReset(id), { success: "Bisect reset" });

export const stashApply = (index: number) => runOp(`Applying stash@{${index}}…`, (id) => ipc.stashApply(id, index), { success: `Applied stash@{${index}}` });
export const stashPop = (index: number) => runOp(`Popping stash@{${index}}…`, (id) => ipc.stashPop(id, index), { success: `Popped stash@{${index}}` });
export const worktreePrune = () => runOp("Pruning worktrees…", (id) => ipc.worktreePrune(id), { success: "Worktrees pruned" });
export const worktreeUnlock = (path: string) => runOp("Unlocking the worktree…", (id) => ipc.worktreeUnlock(id, path), { success: "Worktree unlocked" });
/** One submodule, or every one of them when `path` is left out. */
export const submoduleUpdate = (path: string | null = null) =>
  runOp(`Updating ${path ?? "submodules"}…`, (id) => ipc.submoduleUpdate(id, path), { success: path ? `Updated ${path}` : "Submodules updated" });

/** Confirmed: a dropped stash has no undo. Named by both index and message — the index shifts with every drop, the message is what the user recognises. */
export async function stashDrop(index: number, message: string) {
  if (refusedWhileRunning("dropping a stash")) return;
  // The confirmation is part of the drop, so it is busy from here: a second one answered while this
  // prompt is still up would drop by an index this one has already shifted.
  const busy = `Dropping stash@{${index}}…`;
  useOpsStore.setState({ busy });
  // No confirmation available (no Tauri dialog plugin) → treat it as declined; nothing is lost.
  const ok = await ask(`Drop stash@{${index}} "${message}"? This cannot be undone.`, { title: "Drop stash", kind: "warning", cancelLabel: "Cancel", okLabel: "Drop" }).catch(() => false);
  // `runOp` sets it again — and refuses outright if it is still held.
  useOpsStore.setState({ busy: null });
  if (!ok) return;
  return runOp(busy, (id) => ipc.stashDrop(id, index), { success: `Dropped stash@{${index}}` });
}

/** Confirmed like a drop, and named by the count — it is every entry at once. */
export async function stashClear(count: number) {
  if (refusedWhileRunning("clearing the stashes")) return;
  const busy = "Dropping every stash…";
  useOpsStore.setState({ busy });
  const ok = await ask(`Drop all ${count} stash${count === 1 ? "" : "es"}? This cannot be undone.`, {
    title: "Clear stashes",
    kind: "warning",
    cancelLabel: "Cancel",
    okLabel: "Drop all",
  }).catch(() => false);
  useOpsStore.setState({ busy: null });
  if (!ok) return;
  return runOp(busy, (id) => ipc.stashClear(id), { success: `Dropped ${count} stash${count === 1 ? "" : "es"}` });
}

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
  return runOp(busyLabel(gitCmd(parsed.args)), (id) => ipc.runGit(id, parsed.args), {
    quietFailure: true,
    // Which remote a typed line talked to is anybody's guess: ask them all.
    remote: ["fetch", "push", "pull"].includes(parsed.args[0]) ? true : undefined,
  });
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

/**
 * Hands one file's two sides of `target` to the external diff tool (Settings > Diff tool). Nothing
 * waits for it: the tool outlives the call, and an unstaged diff gets the working file itself, so
 * saving in the tool lands in the working tree.
 */
export async function openInDiffTool(target: DiffTarget, path: string, oldPath: string | null) {
  const repo = useRepoStore.getState().repo;
  if (!repo) return;
  try {
    const tool = await ipc.openDiffTool(repo.id, target, path, oldPath);
    useToastStore.getState().push({ kind: "info", title: `Opened ${path} in ${tool}` });
  } catch (e) {
    toastError(toAppError(e), "Couldn't open the diff tool");
  }
}

/**
 * Selects commit `oid` in the grid and shows `path` at it on the Files tab with the blame gutter on.
 * Every way into blame goes through this: the row menus, and a hunk's own "Select in graph" / "Blame
 * parent" — which is the drill-down, since the Files tab follows the grid selection.
 *
 * The reveal comes first, and nothing else happens unless it hits: `revealOid` misses when the grid
 * is under a text filter or a `Head`-only spec, and then the toast is all — the view, the dialog and
 * the tab stay as they were. A commit the details pane already shows counts as a hit: a stash
 * preview's (the walk never holds `refs/stash`) or a compare's *to*. The tree selection is seeded
 * after the reveal either way: `selectTreePathAt` applies it at once when the pane has already
 * loaded that commit, and pins it through the pane's `load` when that is still to come.
 *
 * `at`, from a blame row: the line to land on in `oid`'s file and its height on screen
 * (`diffStore.revealLine`), so the drill-down shows the line that was clicked, not line 1.
 */
export async function blameAt(oid: string, path: string, at?: { line: number; y: number }) {
  const held = useDiffStore.getState();
  const t = treeTargetOf(held.target);
  const repoId = useRepoStore.getState().repo?.id;
  // The repo too: in Changes the store can still hold another tab's commit, and worktrees share oids.
  const sameRepo = held.repoId === repoId;
  const onScreen = sameRepo && t?.kind === "commit" && t.oid === oid;
  const fromHistory = useViewStore.getState().view === "history";
  const hit = await useRepoStore.getState().revealOid(oid);
  // Another tab came forward during the reveal: this blame belonged to the one that left.
  if (useRepoStore.getState().repo?.id !== repoId) return;
  if (!hit && !onScreen) {
    useToastStore.getState().push({ kind: "info", title: "Not in the current view — clear the filter" });
    return;
  }
  // Before the seed: on the current commit `selectTreePath` keeps the line only for its own file.
  useDiffStore.setState({ revealLine: at && repoId ? { repoId, oid, path, ...at } : null });
  // Whether the pane reloads after the seed: its reload carries the path filter's file, which would
  // overwrite it. It does when it mounts (from Changes) or its repo changes; a hit that ends a compare
  // reloads it too, but the reveal's own state change may have re-rendered it already — only a range
  // the store still holds means that load is still to come. History before *and* after the reveal: a
  // view switch during it unmounts the pane, and a remount reloads (a stale pin is the safe side).
  const inHistory = fromHistory && useViewStore.getState().view === "history";
  const reloads = !inHistory || !sameRepo || (hit && useDiffStore.getState().target?.kind === "commitRange");
  // The blame shows in the History layout. From the Changes view the click changed nothing on screen;
  // from the commit dialog it changed the view *behind* the dialog. A diff window stays: it is bound to
  // the same store, so it shows the blame itself and a hunk click drills down inside it. The Stashes
  // browser closes on a hit too, and drops its preview — which its own effect may have put back during
  // the reveal — so History lands on the commit; a miss keeps it open.
  const kind = useDialogStore.getState().dialog?.kind;
  if (kind === "commit" || (kind === "stashes" && hit)) useDialogStore.getState().close();
  if (kind === "stashes" && hit) useRepoStore.getState().previewStash(null);
  useViewStore.getState().setView("history");
  const diff = useDiffStore.getState();
  diff.setTab("files");
  diff.selectTreePathAt(oid, path, reloads);
  diff.setBlameOn(true);
}

/**
 * "History" from any file row: a path filter on the grid, so the rows are the commits that touched
 * `path` (renames followed). Every entry point resolves the file to its *tracked* path first — the
 * name git knows it by — since that is what `--follow` starts from. The text filter composes, and
 * the chip beside the search box is what clears this one.
 */
export function showHistory(path: string) {
  // The filtered grid is the result, and it sits behind any dialog the row menu was opened in. One
  // dialog is open at a time and the click came from inside it. From the Stashes browser, its stash
  // preview goes too: the pane follows the grid. A sidebar stash preview stays.
  const fromStashes = useDialogStore.getState().dialog?.kind === "stashes";
  useDialogStore.getState().close();
  if (fromStashes) useRepoStore.getState().previewStash(null);
  useViewStore.getState().setView("history");
  const st = useRepoStore.getState();
  void st.startLog(st.spec, { ...st.filter, path });
}

export function copyText(text: string, what: string) {
  void writeText(text)
    .then(() => useToastStore.getState().push({ kind: "info", title: `Copied ${what}`, detail: text }))
    .catch((e: unknown) => useToastStore.getState().push({ kind: "error", title: "Copy failed", detail: String(e) }));
}

/**
 * Into the Changes view with the working-tree row selected: the grid's row and its keyboard nav,
 * the empty-repo button, the banners, the palette. A filtered walk has no working-tree row to
 * select, so the filter is cleared first (the search box follows the store).
 */
export function openCommitPanel() {
  const st = useRepoStore.getState();
  if (st.log.flat) void st.startLog(st.spec, { ...st.filter, text: null, path: null });
  st.selectWorkingTree();
  useViewStore.getState().setView("changes");
}

/**
 * Leaving the repository while an operation runs against it is refused: the op would finish
 * — and refresh — against a repository that is no longer the open one. A commit (and the staging
 * mutations, which share its `busy`) never touches `opsStore`, so it is checked too.
 */
export function refusedWhileRunning(before: string): boolean {
  if (!isRunning()) return false;
  useToastStore.getState().push({ kind: "info", title: "Operation in progress", detail: `Wait for it to finish before ${before}` });
  return true;
}

const isRunning = () => selectRunning(useOpsStore.getState()) || useCommitStore.getState().busy;

/** Opens in flight or waiting, chained so they run one at a time, in the order they came. */
let waiting: Promise<unknown> = Promise.resolve();
let queued = 0;

/**
 * For a tab dropped in from another window, or taken back from one that never opened. Neither can be
 * refused like `refusedWhileRunning`'s switches: a drop's repository holder has already moved here
 * (`drop_tab`), and a taken-back tab already left this window (`detach` closed it once
 * `spawnWindow` returned), so a refusal would lose it. So it waits: for an operation, the whole of
 * `commit()` (its tail after `busy` — status refresh, `syncRefs` — ends in Commit & Push opening
 * Push), and any open dialog, which `openTab` would close. `open` runs at once when none of that is
 * so and nothing is queued; otherwise once it is, after every open queued before it — one that ran
 * at once included, so several handed over together still open one at a time.
 */
export function openWhenIdle(path: string, open: () => Promise<void>): Promise<void> {
  const busy = () => isRunning() || useCommitStore.getState().inCommit || !!useDialogStore.getState().dialog;
  const now = !queued && !busy();
  if (busy()) useToastStore.getState().push({ kind: "info", title: "Waiting to open", detail: `${baseName(path)} opens when the current operation or dialog closes` });
  // At once: synchronous, as before, so a throw still reaches the caller and nothing is queued.
  const first = now ? open() : null;
  queued++;
  const run = (first ?? waiting.then(
    () =>
      new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        // Checked a task later, and again in the task that opens: what a finished commit does next —
        // Commit & Push closing the commit dialog, then opening Push — runs in the microtasks after
        // `commit()` returns, and nothing can start between that last check and `open`.
        const check = () => {
          if (timer || busy()) return;
          timer = setTimeout(() => {
            timer = undefined;
            if (busy()) return;
            for (const u of unsubscribe) u();
            // Still synchronous, but a throw rejects `run` rather than leave the queue stuck.
            new Promise<void>((r) => r(open())).then(resolve, reject);
          });
        };
        const unsubscribe = [useOpsStore.subscribe(check), useCommitStore.subscribe(check), useDialogStore.subscribe(check)];
        check();
      }),
  )).finally(() => queued--);
  waiting = run.catch(() => undefined);
  return run;
}

/** Opens another repository in a tab of this window (toolbar repo menu, recents, a worktree row). */
export function switchRepo(path: string) {
  if (refusedWhileRunning("opening another repository")) return;
  void useTabsStore
    .getState()
    .openTab(path)
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
 * Closes the active tab (repo menu / Ctrl+W) — the last one leaves the start screen, or closes a
 * secondary window. Refused while a dialog owns the window or an operation is running.
 */
export function closeTab() {
  const active = useTabsStore.getState().active;
  if (!active || useDialogStore.getState().dialog) return;
  if (refusedWhileRunning("closing the tab")) return;
  void useTabsStore.getState().closeTab(active);
}

/**
 * Quits the app (repo menu / Ctrl+Q): every window closes at once and they all come back next
 * launch, where closing them one at a time drops each from the saved layout.
 */
export function quitApp() {
  void ipc.quit().catch((e: unknown) => toastError(toAppError(e), "Couldn't quit"));
}

/** Moves the active tab to a window of its own (repo menu / Ctrl+Shift+N). */
export function detachTab() {
  const active = useTabsStore.getState().active;
  if (!active || useDialogStore.getState().dialog) return;
  if (refusedWhileRunning("moving the tab to a new window")) return;
  void useTabsStore.getState().detach(active);
}

/** Refs + status + a fresh walk (toolbar Refresh / F5). `refresh` / `startLog` report their own errors. */
export function refreshAll() {
  const st = useRepoStore.getState();
  void st.refreshRefs().catch((e: unknown) => {
    const err = toAppError(e);
    // `notOpen` after a close just means the repo is gone.
    // Named: the toast stays until dismissed, and the failure can land after a tab switch.
    if (err.kind !== "notOpen") toastError(err, `${st.repo?.name}: Couldn't refresh references`);
  });
  void useStatusStore.getState().refresh();
  void st.startLog(st.spec, st.filter);
}
