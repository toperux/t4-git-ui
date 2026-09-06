import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileDiff, RefsSnapshot, RepoSummary, StatusEntry, WorkdirStatus } from "../api/types";

/** `commit()` refreshes status + refs afterwards; both resolve so the promise settles. */
const REFS = vi.hoisted<RefsSnapshot>(() => ({ head: { oid: "h", branch: "main", detached: false }, state: "clean", local: [], remotes: [], tags: [], stashes: [] }));

vi.mock("../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/ipc")>();
  return {
    ...actual,
    getFileDiff: vi.fn(),
    getChangedFiles: vi.fn(() => Promise.resolve([])),
    getStatus: vi.fn(() => Promise.resolve({ entries: [], staged: 0, unstaged: 0, untracked: 0, conflicted: 0 })),
    getRefs: vi.fn(() => Promise.resolve(REFS)),
    refreshLabels: vi.fn(() => Promise.resolve(1)),
    startLog: vi.fn(() => Promise.resolve(1)),
    getLogPage: vi.fn(() => new Promise(() => {})),
    commit: vi.fn(),
    getHeadMessage: vi.fn(),
    getMergeMessage: vi.fn(() => Promise.resolve(null)),
    getAuthor: vi.fn(() => Promise.resolve({ name: "Ada", email: "ada@x" })),
    stagePaths: vi.fn(() => Promise.resolve()),
    unstagePaths: vi.fn(() => Promise.resolve()),
    discardPaths: vi.fn((_id: string, paths: string[]) => Promise.resolve(paths)),
    resolveConflict: vi.fn(() => Promise.resolve()),
    stageHunks: vi.fn(() => Promise.resolve()),
    stageLines: vi.fn(() => Promise.resolve()),
    discardHunks: vi.fn(() => Promise.resolve()),
    discardLines: vi.fn(() => Promise.resolve()),
  };
});

const ask = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask }));

import * as ipc from "../api/ipc";
import { useCommitStore } from "./commitStore";
import { useDiffStore } from "./diffStore";
import { __resetForTests as resetRepo, useRepoStore } from "./repoStore";
import { __resetForTests as resetStatus, useStatusStore } from "./statusStore";
import { useToastStore } from "./toastStore";

type MockName =
  | "getFileDiff"
  | "getChangedFiles"
  | "commit"
  | "getHeadMessage"
  | "getMergeMessage"
  | "getAuthor"
  | "stagePaths"
  | "unstagePaths"
  | "discardPaths"
  | "resolveConflict"
  | "stageHunks"
  | "stageLines"
  | "discardHunks"
  | "discardLines";
const mocked = ipc as unknown as Record<MockName, ReturnType<typeof vi.fn>>;
const REPO: RepoSummary = { id: "r", name: "r", path: "r", head: { oid: "h", branch: "main", detached: false } };

const entry = (path: string, workdir: StatusEntry["workdir"] = "modified", stamp: string | null = "1:1"): StatusEntry => ({ path, oldPath: null, index: null, workdir, conflicted: false, workdirStamp: stamp });

const status = (entries: StatusEntry[]): WorkdirStatus => ({ entries, staged: 0, unstaged: entries.length, untracked: 0, conflicted: 0 });

const diff = (path: string, text: string): FileDiff => ({
  path,
  oldPath: null,
  status: "modified",
  binary: false,
  truncated: false,
  maxLines: 20_000,
  additions: 1,
  deletions: 0,
  hunks: [{ header: "@@ -1 +1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "add", oldNo: null, newNo: 1, text, noNewline: false }] }],
});

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  // `clearAllMocks` only: the module-level `vi.mock` factory installs the default implementations.
  vi.clearAllMocks();
  localStorage.clear();
  resetRepo();
  resetStatus();
  useRepoStore.setState({ repo: REPO, refs: REFS, log: { generation: 1, total: 0, complete: true, error: null, flat: false } });
  useToastStore.setState({ toasts: [] });
  useCommitStore.getState().reset();
  useDiffStore.setState({ context: 3 });
  mocked.getFileDiff.mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve(diff(path, "a")));
  ask.mockResolvedValue(true);
});

/** Drives one `repo://changed` round: the panel feeds a fresh status into the store. */
async function sync(entries: StatusEntry[]) {
  const st = status(entries);
  useStatusStore.setState({ status: st, error: null });
  useCommitStore.getState().syncWithStatus(st);
  await flush();
}

