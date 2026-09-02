import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot, WorkdirStatus } from "../../../api/types";
import { useCommitStore } from "../../../store/commitStore";
import { useRepoStore } from "../../../store/repoStore";
import { useDialogStore } from "../../../store/dialogStore";
import { useStatusStore } from "../../../store/statusStore";
import { __resetForTests as resetTreeMode, useTreeModeStore } from "../../../store/treeModeStore";
import { CommitDialog } from "../dialogs/CommitDialog";
import { CommitPanel, useCommitSync } from "./CommitPanel";

/** `commit()` refreshes status + refs afterwards; the refs side resolves so the promise settles. */
const REFS = vi.hoisted<RefsSnapshot>(() => ({ head: { oid: "h", branch: "main", detached: false }, state: "clean", local: [], remotes: [], tags: [], stashes: [] }));

vi.mock("../../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/ipc")>();
  return {
    ...actual,
    getStatus: vi.fn(() => new Promise(() => {})),
    getChangedFiles: vi.fn(() => Promise.resolve([])),
    getFileDiff: vi.fn(() => new Promise(() => {})),
    getAuthor: vi.fn(() => Promise.resolve({ name: "Ada", email: "ada@x" })),
    getRefs: vi.fn(() => Promise.resolve(REFS)),
    refreshLabels: vi.fn(() => Promise.resolve(1)),
    startLog: vi.fn(() => Promise.resolve(1)),
    getLogPage: vi.fn(() => new Promise(() => {})),
    commit: vi.fn(() => Promise.resolve("abcdef1234")),
    stagePaths: vi.fn(() => Promise.resolve()),
    unstagePaths: vi.fn(() => Promise.resolve()),
    recreateConflict: vi.fn(() => Promise.resolve()),
    resolveConflict: vi.fn(() => Promise.resolve()),
    discardHunks: vi.fn(() => Promise.resolve()),
    discardPaths: vi.fn(() => Promise.resolve()),
    openPath: vi.fn(() => Promise.resolve()),
  };
});
const ask = vi.hoisted(() => vi.fn((_message: string, _options?: unknown) => Promise.resolve(true)));
// `open` is the folder picker `actions.ts` imports; the menu's Copy path pulls that module in.
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask, open: vi.fn() }));
const writeText = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText }));
// jsdom has no ResizeObserver: flatten the resizable layout.
vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => null,
}));
// jsdom has no layout: give the virtualizer a viewport so it renders rows.
vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-virtual")>();
  return {
    ...actual,
    useVirtualizer: (opts: Parameters<typeof actual.useVirtualizer>[0]) =>
      actual.useVirtualizer({
        ...opts,
        initialRect: { width: 320, height: 400 },
        observeElementRect: (_instance, cb) => {
          cb({ width: 320, height: 400 });
          return () => {};
        },
      }),
  };
});

import * as ipc from "../../../api/ipc";
const mocked = ipc as unknown as Record<
  "stagePaths" | "getFileDiff" | "getStatus" | "getAuthor" | "recreateConflict" | "resolveConflict" | "discardHunks" | "discardPaths" | "openPath",
  ReturnType<typeof vi.fn>
>;

const STATUS: WorkdirStatus = {
  entries: [
    { path: "a.rs", oldPath: null, index: null, workdir: "modified", conflicted: false, workdirStamp: "1:1" },
    { path: "both.rs", oldPath: null, index: "modified", workdir: "modified", conflicted: false, workdirStamp: "1:1" },
    { path: "conflict.rs", oldPath: null, index: null, workdir: null, conflicted: true, workdirStamp: "1:1" },
    { path: "new.rs", oldPath: null, index: "added", workdir: null, conflicted: false, workdirStamp: null },
    { path: "untracked.txt", oldPath: null, index: null, workdir: "untracked", conflicted: false, workdirStamp: "1:1" },
  ],
  staged: 2,
  unstaged: 2,
  untracked: 1,
  conflicted: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem("commitFileListMode");
  resetTreeMode();
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "r", head: { oid: "h", branch: "main", detached: false } }, wtSelected: true });
  useStatusStore.setState({ status: STATUS, error: null });
  useDialogStore.setState({ dialog: null, returnFocus: null });
  useCommitStore.getState().reset();
});
afterEach(cleanup);

const text = (el: Element) => el.textContent?.replace(/\s+/g, " ").trim();

