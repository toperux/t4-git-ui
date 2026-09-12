import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ipc from "../../../api/ipc";
import type { FileChange, TreeEntry } from "../../../api/types";
import { useDiffStore } from "../../../store/diffStore";
import { ChangedFileList } from "./ChangedFileList";

vi.mock("../../../api/ipc", () => ({
  getChangedFiles: vi.fn(() => new Promise(() => {})),
  getFileDiff: vi.fn(() => new Promise(() => {})),
  listTree: vi.fn(() => new Promise(() => {})),
  readFile: vi.fn(() => new Promise(() => {})),
  saveFileAs: vi.fn(() => Promise.resolve()),
  openPath: vi.fn(() => Promise.resolve()),
  toAppError: (e: unknown) => ({ kind: "unknown", message: String(e) }),
}));
// The row menu's native save dialog; `ask` / `open` are what `actions.ts` imports from the plugin.
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn(() => Promise.resolve("C:/out/main.rs")), ask: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn(() => Promise.resolve()) }));

// jsdom has no layout: give the virtualizer a viewport so it renders rows.
const scrolls = vi.hoisted(() => ({ offsets: [] as number[] }));
vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-virtual")>();
  return {
    ...actual,
    useVirtualizer: (opts: Parameters<typeof actual.useVirtualizer>[0]) => {
      const v = actual.useVirtualizer({
        ...opts,
        initialRect: { width: 320, height: 400 },
        observeElementRect: (_instance, cb) => {
          cb({ width: 320, height: 400 });
          return () => {};
        },
      });
      v.scrollToOffset = (offset: number) => scrolls.offsets.push(offset);
      return v;
    },
  };
});

afterEach(cleanup);

// Every test states the tab it is about; the store is shared across them.
beforeEach(() => useDiffStore.setState({ tab: "changes", tree: null, treeFilter: "", treeSelectedPath: null, treeLoading: false, treeError: null }));

const FILES: FileChange[] = [
  { path: "crates/git-core/src/log/graph.rs", oldPath: null, status: "modified", additions: 42, deletions: 7, binary: false },
  { path: "crates/git-core/src/log/cache.rs", oldPath: null, status: "added", additions: 88, deletions: 0, binary: false },
  { path: "src/log/mod.rs", oldPath: "src/log.rs", status: "renamed", additions: 0, deletions: 0, binary: false },
];

const TREE: TreeEntry[] = [
  { path: "readme.md", size: 12, mode: "100644", kind: "blob" },
  { path: "src/lib.rs", size: 20, mode: "100644", kind: "blob" },
  { path: "src/main.rs", size: 30, mode: "100644", kind: "blob" },
  { path: "vendor/dep", size: 0, mode: "160000", kind: "submodule" },
];

