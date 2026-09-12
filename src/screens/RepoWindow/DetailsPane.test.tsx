import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ipc from "../../api/ipc";
import type { CommitDetail, CommitInfo, FileChange, LogRow, RefsSnapshot } from "../../api/types";
import { useDialogStore } from "../../store/dialogStore";
import { useDiffStore } from "../../store/diffStore";
import { useSettingsStore } from "../../store/settingsStore";
import { __resetForTests as resetRepo, useRepoStore } from "../../store/repoStore";
import { CommitDiff, DetailsPane } from "./DetailsPane";
import { DiffDialog } from "./dialogs/DiffDialog";
import { fileDiff, hunk, line } from "./DiffViewer/diffFixtures";

const DETAIL: CommitDetail = {
  info: {
    oid: "a",
    short: "a",
    summary: "Ship it",
    authorName: "Ada",
    authorEmail: "ada@x",
    authorTime: 0,
    committerTime: 0,
    parents: [],
    isMerge: false,
  },
  message: "Ship it\n",
  committerName: "Ada",
  committerEmail: "ada@x",
};

vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return {
    ...actual,
    getCommit: vi.fn(() => Promise.resolve(DETAIL)),
    getChangedFiles: vi.fn(() => Promise.resolve([])),
    getFileDiff: vi.fn(() => new Promise(() => {})),
    openDiffTool: vi.fn(() => Promise.resolve("BComp")),
  };
});
// jsdom has no ResizeObserver: flatten the resizable layout.
vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => null,
}));

const ROW: LogRow = {
  row: {
    commit: DETAIL.info,
    lane: 0,
    color: 0,
    lines: [],
    maxLane: 0,
  },
  labels: [],
};

const refs = (tags: RefsSnapshot["tags"]): RefsSnapshot => ({
  head: { oid: "a", branch: "main", detached: false },
  state: "clean",
  local: [],
  remotes: [],
  tags,
  stashes: [],
});

beforeEach(() => {
  resetRepo();
  useDialogStore.setState({ dialog: null, returnFocus: null });
  // The file panel's tab is store state shared by the pane and the dialog: every test says which.
  useDiffStore.setState({ tab: "changes", tree: null, treeSelectedPath: null, content: null, contentLoading: false, contentError: null, treeFilter: "" });
  useRepoStore.setState({
    repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } },
    rows: [ROW],
    selectedIndex: 0,
    wtSelected: false,
  });
});
afterEach(cleanup);

describe("CommitDetails", () => {
  it("shows an annotated tag's message on the commit it points at, and nothing for a lightweight one", async () => {
    useRepoStore.setState({
      refs: refs([
        { name: "v1.0", oid: "a", message: "First release\nwith notes" },
        { name: "lw", oid: "a", message: null },
        { name: "v0.9", oid: "b", message: "An older commit's tag" },
      ]),
    });
    const { findByText, queryByText } = render(<DetailsPane />);
    expect(await findByText("v1.0")).toBeTruthy();
    expect(await findByText("First release with notes")).toBeTruthy();
    // A lightweight tag has no message of its own, and another commit's tag is not this commit's.
    expect(queryByText("lw")).toBeNull();
    expect(queryByText("An older commit's tag")).toBeNull();
  });

  it("shows no annotation block when the commit carries no annotated tag", async () => {
    useRepoStore.setState({ refs: refs([{ name: "lw", oid: "a", message: null }]) });
    const { findByText, queryByText } = render(<DetailsPane />);
    await findByText("Ship it");
    await waitFor(() => expect(queryByText("lw")).toBeNull());
  });

  it("clears a failed commit's error once another commit is selected", async () => {
    const later: CommitInfo = { ...DETAIL.info, oid: "b", short: "b", summary: "Later work" };
    useRepoStore.setState({ rows: [ROW, { row: { ...ROW.row, commit: later }, labels: [] }] });
    const getCommit = ipc.getCommit as unknown as ReturnType<typeof vi.fn>;
    getCommit.mockRejectedValueOnce(new Error("bad object"));
    const { findByText, queryByText } = render(<DetailsPane />);
    expect(await findByText("bad object")).toBeTruthy();

    getCommit.mockResolvedValueOnce({ ...DETAIL, info: later, message: "Later work\n" });
    act(() => useRepoStore.setState({ selectedIndex: 1 }));
    expect(await findByText("Later work")).toBeTruthy();
    expect(queryByText("bad object")).toBeNull();
  });
});