/** One modified line in one hunk — enough for the hunk / line actions to have something to sit on. */
const ONE_HUNK = (path: string) => ({
  path,
  oldPath: null,
  status: "modified",
  binary: false,
  truncated: false,
  maxLines: 20_000,
  additions: 1,
  deletions: 1,
  hunks: [
    {
      header: "@@ -1,1 +1,1 @@",
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      lines: [
        { kind: "del", oldNo: 1, newNo: null, text: "old", noNewline: false },
        { kind: "add", oldNo: null, newNo: 1, text: "new", noNewline: false },
      ],
    },
  ],
});

/** What `RepoWindow` does above the panel and the dialog: feed the status into the commit store, once. */
function Synced({ children }: { children: React.ReactNode }) {
  useCommitSync(true);
  return children;
}
const renderPanel = () =>
  render(
    <Synced>
      <CommitPanel />
    </Synced>,
  );

describe("CommitPanel", () => {
  it("splits the status into Unstaged / Staged lists with glyphs; conflicts stay stageable", () => {
    const { getByRole } = renderPanel();
    const unstaged = Array.from(getByRole("listbox", { name: "Unstaged files" }).querySelectorAll('[role="option"]'));
    const staged = Array.from(getByRole("listbox", { name: "Staged files" }).querySelectorAll('[role="option"]'));
    expect(unstaged.map(text)).toEqual(["Ma.rs", "Mboth.rs", "Cconflict.rs", "Uuntracked.txt"]);
    expect(staged.map(text)).toEqual(["Mboth.rs", "Anew.rs"]);
    // Staging a resolved conflict is how the merge flow ends: the row is a normal, actionable row.
    expect(unstaged[2].hasAttribute("aria-disabled")).toBe(false);
    expect(unstaged[2].getAttribute("title")).toBe("conflict.rs");
    expect(unstaged[2].querySelector('button[aria-label="Stage"]')).toBeTruthy();
    expect(getByRole("listbox", { name: "Unstaged files" }).getAttribute("aria-multiselectable")).toBe("true");
    // First unstaged file is focused by default, and the list points at it.
    expect(unstaged[0].getAttribute("aria-selected")).toBe("true");
    expect(getByRole("listbox", { name: "Unstaged files" }).getAttribute("aria-activedescendant")).toBe(unstaged[0].id);
  });

  it("Stage all skips conflicted files (staging one is 'mark resolved') and says so", () => {
    const { getByRole } = renderPanel();
    const btn = getByRole("button", { name: "Stage all" });
    expect(btn.getAttribute("title")).toContain("1 skipped");
    fireEvent.click(btn);
    expect(mocked.stagePaths).toHaveBeenCalledWith("r", ["a.rs", "both.rs", "untracked.txt"]);
  });

  it("the row action stages a single conflicted file, and its diff is whole-file only", () => {
    const { getByRole, getByText } = renderPanel();
    const rows = Array.from(getByRole("listbox", { name: "Unstaged files" }).querySelectorAll('[role="option"]'));
    fireEvent.click(rows[2]);
    expect(getByText("Conflict — stage the file once resolved")).toBeTruthy();
    fireEvent.click(rows[2].querySelector('button[aria-label="Stage"]')!);
    expect(mocked.stagePaths).toHaveBeenCalledWith("r", ["conflict.rs"]);
  });

  it("a conflicted file offers either side by the branch name the backend put on it", async () => {
    // Mid-merge on `main`: git's `--theirs` is the branch being merged in, and only the backend
    // knows that (during a rebase the two are the other way round).
    useRepoStore.setState({ refs: { ...REFS, state: "merge", conflictSides: { ours: "main", theirs: "feature" } } });
    const { getByRole } = renderPanel();
    fireEvent.click(Array.from(getByRole("listbox", { name: "Unstaged files" }).querySelectorAll('[role="option"]'))[2]);
    await act(async () => {});

    expect(getByRole("button", { name: "Keep main's version" })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Keep feature's version" }));
    await act(async () => {});
    expect(ask.mock.calls[0][0]).toContain("Replace conflict.rs with feature's version?");
    expect(mocked.resolveConflict).toHaveBeenCalledWith("r", ["conflict.rs"], "theirs");
  });

  it("offers to restore a conflict staged with its markers still in the file", async () => {
    // What `git add` on an unresolved file leaves behind: not conflicted any more (the stages are
    // gone, and no unstage brings them back), still full of markers, still mid-merge.
    mocked.getFileDiff.mockImplementation(() =>
      Promise.resolve({
        path: "a.rs",
        oldPath: null,
        status: "modified",
        binary: false,
        truncated: false,
        maxLines: 20_000,
        additions: 4,
        deletions: 0,
        hunks: [
          {
            header: "@@ -1 +1,4 @@",
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 4,
            lines: [{ kind: "add", oldNo: null, newNo: 1, text: "<<<<<<< HEAD", noNewline: false }],
          },
        ],
      }),
    );
    useRepoStore.setState({ refs: { ...REFS, state: "merge" } });
    const { getByRole, getByText } = renderPanel();
    await act(async () => {});

    expect(getByText("Marked resolved, but the conflict markers are still here")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Restore conflict" }));
    await act(async () => {});
    expect(mocked.recreateConflict).toHaveBeenCalledWith("r", ["a.rs"]);

    // Outside a merge the same markers are just text in a file.
    cleanup();
    useRepoStore.setState({ refs: REFS });
    const second = renderPanel();
    await act(async () => {});
    expect(second.queryByRole("button", { name: "Restore conflict" })).toBeNull();
  });

  it("hunk Discard is offered for the unstaged diff only, and asks before rewriting the file", async () => {
    mocked.getFileDiff.mockImplementation((_id: string, _t: unknown, path: string) =>
      Promise.resolve({
        path,
        oldPath: null,
        status: "modified",
        binary: false,
        truncated: false,
        maxLines: 20_000,
        additions: 1,
        deletions: 1,
        hunks: [
          {
            header: "@@ -1,1 +1,1 @@",
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: [
              { kind: "del", oldNo: 1, newNo: null, text: "old", noNewline: false },
              { kind: "add", oldNo: null, newNo: 1, text: "new", noNewline: false },
            ],
          },
        ],
      }),
    );
    const { getByRole, queryByRole } = renderPanel();
    await act(async () => {});

    fireEvent.click(getByRole("button", { name: "Discard hunk" }));
    await waitFor(() => expect(mocked.discardHunks).toHaveBeenCalledWith("r", "a.rs", [0], 3));
    expect(ask.mock.calls[0][0]).toContain("Discard this hunk from a.rs?");

    // The staged diff edits the index: unstaging is the only thing on offer there.
    fireEvent.click(Array.from(getByRole("listbox", { name: "Staged files" }).querySelectorAll('[role="option"]'))[0]);
    await act(async () => {});
    expect(getByRole("button", { name: "Unstage hunk" })).toBeTruthy();
    expect(queryByRole("button", { name: "Discard hunk" })).toBeNull();
  });

  it("a truncated or typechanged diff offers no hunk / line actions at all", async () => {
    // The backend rebuilds the file's diff untruncated to apply a patch, so the indices of a cut
    // diff name other hunks; a blob ↔ symlink patch git refuses outright.
    mocked.getFileDiff.mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve({ ...ONE_HUNK(path), truncated: true }));
    const { queryByRole, getByText } = renderPanel();
    await act(async () => {});
    expect(queryByRole("button", { name: "Stage hunk" })).toBeNull();
    expect(queryByRole("button", { name: "Discard hunk" })).toBeNull();
    expect(getByText(/Diff truncated/)).toBeTruthy();

    cleanup();
    useCommitStore.getState().reset();
    mocked.getFileDiff.mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve({ ...ONE_HUNK(path), status: "typechange" }));
    const second = renderPanel();
    await act(async () => {});
    expect(second.queryByRole("button", { name: "Stage hunk" })).toBeNull();
    expect(second.queryByRole("button", { name: "Discard hunk" })).toBeNull();
  });

  it("click / ctrl / shift build a multi-selection in one list", () => {
    const { getByRole } = renderPanel();
    const rows = () => Array.from(getByRole("listbox", { name: "Unstaged files" }).querySelectorAll('[role="option"]'));
    fireEvent.click(rows()[0]);
    fireEvent.click(rows()[3], { shiftKey: true });
    expect(rows().map((r) => r.getAttribute("aria-selected"))).toEqual(["true", "true", "true", "true"]);
    fireEvent.click(rows()[1], { ctrlKey: true });
    expect(rows().map((r) => r.getAttribute("aria-selected"))).toEqual(["true", "false", "true", "true"]);
    // Clicking the other list moves the selection there.
    const staged = Array.from(getByRole("listbox", { name: "Staged files" }).querySelectorAll('[role="option"]'));
    fireEvent.click(staged[1]);
    expect(rows().every((r) => r.getAttribute("aria-selected") === "false")).toBe(true);
    expect(staged[1].getAttribute("aria-selected")).toBe("true");
  });

  it("Commit is disabled until a summary exists; the counter turns danger past 72", async () => {
    const { getByRole, getByLabelText, findByText } = renderPanel();
    const commit = getByRole("button", { name: "Commit" });
    expect(commit.hasAttribute("disabled")).toBe(true);
    // Commit & Push follows the same rules as Commit (it commits, then opens the Push dialog).
    expect(getByRole("button", { name: "Commit & Push" }).hasAttribute("disabled")).toBe(true);
    await findByText(/Ada <ada@x> · will commit 2 staged files/);

    const summary = getByLabelText("Summary") as HTMLInputElement;
    fireEvent.change(summary, { target: { value: "Fix lanes" } });
    expect(commit.hasAttribute("disabled")).toBe(false);
    const counter = getByLabelText(/of 72 characters/);
    expect(counter.textContent).toBe("9/72");
    expect(counter.className).not.toMatch(/over/);
    fireEvent.change(summary, { target: { value: "x".repeat(73) } });
    expect(counter.textContent).toBe("73/72");
    expect(counter.className).toMatch(/over/);
  });

  it("Commit stays disabled with nothing staged unless amending; the staged header says so", () => {
    useStatusStore.setState({ status: { ...STATUS, staged: 0, entries: STATUS.entries.filter((e) => e.index === null) } });
    useCommitStore.setState({ summary: "msg" });
    const { getByRole, getByText } = renderPanel();
    expect(getByRole("button", { name: "Commit" }).hasAttribute("disabled")).toBe(true);
    act(() => useCommitStore.setState({ amend: true }));
    expect(getByRole("button", { name: "Commit" }).hasAttribute("disabled")).toBe(false);
    expect(getByText("Staged (amending)")).toBeTruthy();
  });

  it("the author is fetched once for the panel and the dialog together", async () => {
    const { findAllByText } = render(
      <Synced>
        <CommitPanel />
        <CommitDialog onClose={() => {}} />
      </Synced>,
    );
    expect((await findAllByText(/Ada <ada@x>/)).length).toBe(2);
    expect(mocked.getAuthor).toHaveBeenCalledTimes(1);
  });
});