describe("commitStore.syncWithStatus", () => {
  it("does not reload the shown diff when an unrelated file changed", async () => {
    await sync([entry("a.rs"), entry("b.rs")]);
    expect(mocked.getFileDiff).toHaveBeenCalledTimes(1);
    const shown = useCommitStore.getState().diff;

    // An IDE autosaves an untracked file: same anchor, same entry → no reload, same object identity.
    await sync([entry("a.rs"), entry("b.rs"), entry("c.txt", "untracked")]);
    expect(mocked.getFileDiff).toHaveBeenCalledTimes(1);
    expect(useCommitStore.getState().diff).toBe(shown);
  });

  it("reloads when the shown file was edited on disk, which the status letters do not show", async () => {
    // Resolving a conflict in an external editor (or any save while the panel is open) rewrites the
    // file and leaves its entry exactly as it was — conflicted until staged, modified otherwise. The
    // stamp is the only part of the entry that moves, and the diff on screen is stale without it.
    await sync([entry("a.rs")]);
    expect(mocked.getFileDiff).toHaveBeenCalledTimes(1);

    await sync([entry("a.rs", "modified", "2:9")]);
    expect(mocked.getFileDiff).toHaveBeenCalledTimes(2);
  });

  it("reloads when the shown file's own status entry changed, keeping identity for equal hunks", async () => {
    await sync([entry("a.rs")]);
    const shown = useCommitStore.getState().diff;

    // Same content on the wire → the object is reused so the viewer keeps its scroll and selection.
    await sync([entry("a.rs", "typechange")]);
    expect(mocked.getFileDiff).toHaveBeenCalledTimes(2);
    expect(useCommitStore.getState().diff).toBe(shown);

    mocked.getFileDiff.mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve(diff(path, "b")));
    await sync([entry("a.rs")]);
    expect(useCommitStore.getState().diff).not.toBe(shown);
  });

  it("refetches the `+N −M` stats only when the entry list changed", async () => {
    await sync([entry("a.rs")]);
    expect(mocked.getChangedFiles).toHaveBeenCalledTimes(2); // unstaged + staged

    await sync([entry("a.rs")]); // identical status → no whole-tree walk
    expect(mocked.getChangedFiles).toHaveBeenCalledTimes(2);

    await sync([entry("a.rs"), entry("b.rs")]);
    expect(mocked.getChangedFiles).toHaveBeenCalledTimes(4);
  });

  it("a vanished anchor lands on its display neighbour: the row below, else the last one above", async () => {
    await sync([entry("a.rs"), entry("b.rs"), entry("c.rs")]);
    const st = useCommitStore.getState();
    // A tree shows the files in an order that is not status order.
    st.setOrder("unstaged", ["c.rs", "a.rs", "b.rs"]);
    st.select("unstaged", { selected: ["a.rs"], anchor: "a.rs" });
    await flush();

    // Staging a.rs: the list re-registers its order before the status sync prunes (child effect first).
    st.setOrder("unstaged", ["c.rs", "b.rs"]);
    await sync([entry("b.rs"), entry("c.rs")]);
    expect(useCommitStore.getState()).toMatchObject({ list: "unstaged", anchor: "b.rs", selected: ["b.rs"], diffPath: "b.rs" });
    expect(mocked.getFileDiff).toHaveBeenCalledTimes(2); // a.rs, then b.rs once — the sync sees it already shown

    // The last row falls back to the one above it.
    useCommitStore.getState().setOrder("unstaged", ["c.rs"]);
    await sync([entry("c.rs")]);
    expect(useCommitStore.getState()).toMatchObject({ anchor: "c.rs", selected: ["c.rs"] });
  });

  it("a surviving multi-selection keeps its rows and only loses the focus", async () => {
    await sync([entry("a.rs"), entry("b.rs"), entry("c.rs")]);
    useCommitStore.getState().setOrder("unstaged", ["a.rs", "b.rs", "c.rs"]);
    useCommitStore.getState().select("unstaged", { selected: ["a.rs", "b.rs"], anchor: "b.rs" });
    await flush();
    useCommitStore.getState().setOrder("unstaged", ["a.rs", "c.rs"]);
    await sync([entry("a.rs"), entry("c.rs")]);
    expect(useCommitStore.getState()).toMatchObject({ selected: ["a.rs"], anchor: null });
  });

  it("with no list mounted (no order registered) a vanished anchor falls to the first row", async () => {
    await sync([entry("a.rs"), entry("b.rs"), entry("c.rs")]);
    useCommitStore.getState().select("unstaged", { selected: ["b.rs"], anchor: "b.rs" });
    await flush();
    await sync([entry("a.rs"), entry("c.rs")]);
    expect(useCommitStore.getState()).toMatchObject({ list: "unstaged", anchor: "a.rs", selected: ["a.rs"] });
  });

  it("an emptied list hands the selection to the other list", async () => {
    await sync([entry("a.rs")]);
    expect(useCommitStore.getState()).toMatchObject({ list: "unstaged", anchor: "a.rs" });

    // Everything staged: the unstaged list is empty, so the focus moves to the staged one.
    const staged: WorkdirStatus = { entries: [{ path: "a.rs", oldPath: null, index: "modified", workdir: null, conflicted: false, workdirStamp: null }], staged: 1, unstaged: 0, untracked: 0, conflicted: 0 };
    useStatusStore.setState({ status: staged, error: null });
    useCommitStore.getState().syncWithStatus(staged);
    await flush();
    expect(useCommitStore.getState()).toMatchObject({ list: "staged", anchor: "a.rs", selected: ["a.rs"] });
  });

  it("an empty status clears the selection and the diff", async () => {
    await sync([entry("a.rs")]);
    await sync([]);
    expect(useCommitStore.getState()).toMatchObject({ selected: [], anchor: null, diff: null, diffPath: null });
  });
});

