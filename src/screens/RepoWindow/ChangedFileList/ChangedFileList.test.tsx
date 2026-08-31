import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileChange } from "../../../api/types";
import { useDiffStore } from "../../../store/diffStore";
import { ChangedFileList } from "./ChangedFileList";

vi.mock("../../../api/ipc", () => ({
  getCommitFiles: vi.fn(() => new Promise(() => {})),
  getFileDiff: vi.fn(() => new Promise(() => {})),
  toAppError: (e: unknown) => ({ kind: "unknown", message: String(e) }),
}));

afterEach(cleanup);

const FILES: FileChange[] = [
  { path: "crates/git-core/src/log/graph.rs", oldPath: null, status: "modified", additions: 42, deletions: 7, binary: false },
  { path: "crates/git-core/src/log/cache.rs", oldPath: null, status: "added", additions: 88, deletions: 0, binary: false },
  { path: "src/log/mod.rs", oldPath: "src/log.rs", status: "renamed", additions: 0, deletions: 0, binary: false },
];

describe("ChangedFileList", () => {
  it("renders glyph, path and +N −M per file; renames show old → new", () => {
    useDiffStore.setState({ oid: "c", files: FILES, filesLoading: false, filesError: null, selectedPath: FILES[0].path, fileListMode: "flat" });
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

  it("tree mode groups by folder and keeps the leaf name", () => {
    useDiffStore.setState({ oid: "c", files: FILES, filesLoading: false, filesError: null, selectedPath: null, fileListMode: "tree" });
    const { container, getAllByRole } = render(<ChangedFileList />);
    const folders = getAllByRole("button", { expanded: true }).map((b) => b.textContent);
    expect(folders).toEqual(["crates", "git-core", "src", "log", "src", "log"]);
    const leaves = Array.from(container.querySelectorAll('[role="option"]')).map((r) => r.textContent?.replace(/\s+/g, ""));
    expect(leaves).toEqual(["Acache.rs+88", "Mgraph.rs+42−7", "Rmod.rs"]);
  });
});