describe("CommitPanel file context menu", () => {
  /** Item labels only: the `Kbd` hint lives in the same button. */
  const labels = (root: HTMLElement) => Array.from(root.querySelectorAll('[role="menuitem"]')).map((el) => text(el.querySelector('[class*="grow"]')!));
  const rows = (root: HTMLElement, list: string) => Array.from(root.querySelector(`[aria-label="${list} files"]`)!.querySelectorAll('[role="option"]')) as HTMLElement[];

  it("an unstaged file offers Stage, Discard, Copy path and the openers", () => {
    const { getByRole, container } = renderPanel();
    fireEvent.contextMenu(rows(container, "Unstaged")[0]);
    expect(labels(getByRole("menu", { name: "File actions" }))).toEqual(["Stage", "Discard…", "Copy path", "Open", "Reveal in folder"]);
  });

  it("a staged file offers Unstage, with no Discard", () => {
    const { getByRole, container } = renderPanel();
    fireEvent.contextMenu(rows(container, "Staged")[1]);
    expect(labels(getByRole("menu", { name: "File actions" }))).toEqual(["Unstage", "Copy path", "Open", "Reveal in folder"]);
  });

  it("a conflicted file offers either side by the branch name the backend put on it", async () => {
    useRepoStore.setState({ refs: { ...REFS, state: "merge", conflictSides: { ours: "main", theirs: "feature" } } });
    const { getByRole, container } = renderPanel();
    fireEvent.contextMenu(rows(container, "Unstaged")[2]);
    const menu = getByRole("menu", { name: "File actions" });
    expect(labels(menu)).toEqual(["Stage", "Discard…", "Keep main's version", "Keep feature's version", "Copy path", "Open", "Reveal in folder"]);
    fireEvent.click(getByRole("menuitem", { name: "Keep feature's version" }));
    await act(async () => {});
    expect(ask.mock.calls[0][0]).toContain("Replace conflict.rs with feature's version?");
    expect(mocked.resolveConflict).toHaveBeenCalledWith("r", ["conflict.rs"], "theirs");
  });

  it("a selection that is not conflicted through and through offers neither side", () => {
    useRepoStore.setState({ refs: { ...REFS, state: "merge", conflictSides: { ours: "main", theirs: "feature" } } });
    const { getByRole, container } = renderPanel();
    fireEvent.click(rows(container, "Unstaged")[0]); // a.rs
    fireEvent.click(rows(container, "Unstaged")[2], { ctrlKey: true }); // conflict.rs
    fireEvent.contextMenu(rows(container, "Unstaged")[2]);
    expect(labels(getByRole("menu", { name: "File actions" }))).toEqual(["Stage 2 files", "Discard 2 files…", "Copy path"]);
  });

  it("Stage skips the conflicted files in a selection, the way Stage all does", () => {
    const { getByRole, container } = renderPanel();
    fireEvent.click(rows(container, "Unstaged")[0]); // a.rs
    fireEvent.click(rows(container, "Unstaged")[2], { ctrlKey: true }); // conflict.rs
    fireEvent.contextMenu(rows(container, "Unstaged")[2]);
    const item = getByRole("menuitem", { name: "Stage 2 files" });
    expect(item.getAttribute("title")).toContain("1 skipped");
    fireEvent.click(item);
    expect(mocked.stagePaths).toHaveBeenCalledWith("r", ["a.rs"]);
  });

  it("acts on the row it was opened over, never on a selection that moved under it", async () => {
    const { getByRole, container, queryByRole } = renderPanel();
    fireEvent.contextMenu(rows(container, "Unstaged")[0]); // a.rs
    // A background refresh re-prunes the selection onto another file while the menu is up.
    act(() => useCommitStore.setState({ selected: ["both.rs"], anchor: "both.rs" }));
    fireEvent.click(getByRole("menuitem", { name: "Discard…" }));
    await act(async () => {});
    expect(ask.mock.calls[0][0]).toContain("Discard changes in a.rs?");
    expect(mocked.discardPaths).toHaveBeenCalledWith("r", ["a.rs"]);

    // And once the list itself changes there is nothing left to act on: the menu goes.
    fireEvent.contextMenu(rows(container, "Unstaged")[0]);
    expect(getByRole("menu", { name: "File actions" })).toBeTruthy();
    act(() => useStatusStore.setState({ status: { ...STATUS, entries: STATUS.entries.filter((e) => e.path !== "a.rs") } }));
    expect(queryByRole("menu", { name: "File actions" })).toBeNull();
  });

  it("the git items are disabled while a commit-store mutation runs", () => {
    const { getByRole, container } = renderPanel();
    fireEvent.contextMenu(rows(container, "Unstaged")[0]);
    act(() => useCommitStore.setState({ busy: true }));
    expect(getByRole("menuitem", { name: "Stage" }).hasAttribute("disabled")).toBe(true);
    expect(getByRole("menuitem", { name: "Discard…" }).hasAttribute("disabled")).toBe(true);
    // Reading the path touches no repository.
    expect(getByRole("menuitem", { name: "Copy path" }).hasAttribute("disabled")).toBe(false);
  });

  it("Shift+F10 opens the menu on the first row of a list that has never been clicked", () => {
    const { getByRole, container } = renderPanel();
    const staged = container.querySelector('[aria-label="Staged files"]') as HTMLElement;
    expect(fireEvent.keyDown(staged, { key: "F10", shiftKey: true })).toBe(false); // preventDefault
    expect(getByRole("menu", { name: "File actions" })).toBeTruthy();
    expect(useCommitStore.getState()).toMatchObject({ list: "staged", selected: ["both.rs"], anchor: "both.rs" });
  });

  it("Stage acts on the whole selection, not just the clicked row", () => {
    const { getByRole, container } = renderPanel();
    fireEvent.click(rows(container, "Unstaged")[0]);
    fireEvent.click(rows(container, "Unstaged")[1], { ctrlKey: true });
    fireEvent.contextMenu(rows(container, "Unstaged")[1]);
    fireEvent.click(getByRole("menuitem", { name: "Stage 2 files" }));
    expect(mocked.stagePaths).toHaveBeenCalledWith("r", ["a.rs", "both.rs"]);
  });

  it("right-clicking a row outside the selection selects just it", () => {
    const { container } = renderPanel();
    fireEvent.click(rows(container, "Unstaged")[0]);
    fireEvent.contextMenu(rows(container, "Unstaged")[3]);
    expect(useCommitStore.getState()).toMatchObject({ list: "unstaged", selected: ["untracked.txt"], anchor: "untracked.txt" });
  });

  it("Copy path copies the selected paths, one per line", () => {
    const { getByRole, container } = renderPanel();
    fireEvent.click(rows(container, "Unstaged")[0]);
    fireEvent.click(rows(container, "Unstaged")[1], { shiftKey: true });
    fireEvent.contextMenu(rows(container, "Unstaged")[0]);
    fireEvent.click(getByRole("menuitem", { name: "Copy path" }));
    expect(writeText).toHaveBeenCalledWith("a.rs\nboth.rs");
  });

  it("Reveal in folder hands the path to the backend; a deleted file has nothing to open", () => {
    const { getByRole, container } = renderPanel();
    fireEvent.contextMenu(rows(container, "Unstaged")[0]);
    fireEvent.click(getByRole("menuitem", { name: "Reveal in folder" }));
    expect(mocked.openPath).toHaveBeenCalledWith("r", "a.rs", true);

    cleanup();
    useStatusStore.setState({ status: { ...STATUS, entries: [{ path: "gone.rs", oldPath: null, index: null, workdir: "deleted", conflicted: false, workdirStamp: null }] } });
    useCommitStore.getState().reset();
    const second = renderPanel();
    fireEvent.contextMenu(rows(second.container, "Unstaged")[0]);
    expect(second.getByRole("menuitem", { name: "Open" }).hasAttribute("disabled")).toBe(true);
    expect(second.getByRole("menuitem", { name: "Reveal in folder" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("CommitPanel tree view", () => {
  const NESTED: WorkdirStatus = {
    entries: [
      { path: "src/lib/b.rs", oldPath: null, index: null, workdir: "modified", conflicted: false, workdirStamp: "1:1" },
      { path: "top.rs", oldPath: null, index: null, workdir: "modified", conflicted: false, workdirStamp: "1:1" },
      { path: "src/a.rs", oldPath: null, index: "modified", workdir: "modified", conflicted: false, workdirStamp: "1:1" },
    ],
    staged: 1,
    unstaged: 3,
    untracked: 0,
    conflicted: 0,
  };

  beforeEach(() => {
    useStatusStore.setState({ status: NESTED, error: null });
    useCommitStore.getState().reset();
  });

  /** Treeitems of the unstaged tree: `src`, `lib`, `b.rs`, `a.rs`, `top.rs` while everything is expanded. */
  const items = (root: HTMLElement) => Array.from(root.querySelectorAll('[role="treeitem"]'));

  it("the toggle nests both lists by folder, remembers the choice, and a folder click collapses it", () => {
    const { getByRole, queryByRole } = renderPanel();
    expect(getByRole("listbox", { name: "Unstaged files" })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Show as tree" }));
    expect(localStorage.getItem("commitFileListMode")).toBe("tree");
    expect(queryByRole("listbox", { name: "Unstaged files" })).toBeNull();

    const tree = () => getByRole("tree", { name: "Unstaged files" });
    expect(items(tree()).map(text)).toEqual(["src", "lib", "Mb.rs", "Ma.rs", "Mtop.rs"]);
    expect(items(tree()).map((r) => r.getAttribute("aria-level"))).toEqual(["1", "2", "3", "2", "1"]);
    expect(items(tree())[2].getAttribute("title")).toBe("src/lib/b.rs");
    expect(items(getByRole("tree", { name: "Staged files" })).map(text)).toEqual(["src", "Ma.rs"]);

    // Collapsing skips the folder's files for ↑/↓ and Shift ranges; the selection is untouched.
    fireEvent.click(items(tree())[3]);
    fireEvent.click(items(tree())[1]);
    expect(items(tree()).map(text)).toEqual(["src", "lib", "Ma.rs", "Mtop.rs"]);
    expect(items(tree())[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tree(), { key: "ArrowUp" });
    expect(items(tree())[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.click(items(tree())[3], { shiftKey: true });
    expect(items(tree()).map((r) => r.getAttribute("aria-selected"))).toEqual([null, null, "true", "true"]);

    // The preference is read back on the next launch.
    cleanup();
    resetTreeMode();
    const again = renderPanel();
    expect(again.getByRole("tree", { name: "Unstaged files" })).toBeTruthy();
    expect(again.getByRole("button", { name: "Show as list" })).toBeTruthy();
  });

  it("a chain of single-child folders is one row, `a / b / c`, that collapses as a whole", () => {
    // Its own fixture: the shared one's row indexes are load-bearing for the tests around this.
    useStatusStore.setState({
      status: { ...NESTED, entries: [...NESTED.entries, { path: "deep/one/two/z.rs", oldPath: null, index: null, workdir: "modified", conflicted: false, workdirStamp: "1:1" }] },
      error: null,
    });
    useTreeModeStore.setState({ tree: true });
    const { getByRole } = renderPanel();
    const tree = () => getByRole("tree", { name: "Unstaged files" });
    const chain = () => items(tree())[0];
    expect(text(chain())).toBe("deep / one / two");
    expect(chain().getAttribute("title")).toBe("deep/one/two");
    expect(chain().getAttribute("aria-level")).toBe("1");
    expect(items(tree()).map(text)).toEqual(["deep / one / two", "Mz.rs", "src", "lib", "Mb.rs", "Ma.rs", "Mtop.rs"]);
    fireEvent.click(chain());
    expect(items(tree()).map(text)).toEqual(["deep / one / two", "src", "lib", "Mb.rs", "Ma.rs", "Mtop.rs"]);
  });

  it("one mode for every mount: the dialog's toggle switches the panel behind it", () => {
    const { getAllByRole } = render(
      <Synced>
        <CommitPanel />
        <CommitDialog onClose={() => {}} />
      </Synced>,
    );
    expect(getAllByRole("button", { name: "Show as tree" })).toHaveLength(2);
    fireEvent.click(getAllByRole("button", { name: "Show as tree" })[1]);
    expect(getAllByRole("button", { name: "Show as list" })).toHaveLength(2);
    expect(getAllByRole("tree", { name: "Unstaged files" })).toHaveLength(2);
  });

  it("Enter / Space / ← / → on a focused folder row toggle it and never stage", () => {
    useTreeModeStore.setState({ tree: true });
    const { getByRole } = renderPanel();
    const tree = () => getByRole("tree", { name: "Unstaged files" });
    fireEvent.click(items(tree())[3]); // select a.rs
    const lib = () => items(tree())[1];
    fireEvent.keyDown(lib(), { key: "Enter" });
    expect(items(tree()).map(text)).toEqual(["src", "lib", "Ma.rs", "Mtop.rs"]);
    fireEvent.keyDown(lib(), { key: "ArrowLeft" }); // already collapsed: nothing
    expect(items(tree())).toHaveLength(4);
    fireEvent.keyDown(lib(), { key: "ArrowRight" });
    expect(items(tree())).toHaveLength(5);
    fireEvent.keyDown(lib(), { key: "ArrowLeft" });
    expect(items(tree())).toHaveLength(4);
    fireEvent.keyDown(lib(), { key: " " });
    expect(items(tree())).toHaveLength(5);
    expect(mocked.stagePaths).not.toHaveBeenCalled();
    // Other keys still drive the file selection.
    fireEvent.keyDown(lib(), { key: "ArrowDown" });
    expect(items(tree())[4].getAttribute("aria-selected")).toBe("true");
  });

  it("a collapsed folder keeps its selected files: Ctrl+click, Ctrl+A and Enter cover them; ↑/↓ resume from its row", async () => {
    useTreeModeStore.setState({ tree: true });
    const { getByRole } = renderPanel();
    const tree = () => getByRole("tree", { name: "Unstaged files" });
    const lib = () => items(tree())[1];
    fireEvent.click(items(tree())[2]); // b.rs
    fireEvent.click(lib());
    expect(tree().getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.click(items(tree())[2], { ctrlKey: true }); // a.rs
    expect(useCommitStore.getState().selected).toEqual(["src/lib/b.rs", "src/a.rs"]);
    fireEvent.keyDown(tree(), { key: "Enter" });
    expect(mocked.stagePaths).toHaveBeenLastCalledWith("r", ["src/lib/b.rs", "src/a.rs"]);
    await act(async () => {}); // the mutation settles (`busy` off); the status stays as mocked

    fireEvent.keyDown(tree(), { key: "a", ctrlKey: true });
    expect(useCommitStore.getState().selected).toEqual(["src/lib/b.rs", "src/a.rs", "top.rs"]);
    fireEvent.keyDown(tree(), { key: "Enter" });
    expect(mocked.stagePaths).toHaveBeenLastCalledWith("r", ["src/lib/b.rs", "src/a.rs", "top.rs"]);

    // Hidden anchor: ↓ lands on the first file after the folder row, ↑ has nothing above it and stays.
    fireEvent.click(lib());
    fireEvent.click(items(tree())[2]); // b.rs
    fireEvent.click(lib());
    expect(useCommitStore.getState().anchor).toBe("src/lib/b.rs");
    fireEvent.keyDown(tree(), { key: "ArrowUp" });
    expect(useCommitStore.getState()).toMatchObject({ anchor: "src/lib/b.rs", selected: ["src/lib/b.rs"] });
    fireEvent.keyDown(tree(), { key: "ArrowDown" });
    expect(useCommitStore.getState().anchor).toBe("src/a.rs");
  });

  it("Shift+F10 still opens the menu for a file hidden inside a collapsed folder", () => {
    // The anchor's row is not mounted, so there is no rectangle to drop the menu under: the list's own is used.
    useTreeModeStore.setState({ tree: true });
    const { getByRole } = renderPanel();
    const tree = () => getByRole("tree", { name: "Unstaged files" });
    fireEvent.click(items(tree())[2]); // b.rs
    fireEvent.click(items(tree())[1]); // collapse lib
    expect(fireEvent.keyDown(tree(), { key: "F10", shiftKey: true })).toBe(false); // preventDefault
    expect(getByRole("menu", { name: "File actions" })).toBeTruthy();
    expect(useCommitStore.getState().selected).toEqual(["src/lib/b.rs"]);
  });

  it("a staged row hands the selection to its display neighbour, not the status-order one", () => {
    useTreeModeStore.setState({ tree: true });
    const { getByRole } = renderPanel();
    const tree = () => getByRole("tree", { name: "Unstaged files" });
    fireEvent.click(items(tree())[2]); // b.rs: first in the tree and in the status
    // b.rs staged: in status order top.rs follows it, on screen a.rs does.
    act(() => useStatusStore.setState({ status: { ...NESTED, entries: NESTED.entries.filter((e) => e.path !== "src/lib/b.rs") } }));
    expect(useCommitStore.getState()).toMatchObject({ list: "unstaged", anchor: "src/a.rs", selected: ["src/a.rs"] });
    expect(items(tree()).map((r) => r.getAttribute("aria-selected"))).toEqual([null, "true", "false"]);
  });
});

describe("CommitDialog", () => {
  it("opens from the message header and shows both lists, the editor and the diff in one dialog", () => {
    const { getByRole } = renderPanel();
    fireEvent.click(getByRole("button", { name: "Open commit window" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "commit" });
    cleanup();

    const onClose = vi.fn();
    const dlg = render(
      <Synced>
        <CommitDialog onClose={onClose} />
      </Synced>,
    );
    const dialog = dlg.getByRole("dialog", { name: "Commit" });
    expect(dialog.querySelectorAll('[role="listbox"]').length).toBe(2);
    expect(Array.from(dlg.getByRole("listbox", { name: "Staged files" }).querySelectorAll('[role="option"]')).map(text)).toEqual(["Mboth.rs", "Anew.rs"]);
    expect(document.activeElement).toBe(dlg.getByRole("textbox", { name: "Summary" }));
    // No second expand button inside the dialog; the tree toggle is there.
    expect(dlg.queryByRole("button", { name: "Open commit window" })).toBeNull();
    expect(dlg.getByRole("button", { name: "Show as tree" })).toBeTruthy();
    fireEvent.click(dlg.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("a successful Commit closes the dialog", async () => {
    mocked.getStatus.mockResolvedValueOnce({ ...STATUS, entries: [], staged: 0, unstaged: 0, untracked: 0, conflicted: 0 });
    const onClose = vi.fn();
    const { getByRole, getByLabelText } = render(
      <Synced>
        <CommitDialog onClose={onClose} />
      </Synced>,
    );
    fireEvent.change(getByLabelText("Summary"), { target: { value: "Fix lanes" } });
    fireEvent.click(getByRole("button", { name: "Commit" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useDialogStore.getState().dialog).toBeNull();
  });

  it("Commit & Push closes the dialog, then opens Push returning focus to the commit dialog's opener", async () => {
    mocked.getStatus.mockResolvedValueOnce({ ...STATUS, entries: [], staged: 0, unstaged: 0, untracked: 0, conflicted: 0 });
    // The toolbar button that opened the commit dialog; it outlives the dialog, its buttons don't.
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    useDialogStore.setState({ dialog: { kind: "commit" }, returnFocus: opener });
    const { getByRole, getByLabelText } = render(
      <Synced>
        <CommitDialog onClose={() => useDialogStore.getState().close()} />
      </Synced>,
    );
    fireEvent.change(getByLabelText("Summary"), { target: { value: "Fix lanes" } });
    fireEvent.click(getByRole("button", { name: "Commit & Push" }));
    await waitFor(() => expect(useDialogStore.getState().dialog).toEqual({ kind: "push" }));
    expect(useDialogStore.getState().returnFocus).toBe(opener);
    opener.remove();
  });
});