describe("commitStore mutations", () => {
  it("hunk / line staging reverses only when the staged diff is shown", async () => {
    await sync([entry("a.rs")]);
    await useCommitStore.getState().stageHunk(0);
    expect(mocked.stageHunks).toHaveBeenCalledWith(REPO.id, "a.rs", [0], false, 3);

    useCommitStore.setState({ diffList: "staged" });
    await useCommitStore.getState().stageHunk(2);
    expect(mocked.stageHunks).toHaveBeenLastCalledWith(REPO.id, "a.rs", [2], true, 3);
    await useCommitStore.getState().stageLines([[0, 1]]);
    expect(mocked.stageLines).toHaveBeenLastCalledWith(REPO.id, "a.rs", [[0, 1]], true, 3);
  });

  it("hunk / line discard asks first and sends the context the diff was loaded with", async () => {
    useDiffStore.setState({ context: 8 });
    await sync([entry("a.rs")]);

    await useCommitStore.getState().discardHunk(1);
    expect(ask.mock.calls[0][0]).toContain("Discard this hunk from a.rs?");
    expect(mocked.discardHunks).toHaveBeenCalledWith(REPO.id, "a.rs", [1], 8);

    await useCommitStore.getState().discardLines([[0, 1]]);
    expect(ask.mock.calls[1][0]).toContain("Discard 1 selected line from a.rs?");
    expect(mocked.discardLines).toHaveBeenCalledWith(REPO.id, "a.rs", [[0, 1]], 8);

    // Declined → nothing leaves the store.
    ask.mockResolvedValue(false);
    await useCommitStore.getState().discardHunk(0);
    expect(mocked.discardHunks).toHaveBeenCalledTimes(1);
  });

  it("a context change rebuilds the panel diff, and the rebuilt one's context is what the next action sends", async () => {
    await sync([entry("a.rs")]);
    expect(mocked.getFileDiff).toHaveBeenLastCalledWith(REPO.id, { kind: "unstaged" }, "a.rs", { context: 3 });

    // Settings → Context lines: the details pane reloads on its own, the panel has to follow, or the
    // hunks on screen keep the old shape while the next stage / discard is resolved with the new one.
    useDiffStore.getState().setContext(8);
    await flush();
    expect(mocked.getFileDiff).toHaveBeenLastCalledWith(REPO.id, { kind: "unstaged" }, "a.rs", { context: 8 });
    await useCommitStore.getState().stageHunk(0);
    expect(mocked.stageHunks).toHaveBeenCalledWith(REPO.id, "a.rs", [0], false, 8);
  });

  it("sends the context of the diff on screen while its rebuild is still in flight", async () => {
    await sync([entry("a.rs")]);
    mocked.getFileDiff.mockImplementation(() => new Promise(() => {}));
    useDiffStore.getState().setContext(8);
    await flush();

    // The reload has not landed: what the user sees is still the context-3 diff, so its indices are.
    await useCommitStore.getState().stageHunk(0);
    expect(mocked.stageHunks).toHaveBeenCalledWith(REPO.id, "a.rs", [0], false, 3);
  });

  it("drops a discard whose diff was replaced while the confirmation was up", async () => {
    await sync([entry("a.rs")]);
    // A formatter-on-save rewrites the file behind the native dialog and the panel reloads: the hunk
    // index the user picked belongs to the diff they were looking at, not to this one.
    const swap = () => {
      useCommitStore.setState({ diff: diff("a.rs", "reloaded") });
      return Promise.resolve(true);
    };

    ask.mockImplementationOnce(swap);
    await useCommitStore.getState().discardHunk(0);
    expect(mocked.discardHunks).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts[0]).toMatchObject({ kind: "info", title: "Discard cancelled" });

    ask.mockImplementationOnce(swap);
    await useCommitStore.getState().discardLines([[0, 1]]);
    expect(mocked.discardLines).not.toHaveBeenCalled();
  });

  it("discardLines: a declined confirmation deletes nothing, a failed one toasts", async () => {
    await sync([entry("a.rs")]);
    ask.mockResolvedValue(false);
    await useCommitStore.getState().discardLines([[0, 1]]);
    expect(mocked.discardLines).not.toHaveBeenCalled();

    ask.mockResolvedValue(true);
    mocked.discardLines.mockRejectedValueOnce({ kind: "git", message: "boom" });
    await useCommitStore.getState().discardLines([[0, 1]]);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ kind: "error", title: "Discard failed", detail: "boom" });
  });

  it("stages one hunk after another and reloads the diff every time", async () => {
    // Staging a hunk of a file that has more leaves the entry at modified/modified. The shown diff
    // changed, its status entry did not — and the indices of what is left come from that diff, so a
    // stale one stages the wrong hunk next.
    const partlyStaged: StatusEntry = { path: "a.rs", oldPath: null, index: "modified", workdir: "modified", conflicted: false, workdirStamp: "1:1" };
    await sync([entry("a.rs")]);
    expect(mocked.getFileDiff).toHaveBeenCalledTimes(1);

    await useCommitStore.getState().stageHunk(0);
    await sync([partlyStaged]);
    expect(mocked.getFileDiff).toHaveBeenCalledTimes(2);

    await useCommitStore.getState().stageHunk(0);
    await sync([partlyStaged]);
    expect(mocked.getFileDiff).toHaveBeenCalledTimes(3);

    await useCommitStore.getState().stageLines([[0, 1]]);
    await sync([partlyStaged]);
    expect(mocked.getFileDiff).toHaveBeenCalledTimes(4);

    // The `+N −M` beside the file moves with every stage too, and its guard is the same entry list.
    expect(mocked.getChangedFiles).toHaveBeenCalledTimes(8); // 4 rounds × (unstaged + staged)
  });

  it("hunk / line staging is a no-op without a shown diff or an empty selection", async () => {
    await useCommitStore.getState().stageHunk(0);
    expect(mocked.stageHunks).not.toHaveBeenCalled();
    await sync([entry("a.rs")]);
    await useCommitStore.getState().stageLines([]);
    expect(mocked.stageLines).not.toHaveBeenCalled();
  });

  it("discard: confirmed → true, declined → false, and the wording follows untracked files", async () => {
    const entries = [entry("a.rs"), entry("new.txt", "untracked")];
    // `run` refreshes the status afterwards (mocked empty), so restore it before each discard.
    const restore = () => useStatusStore.setState({ status: status(entries), error: null });

    restore();
    await expect(useCommitStore.getState().discard(["a.rs"])).resolves.toBe(true);
    expect(mocked.discardPaths).toHaveBeenCalledWith(REPO.id, ["a.rs"]);
    expect(ask.mock.calls[0][0]).toContain("Discard changes in a.rs?");

    // Only untracked files → the dialog says "delete", not "discard".
    restore();
    await useCommitStore.getState().discard(["new.txt"]);
    expect(ask.mock.calls[1][0]).toContain("Untracked files are removed from disk");
    expect(ask.mock.calls[1][1]).toMatchObject({ okLabel: "Delete" });

    // Mixed → both halves are spelled out.
    restore();
    await useCommitStore.getState().discard(["a.rs", "new.txt"]);
    expect(ask.mock.calls[2][0]).toContain("1 untracked file is deleted");

    ask.mockResolvedValue(false);
    mocked.discardPaths.mockClear();
    await expect(useCommitStore.getState().discard(["a.rs"])).resolves.toBe(false);
    expect(mocked.discardPaths).not.toHaveBeenCalled();
  });

  it("keeping one side of a conflict names the branch in the confirmation before overwriting the file", async () => {
    await sync([entry("a.rs")]);
    await useCommitStore.getState().resolveConflict(["a.rs"], "theirs", "feature");
    expect(ask.mock.calls[0][0]).toBe("Replace a.rs with feature's version? Your edits to it are lost.");
    expect(ask.mock.calls[0][1]).toMatchObject({ okLabel: "Replace", kind: "warning" });
    expect(mocked.resolveConflict).toHaveBeenCalledWith(REPO.id, ["a.rs"], "theirs");

    await useCommitStore.getState().resolveConflict(["a.rs", "b.rs"], "ours", "main");
    expect(ask.mock.calls[1][0]).toBe("Replace 2 files with main's version? Your edits to them are lost.");

    // Declined → the working files are untouched.
    ask.mockResolvedValue(false);
    await useCommitStore.getState().resolveConflict(["a.rs"], "ours", "main");
    expect(mocked.resolveConflict).toHaveBeenCalledTimes(2);
  });

  it("discard returns false when another mutation is already running", async () => {
    useCommitStore.setState({ busy: true });
    await expect(useCommitStore.getState().discard(["a.rs"])).resolves.toBe(false);
    expect(mocked.discardPaths).not.toHaveBeenCalled();
  });

  it("a failed mutation toasts; a locked index offers a Retry that runs it again", async () => {
    mocked.stagePaths.mockRejectedValueOnce({ kind: "git", message: "boom" });
    await useCommitStore.getState().stage(["a.rs"]);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ kind: "error", title: "Stage failed", detail: "boom" });

    useToastStore.setState({ toasts: [] });
    mocked.unstagePaths.mockRejectedValueOnce({ kind: "indexLocked", message: "index.lock" });
    await useCommitStore.getState().unstage(["a.rs"]);
    const t = useToastStore.getState().toasts[0];
    expect(t).toMatchObject({ kind: "error", title: "Unstage failed", detail: "Index is locked — another git process is running" });
    t.action!.onClick();
    await flush();
    expect(mocked.unstagePaths).toHaveBeenCalledTimes(2);
  });

  it("a mutation refused because another one is running says so — the Retry must not vanish silently", async () => {
    useCommitStore.setState({ busy: true });
    await useCommitStore.getState().stage(["a.rs"]);
    expect(mocked.stagePaths).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts).toMatchObject([{ kind: "info", title: "Operation in progress" }]);
  });
});