describe("DetailsPane under a history filter", () => {
  it("preselects the file the row was listed for, under the name it had at that commit", async () => {
    const files: FileChange[] = [
      { path: "other.ts", oldPath: null, status: "modified", additions: 1, deletions: 0, binary: false },
      { path: "old/name.ts", oldPath: null, status: "modified", additions: 1, deletions: 0, binary: false },
    ];
    (ipc.getChangedFiles as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(files);
    useRepoStore.setState({ filter: { path: "new/name.ts" }, rows: [{ ...ROW, path: "old/name.ts" }] });
    render(<DetailsPane />);
    // Not `other.ts`, which is the first of the commit's changed files.
    await waitFor(() => expect(useDiffStore.getState().selectedPath).toBe("old/name.ts"));
    expect(useDiffStore.getState().treeSelectedPath).toBe("old/name.ts");
  });
});

describe("CompareDetails", () => {
  it("replaces the commit panel with the compared pair, and loads the range's files", async () => {
    const from: CommitInfo = { ...DETAIL.info, oid: "b0b0b0b", short: "b0b0b0b", summary: "Earlier work" };
    const to: CommitInfo = { ...DETAIL.info, oid: "a1a1a1a", short: "a1a1a1a" };
    useRepoStore.setState({ compare: { from, to } });
    const { container, findByText, queryByText } = render(<DetailsPane />);
    expect(await findByText("Compare")).toBeTruthy();
    expect(queryByText("Commit")).toBeNull();
    // Both commits: short SHA and summary, oldest first.
    for (const text of ["b0b0b0b", "Earlier work", "a1a1a1a", "Ship it"]) expect(container.textContent).toContain(text);
    await waitFor(() => expect(ipc.getChangedFiles).toHaveBeenLastCalledWith("r", { kind: "commitRange", from: "b0b0b0b", to: "a1a1a1a" }));
  });
});

describe("CommitDiff", () => {
  it("hands the selected commit's file to the external diff tool", async () => {
    useSettingsStore.setState({ tools: { diff: { name: "bc", path: "C:/BC/BComp.exe", cmd: "x" }, merge: null } });
    useDiffStore.setState({
      target: { kind: "commit", oid: "a" },
      files: [{ path: "src/a.ts", oldPath: null, status: "modified", additions: 1, deletions: 0, binary: false }],
      selectedPath: "src/a.ts",
      diff: fileDiff([hunk("@@ -1 +1 @@", [line("add", null, 1, "let a = 1;")])]),
      diffLoading: false,
      diffError: null,
    });
    const { getByRole } = render(<CommitDiff />);
    fireEvent.click(getByRole("button", { name: "Open in diff tool" }));
    await waitFor(() => expect(ipc.openDiffTool).toHaveBeenCalledWith("r", { kind: "commit", oid: "a" }, "src/a.ts", null));
  });

  it("shows the file's content instead of the diff while the Files tab is up", () => {
    useDiffStore.setState({
      target: { kind: "commit", oid: "a" },
      tab: "files",
      treeSelectedPath: "src/a.ts",
      content: { path: "src/a.ts", text: "let a = 1;\n", binary: false, size: 11, truncated: false, maxLines: 20_000, kind: "blob" },
      contentLoading: false,
      contentError: null,
    });
    const { getByRole, queryByRole } = render(<CommitDiff />);
    expect(getByRole("region", { name: "File content" })).toBeTruthy();
    // Not the diff viewer: one side only, so none of its two-side controls are there either.
    expect(queryByRole("region", { name: "Diff" })).toBeNull();
    expect(queryByRole("button", { name: "Split view" })).toBeNull();
  });
});

describe("DiffDialog", () => {
  const FILES: FileChange[] = [{ path: "src/a.ts", oldPath: null, status: "modified", additions: 1, deletions: 0, binary: false }];
  const DIFF = fileDiff([hunk("@@ -1 +1 @@", [line("add", null, 1, "let a = 1;")])]);

  /** What the pane's `load` would have left behind; the dialog is rendered on its own here. */
  function seedDiff() {
    useDiffStore.setState({
      target: { kind: "commit", oid: "a" },
      files: FILES,
      filesLoading: false,
      filesError: null,
      selectedPath: FILES[0].path,
      fileListMode: "flat",
      diff: DIFF,
      diffLoading: false,
      diffError: null,
    });
  }

  it("opens from the diff header, naming the button as the focus target", async () => {
    const { findByRole } = render(<DetailsPane />);
    const expand = await findByRole("button", { name: "Open diff window" });
    fireEvent.click(expand);
    expect(useDialogStore.getState().dialog).toEqual({ kind: "diff" });
    // The button stays mounted behind the scrim, but the dialog is told about it all the same.
    expect(useDialogStore.getState().returnFocus).toBe(expand);
  });

  it("offers no expand button while nothing is selected", () => {
    useRepoStore.setState({ selectedIndex: null });
    const { queryByRole } = render(<DetailsPane />);
    expect(queryByRole("button", { name: "Open diff window" })).toBeNull();
  });

  it("shows the selected commit's files and diff, focused on the file list", () => {
    useRepoStore.setState({ rows: [{ ...ROW, row: { ...ROW.row, commit: { ...DETAIL.info, short: "a1b2c3d" } } }] });
    seedDiff();
    const onClose = vi.fn();
    const { getByRole, queryByRole } = render(<DiffDialog onClose={onClose} />);
    const dialog = getByRole("dialog", { name: /^Diff — a1b2c3d Ship it/ });
    const list = getByRole("listbox", { name: "Changed files" });
    expect(dialog.contains(list)).toBe(true);
    expect(dialog.contains(getByRole("region", { name: "Diff" }))).toBe(true);
    // ↑/↓ walk the files right away — the Dialog's own fallback would have taken Close.
    expect(document.activeElement).toBe(list);
    // No second expand button inside the dialog.
    expect(queryByRole("button", { name: "Open diff window" })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the Files tab — the tab strip, the filter row and the content view all come with the shared components", () => {
    seedDiff();
    useDiffStore.setState({
      tab: "files",
      tree: [{ path: "src/a.ts", size: 10, mode: "100644", kind: "blob" }],
      treeSelectedPath: "src/a.ts",
      content: { path: "src/a.ts", text: "let a = 1;\n", binary: false, size: 11, truncated: false, maxLines: 20_000, kind: "blob" },
      contentLoading: false,
      contentError: null,
    });
    const { getByRole } = render(<DiffDialog onClose={vi.fn()} />);
    const dialog = getByRole("dialog", { name: /^Diff — / });
    expect(dialog.contains(getByRole("tab", { name: "Files", selected: true }))).toBe(true);
    expect(dialog.contains(getByRole("textbox", { name: "Filter files" }))).toBe(true);
    expect(dialog.contains(getByRole("listbox", { name: "Files" }))).toBe(true);
    expect(dialog.contains(getByRole("region", { name: "File content" }))).toBe(true);
  });

  it("titles a compare with both short SHAs", () => {
    const from: CommitInfo = { ...DETAIL.info, oid: "b0b0b0b", short: "b0b0b0b" };
    const to: CommitInfo = { ...DETAIL.info, oid: "a1a1a1a", short: "a1a1a1a" };
    useRepoStore.setState({ compare: { from, to } });
    seedDiff();
    const { getByRole } = render(<DiffDialog onClose={vi.fn()} />);
    expect(getByRole("dialog", { name: "Diff — b0b0b0b…a1a1a1a" })).toBeTruthy();
  });
});
