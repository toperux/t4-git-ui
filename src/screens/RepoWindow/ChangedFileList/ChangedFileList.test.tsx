import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileChange } from "../../../api/types";
import { useDiffStore } from "../../../store/diffStore";
import { ChangedFileList } from "./ChangedFileList";

vi.mock("../../../api/ipc", () => ({
  getChangedFiles: vi.fn(() => new Promise(() => {})),
  getFileDiff: vi.fn(() => new Promise(() => {})),
  toAppError: (e: unknown) => ({ kind: "unknown", message: String(e) }),
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

afterEach(cleanup);

const FILES: FileChange[] = [
  { path: "crates/git-core/src/log/graph.rs", oldPath: null, status: "modified", additions: 42, deletions: 7, binary: false },
  { path: "crates/git-core/src/log/cache.rs", oldPath: null, status: "added", additions: 88, deletions: 0, binary: false },
  { path: "src/log/mod.rs", oldPath: "src/log.rs", status: "renamed", additions: 0, deletions: 0, binary: false },
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
});