describe("commitStore.loadAuthor", () => {
  it("fetches once per repository, however many message columns ask", async () => {
    const load = () => useCommitStore.getState().loadAuthor();
    await Promise.all([load(), load()]);
    await load();
    expect(mocked.getAuthor).toHaveBeenCalledTimes(1);
    expect(useCommitStore.getState().author).toEqual({ name: "Ada", email: "ada@x" });

    // Another repository starts over.
    useRepoStore.setState({ repo: { ...REPO, id: "r2" } });
    expect(useCommitStore.getState().author).toBeNull();
    await load();
    expect(mocked.getAuthor).toHaveBeenLastCalledWith("r2");
  });

  it("keeps a failure but retries it on the next call — the user may have just set user.name", async () => {
    mocked.getAuthor.mockRejectedValueOnce({ kind: "config", message: "no identity" });
    await useCommitStore.getState().loadAuthor();
    expect(useCommitStore.getState()).toMatchObject({ author: null, authorError: { kind: "config" } });
    await useCommitStore.getState().loadAuthor();
    expect(mocked.getAuthor).toHaveBeenCalledTimes(2);
    expect(useCommitStore.getState()).toMatchObject({ author: { name: "Ada" }, authorError: null });
  });
});

describe("commitStore.setAmend", () => {
  it("prefills from HEAD only while the editor is untouched", async () => {
    mocked.getHeadMessage.mockResolvedValue("Old summary\n\nOld body\n");
    await useCommitStore.getState().setAmend(true);
    expect(useCommitStore.getState()).toMatchObject({ amend: true, summary: "Old summary", body: "Old body" });

    // Toggling off leaves the prefill in place — the user may still want to edit it.
    await useCommitStore.getState().setAmend(false);
    expect(useCommitStore.getState().amend).toBe(false);
    expect(mocked.getHeadMessage).toHaveBeenCalledTimes(1);

    // The prefill is still recognised as untouched, so a second amend refreshes it.
    mocked.getHeadMessage.mockResolvedValue("Newer summary\n");
    await useCommitStore.getState().setAmend(true);
    expect(useCommitStore.getState().summary).toBe("Newer summary");
  });

  it("never overwrites a message the user typed", async () => {
    mocked.getHeadMessage.mockResolvedValue("Old summary\n\nOld body\n");
    useCommitStore.setState({ summary: "Mine", body: "" });
    await useCommitStore.getState().setAmend(true);
    expect(useCommitStore.getState()).toMatchObject({ amend: true, summary: "Mine", prefill: null });
  });

  it("an unborn HEAD (null message) leaves the editor empty", async () => {
    mocked.getHeadMessage.mockResolvedValue(null);
    await useCommitStore.getState().setAmend(true);
    expect(useCommitStore.getState()).toMatchObject({ amend: true, summary: "", prefill: null });
  });
});