describe("ChangedFileList", () => {
  it("renders glyph, path and +N −M per file; renames show old → new", () => {
    useDiffStore.setState({ target: { kind: "commit", oid: "c" }, files: FILES, filesLoading: false, filesError: null, selectedPath: FILES[0].path, fileListMode: "flat" });
    const { container, getByRole } = render(<ChangedFileList />);
    expect(getByRole("listbox", { name: "Changed files" })).toBeTruthy();
    const rows = container.querySelectorAll('[role="option"]');
    expect(rows).toHaveLength(3);
    const text = (el: Element) => el.textContent?.replace(/\s+/g, " ").trim();
    expect(text(rows[0])).toBe("Mcrates/git-core/src/log/graph.rs+42−7");
    expect(text(rows[1])).toBe("Acrates/git-core/src/log/cache.rs+88");
    expect(text(rows[2])).toBe("Rsrc/log.rs → src/log/mod.rs");
    expect(rows[0].getAttribute("aria-selected")).toBe("true");
    expect(rows[1].getAttribute("aria-selected")).toBe("false");
    expect(container.textContent).toContain("3 files changed");
  });

  it("tree mode is a tree of treeitems (folders expandable), not a listbox of options", () => {
    useDiffStore.setState({ target: { kind: "commit", oid: "c" }, files: FILES, filesLoading: false, filesError: null, selectedPath: null, fileListMode: "tree" });
    const { container, getByRole, getAllByRole, queryByRole } = render(<ChangedFileList />);
    expect(getByRole("tree", { name: "Changed files" })).toBeTruthy();
    expect(queryByRole("listbox")).toBeNull();
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
    // Single-child chains are one row each, with the full path still in the tooltip.
    const folders = getAllByRole("treeitem", { expanded: true });
    expect(folders.map((b) => b.textContent)).toEqual(["crates / git-core / src / log", "src / log"]);
    expect(folders[0].getAttribute("title")).toBe("crates/git-core/src/log");
    // Leaves are treeitems too, levelled by depth.
    const leaves = getAllByRole("treeitem").filter((r) => !r.hasAttribute("aria-expanded"));
    expect(leaves.map((r) => r.textContent?.replace(/\s+/g, ""))).toEqual(["Acache.rs+88", "Mgraph.rs+42−7", "Rmod.rs"]);
    expect(leaves[0].getAttribute("aria-level")).toBe("2"); // crates/git-core/src/log > cache.rs
  });

  it("←/→ on the tree fold the selected file's own folder", () => {
    useDiffStore.setState({ target: { kind: "commit", oid: "c" }, files: FILES, filesLoading: false, filesError: null, selectedPath: null, fileListMode: "tree" });
    const { getByRole, getByTitle } = render(<ChangedFileList />);
    const tree = getByRole("tree", { name: "Changed files" });
    const folder = () => getByTitle("src/log");
    // ↑/↓ move the selection with the focus still on the container, so that is where ←/→ arrive:
    // a keyboard-only user never has a folder row focused to fold it.
    fireEvent.keyDown(tree, { key: "End" });
    expect(useDiffStore.getState().selectedPath).toBe("src/log/mod.rs");
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(folder().getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    expect(folder().getAttribute("aria-expanded")).toBe("true");
  });

  it("↑/↓ resume from a collapsed folder's row, not from the top of the list", () => {
    // Rows: a/, a/one.rs, b/, b/two.rs, c.rs — a collapsed `b/` sits in the middle of the walk.
    const nested: FileChange[] = ["a/one.rs", "b/two.rs", "c.rs"].map((path) => ({ path, oldPath: null, status: "modified", additions: 1, deletions: 0, binary: false }));
    useDiffStore.setState({ target: { kind: "commit", oid: "c" }, files: nested, filesLoading: false, filesError: null, selectedPath: "b/two.rs", fileListMode: "tree" });
    const { getByRole, getByTitle } = render(<ChangedFileList />);
    fireEvent.click(getByTitle("b"));
    const tree = getByRole("tree", { name: "Changed files" });
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(useDiffStore.getState().selectedPath).toBe("c.rs");
    useDiffStore.setState({ selectedPath: "b/two.rs" });
    fireEvent.keyDown(tree, { key: "ArrowUp" });
    expect(useDiffStore.getState().selectedPath).toBe("a/one.rs");
  });

  it("↑ with nothing selected lands on the last row, the way the commit panel walks", () => {
    useDiffStore.setState({ target: { kind: "commit", oid: "c" }, files: FILES, filesLoading: false, filesError: null, selectedPath: null, fileListMode: "flat" });
    const { getByRole } = render(<ChangedFileList />);
    fireEvent.keyDown(getByRole("listbox", { name: "Changed files" }), { key: "ArrowUp" });
    expect(useDiffStore.getState().selectedPath).toBe("src/log/mod.rs");
  });

  it("keeps a selection per tab: the Changes file and the Files file are remembered separately", () => {
    useDiffStore.setState({ target: { kind: "commit", oid: "c" }, files: FILES, filesLoading: false, filesError: null, selectedPath: FILES[0].path, fileListMode: "flat", tree: TREE });
    const { getByRole } = render(<ChangedFileList />);
    const tab = (name: string) => getByRole("tab", { name });
    expect(tab("Changes").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(tab("Files"));
    expect(tab("Files").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(getByRole("option", { name: /src\/main\.rs/ }));
    expect(useDiffStore.getState().treeSelectedPath).toBe("src/main.rs");
    // The Changes tab's own selection is untouched by the Files one.
    expect(useDiffStore.getState().selectedPath).toBe(FILES[0].path);

    fireEvent.click(tab("Changes"));
    expect(getByRole("listbox", { name: "Changed files" })).toBeTruthy();
    fireEvent.click(tab("Files"));
    expect(getByRole("option", { name: /src\/main\.rs/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("the Files tab shows name and size, no status letter", () => {
    useDiffStore.setState({ target: { kind: "commit", oid: "c" }, files: FILES, filesLoading: false, filesError: null, fileListMode: "flat", tab: "files", tree: TREE });
    const { container, getByRole } = render(<ChangedFileList />);
    expect(getByRole("listbox", { name: "Files" })).toBeTruthy();
    const rows = container.querySelectorAll('[role="option"]');
    const text = (el: Element) => el.textContent?.replace(/\s+/g, " ").trim();
    expect(text(rows[0])).toBe("readme.md12 B");
    expect(text(rows[3])).toBe("vendor/depsubmodule");
    expect(container.textContent).toContain("4 files");
    // The status glyph belongs to the Changes tab: nothing here changed.
    expect(container.querySelectorAll('[role="option"] [aria-hidden]').length).toBe(0);
  });

  it("Files folders start collapsed; opening one shows what is under it", () => {
    useDiffStore.setState({ target: { kind: "commit", oid: "c" }, files: [], filesLoading: false, filesError: null, fileListMode: "tree", tab: "files", tree: TREE });
    const { getAllByRole, getByTitle } = render(<ChangedFileList />);
    const leaves = () => getAllByRole("treeitem").filter((r) => !r.hasAttribute("aria-expanded"));
    expect(getAllByRole("treeitem", { expanded: false }).map((r) => r.getAttribute("title"))).toEqual(["src", "vendor"]);
    expect(leaves().map((r) => r.textContent?.trim())).toEqual(["readme.md12 B"]);

    fireEvent.click(getByTitle("src"));
    expect(getByTitle("src").getAttribute("aria-expanded")).toBe("true");
    expect(leaves().map((r) => r.textContent?.replace(/\s+/g, ""))).toEqual(["lib.rs20B", "main.rs30B", "readme.md12B"]);
  });

  it("the filter flattens the Files tab to matches and clearing it restores the tree", () => {
    useDiffStore.setState({ target: { kind: "commit", oid: "c" }, files: [], filesLoading: false, filesError: null, fileListMode: "tree", tab: "files", tree: TREE });
    const { container, getByRole, queryByRole } = render(<ChangedFileList />);
    const filter = getByRole("textbox", { name: "Filter files" });

    fireEvent.change(filter, { target: { value: "MAIN" } });
    // Case-insensitive, and flat: no folder rows while it is set.
    expect(queryByRole("tree")).toBeNull();
    const rows = () => Array.from(container.querySelectorAll('[role="option"]')).map((r) => r.getAttribute("data-path"));
    expect(rows()).toEqual(["src/main.rs"]);

    fireEvent.change(filter, { target: { value: "nothing-matches" } });
    expect(container.textContent).toContain("No matching files");

    fireEvent.change(filter, { target: { value: "" } });
    expect(getByRole("tree", { name: "Files" })).toBeTruthy();
  });

  it("caps the filter at 2000 rows and banners how many more matched", () => {
    // 2 005 entries, every one of them a match: past the cap the list would be thousands of rows
    // nobody scrolls through.
    const many: TreeEntry[] = Array.from({ length: 2005 }, (_, i) => ({ path: `src/f${String(i).padStart(4, "0")}.rs`, size: 1, mode: "100644", kind: "blob" }));
    useDiffStore.setState({ target: { kind: "commit", oid: "c" }, files: [], filesLoading: false, filesError: null, fileListMode: "tree", tab: "files", tree: many });
    const { container, getByRole } = render(<ChangedFileList />);
    const filter = getByRole("textbox", { name: "Filter files" });

    fireEvent.change(filter, { target: { value: ".rs" } });
    // Virtualized, so most rows are never mounted: End walks the selection ring the list derives
    // from its rows, and that ring ends at the 2000th match, not the 2005th.
    fireEvent.keyDown(getByRole("listbox", { name: "Files" }), { key: "End" });
    expect(useDiffStore.getState().treeSelectedPath).toBe("src/f1999.rs");
    expect(container.textContent).toContain("5 more matches — narrow the filter");

    // Narrowed under the cap: nothing is being held back, so the banner goes.
    fireEvent.change(filter, { target: { value: "f000" } });
    expect(container.textContent).not.toContain("more matches");
  });

  it("the row menu reveals only on the working-tree row, and saves where the dialog points", async () => {
    useDiffStore.setState({ repoId: "r", target: { kind: "commit", oid: "c" }, files: [], filesLoading: false, filesError: null, fileListMode: "flat", tab: "files", tree: TREE });
    const { getByRole, queryByRole, rerender } = render(<ChangedFileList />);
    const row = () => getByRole("option", { name: /src\/main\.rs/ });

    fireEvent.contextMenu(row(), { clientX: 10, clientY: 20 });
    expect(getByRole("menu", { name: "File actions" })).toBeTruthy();
    // A commit's file is not on disk: there is nothing for the file manager to point at.
    expect(queryByRole("menuitem", { name: "Reveal in folder" })).toBeNull();
    fireEvent.click(getByRole("menuitem", { name: "Save as…" }));
    await waitFor(() => expect(ipc.saveFileAs).toHaveBeenCalledWith("r", { kind: "commit", oid: "c" }, "src/main.rs", "C:/out/main.rs"));

    // Open hands the commit's target along, so the backend opens a temp copy of the blob.
    fireEvent.contextMenu(row(), { clientX: 10, clientY: 20 });
    fireEvent.click(getByRole("menuitem", { name: "Open" }));
    await waitFor(() => expect(ipc.openPath).toHaveBeenCalledWith("r", "src/main.rs", false, { kind: "commit", oid: "c" }));

    act(() => useDiffStore.setState({ target: { kind: "workdir" } }));
    rerender(<ChangedFileList />);
    fireEvent.contextMenu(row(), { clientX: 10, clientY: 20 });
    expect(getByRole("menuitem", { name: "Reveal in folder" })).toBeTruthy();
    fireEvent.click(getByRole("menuitem", { name: "Open" }));
    // The working tree's own file, so no target: `open_path` joins the repository itself.
    await waitFor(() => expect(ipc.openPath).toHaveBeenLastCalledWith("r", "src/main.rs", false, undefined));
  });

  it("Show in Changes appears for a file the commit changed and switches tab + selection", () => {
    useDiffStore.setState({
      repoId: "r",
      target: { kind: "commit", oid: "c" },
      files: [{ path: "src/main.rs", oldPath: null, status: "modified", additions: 1, deletions: 0, binary: false }],
      filesLoading: false,
      filesError: null,
      fileListMode: "flat",
      tab: "files",
      tree: TREE,
    });
    const { getByRole, queryByRole } = render(<ChangedFileList />);

    // A file this commit left alone has nowhere to go in the Changes list.
    fireEvent.contextMenu(getByRole("option", { name: /readme\.md/ }), { clientX: 1, clientY: 1 });
    expect(queryByRole("menuitem", { name: "Show in Changes" })).toBeNull();
    fireEvent.keyDown(getByRole("menu", { name: "File actions" }), { key: "Escape" });

    fireEvent.contextMenu(getByRole("option", { name: /src\/main\.rs/ }), { clientX: 1, clientY: 1 });
    fireEvent.click(getByRole("menuitem", { name: "Show in Changes" }));
    expect(useDiffStore.getState().tab).toBe("changes");
    expect(useDiffStore.getState().selectedPath).toBe("src/main.rs");
  });

  it("another target starts the list back at the top", () => {
    useDiffStore.setState({ target: { kind: "commit", oid: "c1" }, files: FILES, filesLoading: false, filesError: null, selectedPath: null, fileListMode: "flat" });
    render(<ChangedFileList />);
    scrolls.offsets.length = 0;
    // A scrolled list showing a new commit's files must not keep the old offset: row 0 would be off-screen.
    act(() => useDiffStore.setState({ target: { kind: "commit", oid: "c2" }, files: FILES.slice(0, 1) }));
    expect(scrolls.offsets).toEqual([0]);
  });
});
