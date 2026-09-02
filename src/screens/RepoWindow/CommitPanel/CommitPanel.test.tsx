import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkdirStatus } from "../../../api/types";
import { useCommitStore } from "../../../store/commitStore";
import { useRepoStore } from "../../../store/repoStore";
import { useDialogStore } from "../../../store/dialogStore";
import { useStatusStore } from "../../../store/statusStore";
import { CommitDialog } from "../dialogs/CommitDialog";
import { CommitPanel } from "./CommitPanel";

vi.mock("../../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/ipc")>();
  return {
    ...actual,
    getStatus: vi.fn(() => new Promise(() => {})),
    getChangedFiles: vi.fn(() => Promise.resolve([])),
    getFileDiff: vi.fn(() => new Promise(() => {})),
    getAuthor: vi.fn(() => Promise.resolve({ name: "Ada", email: "ada@x" })),
    stagePaths: vi.fn(() => Promise.resolve()),
    unstagePaths: vi.fn(() => Promise.resolve()),
    recreateConflict: vi.fn(() => Promise.resolve()),
  };
});
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(() => Promise.resolve(true)) }));
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
const mocked = ipc as unknown as Record<"stagePaths" | "getFileDiff" | "recreateConflict", ReturnType<typeof vi.fn>>;

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
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "r", head: { oid: "h", branch: "main", detached: false } }, wtSelected: true });
  useStatusStore.setState({ status: STATUS, error: null });
  useCommitStore.getState().reset();
});
afterEach(cleanup);

const text = (el: Element) => el.textContent?.replace(/\s+/g, " ").trim();

describe("CommitPanel", () => {
  it("splits the status into Unstaged / Staged lists with glyphs; conflicts stay stageable", () => {
    const { getByRole } = render(<CommitPanel />);
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
    const { getByRole } = render(<CommitPanel />);
    const btn = getByRole("button", { name: "Stage all" });
    expect(btn.getAttribute("title")).toContain("1 skipped");
    fireEvent.click(btn);
    expect(mocked.stagePaths).toHaveBeenCalledWith("r", ["a.rs", "both.rs", "untracked.txt"]);
  });

  it("the row action stages a single conflicted file, and its diff is whole-file only", () => {
    const { getByRole, getByText } = render(<CommitPanel />);
    const rows = Array.from(getByRole("listbox", { name: "Unstaged files" }).querySelectorAll('[role="option"]'));
    fireEvent.click(rows[2]);
    expect(getByText("Conflict — stage the file once resolved")).toBeTruthy();
    fireEvent.click(rows[2].querySelector('button[aria-label="Stage"]')!);
    expect(mocked.stagePaths).toHaveBeenCalledWith("r", ["conflict.rs"]);
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
    useRepoStore.setState({ refs: { head: { oid: "h", branch: "main", detached: false }, state: "merge", local: [], remotes: [], tags: [], stashes: [] } });
    const { getByRole, getByText } = render(<CommitPanel />);
    await act(async () => {});

    expect(getByText("Marked resolved, but the conflict markers are still here")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Restore conflict" }));
    await act(async () => {});
    expect(mocked.recreateConflict).toHaveBeenCalledWith("r", ["a.rs"]);

    // Outside a merge the same markers are just text in a file.
    cleanup();
    useRepoStore.setState({ refs: { head: { oid: "h", branch: "main", detached: false }, state: "clean", local: [], remotes: [], tags: [], stashes: [] } });
    const second = render(<CommitPanel />);
    await act(async () => {});
    expect(second.queryByRole("button", { name: "Restore conflict" })).toBeNull();
  });

  it("click / ctrl / shift build a multi-selection in one list", () => {
    const { getByRole } = render(<CommitPanel />);
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
    const { getByRole, getByLabelText, findByText } = render(<CommitPanel />);
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
    const { getByRole, getByText } = render(<CommitPanel />);
    expect(getByRole("button", { name: "Commit" }).hasAttribute("disabled")).toBe(true);
    act(() => useCommitStore.setState({ amend: true }));
    expect(getByRole("button", { name: "Commit" }).hasAttribute("disabled")).toBe(false);
    expect(getByText("Staged (amending)")).toBeTruthy();
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
    localStorage.clear();
    useStatusStore.setState({ status: NESTED, error: null });
    useCommitStore.getState().reset();
  });

  it("the toggle nests both lists by folder, remembers the choice, and a folder click collapses it", () => {
    const { getByRole, queryByRole } = render(<CommitPanel />);
    expect(getByRole("listbox", { name: "Unstaged files" })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Show as tree" }));
    expect(localStorage.getItem("commitFileListMode")).toBe("tree");
    expect(queryByRole("listbox", { name: "Unstaged files" })).toBeNull();

    const items = () => Array.from(getByRole("tree", { name: "Unstaged files" }).querySelectorAll('[role="treeitem"]'));
    expect(items().map(text)).toEqual(["src", "lib", "Mb.rs", "Ma.rs", "Mtop.rs"]);
    expect(items().map((r) => r.getAttribute("aria-level"))).toEqual(["1", "2", "3", "2", "1"]);
    expect(items()[2].getAttribute("title")).toBe("src/lib/b.rs");
    expect(Array.from(getByRole("tree", { name: "Staged files" }).querySelectorAll('[role="treeitem"]')).map(text)).toEqual(["src", "Ma.rs"]);

    // Collapsing skips the folder's files for ↑/↓ and Shift ranges; the selection is untouched.
    fireEvent.click(items()[3]);
    fireEvent.click(items()[1]);
    expect(items().map(text)).toEqual(["src", "lib", "Ma.rs", "Mtop.rs"]);
    expect(items()[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(getByRole("tree", { name: "Unstaged files" }), { key: "ArrowUp" });
    expect(items()[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.click(items()[3], { shiftKey: true });
    expect(items().map((r) => r.getAttribute("aria-selected"))).toEqual([null, null, "true", "true"]);

    // The preference is read back on the next mount.
    cleanup();
    const again = render(<CommitPanel />);
    expect(again.getByRole("tree", { name: "Unstaged files" })).toBeTruthy();
    expect(again.getByRole("button", { name: "Show as list" })).toBeTruthy();
  });
});

describe("CommitDialog", () => {
  it("opens from the message header and shows both lists, the editor and the diff in one dialog", () => {
    useDialogStore.setState({ dialog: null });
    localStorage.removeItem("commitFileListMode");
    const { getByRole } = render(<CommitPanel />);
    fireEvent.click(getByRole("button", { name: "Open commit window" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "commit" });
    cleanup();

    const onClose = vi.fn();
    const dlg = render(<CommitDialog onClose={onClose} />);
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
});