describe("commitStore.prefillPending", () => {
  it("fills the editor from MERGE_MSG when a merge stops, and takes it back when it is aborted", async () => {
    mocked.getMergeMessage.mockResolvedValue("Merge branch 'conflict'\n\nSome detail\n");
    useRepoStore.setState({ refs: { ...REFS, state: "merge" } });
    await flush();
    expect(useCommitStore.getState()).toMatchObject({ summary: "Merge branch 'conflict'", body: "Some detail" });

    // Abort: the editor is holding the message of a merge that is no longer happening.
    useRepoStore.setState({ refs: { ...REFS, state: "clean" } });
    await flush();
    expect(useCommitStore.getState()).toMatchObject({ summary: "", body: "", prefill: null });
  });

  it("never overwrites — or clears — a message the user typed", async () => {
    mocked.getMergeMessage.mockResolvedValue("Merge branch 'conflict'");
    useCommitStore.setState({ summary: "Mine" });
    useRepoStore.setState({ refs: { ...REFS, state: "merge" } });
    await flush();
    expect(useCommitStore.getState()).toMatchObject({ summary: "Mine", prefill: null });

    useRepoStore.setState({ refs: { ...REFS, state: "clean" } });
    await flush();
    expect(useCommitStore.getState().summary).toBe("Mine");
  });

  it("leaves the editor alone when the merge prepared no message", async () => {
    mocked.getMergeMessage.mockResolvedValue(null);
    useRepoStore.setState({ refs: { ...REFS, state: "merge" } });
    await flush();
    expect(mocked.getMergeMessage).toHaveBeenCalledTimes(1);
    expect(useCommitStore.getState()).toMatchObject({ summary: "", body: "", prefill: null });
  });

  it("never reads MERGE_MSG for a state the panel cannot commit (a stopped rebase / cherry-pick)", async () => {
    // Both write MERGE_MSG, but the banner sends the user to a terminal and the empty status drops
    // the working-tree selection: the message would sit in an editor with a disabled Commit.
    mocked.getMergeMessage.mockResolvedValue("Fix the parser");
    useRepoStore.setState({ refs: { ...REFS, state: "rebase" } });
    await flush();
    useRepoStore.setState({ refs: { ...REFS, state: "cherryPick" } });
    await flush();
    expect(mocked.getMergeMessage).not.toHaveBeenCalled();
    expect(useCommitStore.getState()).toMatchObject({ summary: "", body: "", prefill: null });
  });

  it("an abort keeps a Message-history pick: the user chose it, the merge did not", async () => {
    mocked.getMergeMessage.mockResolvedValue("Merge branch 'conflict'");
    useRepoStore.setState({ refs: { ...REFS, state: "merge" } });
    await flush();
    useCommitStore.getState().useMessage("Fix the parser\n\nwhy\n");
    useRepoStore.setState({ refs: { ...REFS, state: "clean" } });
    await flush();
    expect(useCommitStore.getState()).toMatchObject({ summary: "Fix the parser", body: "why", prefill: { from: "history" } });
  });

  it("a pending prefill resolving after an amend one was started does not overwrite it", async () => {
    // Mid-merge with the refs sync in flight, the user ticks Amend: the later start owns the editor.
    let resolveMerge!: (m: string) => void;
    mocked.getMergeMessage.mockImplementationOnce(() => new Promise<string>((r) => (resolveMerge = r)));
    mocked.getHeadMessage.mockResolvedValue("HEAD says");
    useRepoStore.setState({ refs: { ...REFS, state: "merge" } });
    await flush();
    await useCommitStore.getState().setAmend(true);
    expect(useCommitStore.getState().summary).toBe("HEAD says");
    resolveMerge("Merge branch 'conflict'");
    await flush();
    expect(useCommitStore.getState()).toMatchObject({ amend: true, summary: "HEAD says", prefill: { from: "amend" } });
  });

  it("switching to another repository mid-merge prefills that repository's message", async () => {
    mocked.getMergeMessage.mockResolvedValue("Merge branch 'one'");
    useRepoStore.setState({ refs: { ...REFS, state: "merge" } });
    await flush();
    mocked.getMergeMessage.mockResolvedValue("Merge branch 'two'");
    useRepoStore.setState({ repo: { ...REPO, id: "r2" }, refs: { ...REFS, state: "merge" } });
    await flush();
    expect(mocked.getMergeMessage).toHaveBeenLastCalledWith("r2");
    expect(useCommitStore.getState().summary).toBe("Merge branch 'two'");
  });

  it("an abort keeps an amend prefill: HEAD's message is still the right one", async () => {
    mocked.getHeadMessage.mockResolvedValue("HEAD says");
    useRepoStore.setState({ refs: { ...REFS, state: "merge" } });
    await flush();
    await useCommitStore.getState().setAmend(true);
    useRepoStore.setState({ refs: { ...REFS, state: "clean" } });
    await flush();
    expect(useCommitStore.getState()).toMatchObject({ summary: "HEAD says", amend: true });
  });
});

describe("commitStore.commit", () => {
  it("resolves the new oid and clears the editor, amend included", async () => {
    mocked.commit.mockResolvedValue("abcdef1234");
    useCommitStore.setState({ summary: "Fix lanes", body: "why", amend: true, prefill: { summary: "Fix lanes", body: "why", from: "amend" } });
    await expect(useCommitStore.getState().commit()).resolves.toBe("abcdef1234");
    // Commit & Push keys off the oid; a stale message must not survive into the next commit.
    expect(useCommitStore.getState()).toMatchObject({ summary: "", body: "", amend: false, prefill: null });
  });

  it("resolves null when the commit fails and keeps the message", async () => {
    mocked.commit.mockRejectedValue({ kind: "git", message: "boom" });
    useCommitStore.setState({ summary: "Fix lanes", body: "" });
    await expect(useCommitStore.getState().commit()).resolves.toBeNull();
    expect(useCommitStore.getState().summary).toBe("Fix lanes");
    expect(useToastStore.getState().toasts).toMatchObject([{ kind: "error", title: "Commit failed" }]);
  });

  it("a normal commit leaves amend off and records the message in history", async () => {
    mocked.commit.mockResolvedValue("1234567890");
    useCommitStore.setState({ summary: "Add lanes", body: "detail" });
    await useCommitStore.getState().commit();
    expect(mocked.commit).toHaveBeenCalledWith(REPO.id, "Add lanes\n\ndetail\n", false, false);
    expect(useCommitStore.getState()).toMatchObject({ summary: "", body: "", amend: false });
    expect(useToastStore.getState().toasts).toMatchObject([{ kind: "success", title: "Committed", detail: "1234567 Add lanes" }]);
    expect(JSON.parse(localStorage.getItem(`msgHistory:${REPO.id}`)!)).toEqual(["Add lanes\n\ndetail\n"]);
  });

  it("an amend toasts as an amend", async () => {
    mocked.commit.mockResolvedValue("abcdef1234");
    useCommitStore.setState({ summary: "Fix", body: "", amend: true, signoff: true });
    await useCommitStore.getState().commit();
    expect(mocked.commit).toHaveBeenCalledWith(REPO.id, "Fix\n", true, true);
    expect(useToastStore.getState().toasts).toMatchObject([{ kind: "success", title: "Amended HEAD" }]);
  });

  it("refuses without a summary or while busy", async () => {
    useCommitStore.setState({ summary: "   ", body: "" });
    await expect(useCommitStore.getState().commit()).resolves.toBeNull();
    useCommitStore.setState({ summary: "ok", busy: true });
    await expect(useCommitStore.getState().commit()).resolves.toBeNull();
    expect(mocked.commit).not.toHaveBeenCalled();
  });
});
