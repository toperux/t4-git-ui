import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiffTarget, FileChange, FileContent, FileDiff, TreeEntry, TreeListing } from "../api/types";

vi.mock("../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/ipc")>();
  return { ...actual, getChangedFiles: vi.fn(), getFileDiff: vi.fn(), listTree: vi.fn(), readFile: vi.fn() };
});

import * as ipc from "../api/ipc";
import { __resetTreeCacheForTests, treeTargetOf, useDiffStore } from "./diffStore";

type Mock = ReturnType<typeof vi.fn>;
const mocked = ipc as unknown as { getChangedFiles: Mock; getFileDiff: Mock; listTree: Mock; readFile: Mock };
const flush = () => new Promise((r) => setTimeout(r, 0));

const commit = (oid: string): DiffTarget => ({ kind: "commit", oid });
const file = (path: string): FileChange => ({ path, oldPath: null, status: "modified", additions: 1, deletions: 1, binary: false });
const diffFor = (path: string): FileDiff => ({ path, oldPath: null, status: "modified", binary: false, hunks: [], truncated: false, maxLines: 20_000, additions: 1, deletions: 1 });
const entry = (path: string): TreeEntry => ({ path, size: 10, mode: "100644", kind: "blob" });
const listing = (oid: string | null, ...paths: string[]): TreeListing => ({ oid, entries: paths.map(entry) });
const contentFor = (path: string): FileContent => ({ path, text: "x\n", binary: false, size: 2, truncated: false, maxLines: 20_000, kind: "blob" });

beforeEach(() => {
  vi.clearAllMocks();
  __resetTreeCacheForTests();
  useDiffStore.setState({
    repoId: null,
    target: null,
    files: [],
    selectedPath: null,
    diff: null,
    ignoreWhitespace: false,
    tab: "changes",
    tree: null,
    treeFilter: "",
    treeSelectedPath: null,
    content: null,
  });
});

describe("diffStore", () => {
  it("selects the first file of a commit and loads its diff; a new commit resets the selection", async () => {
    mocked.getChangedFiles.mockImplementation((_id: string, target: { oid: string }) => Promise.resolve([file(`${target.oid}/a.ts`), file(`${target.oid}/b.ts`)]));
    mocked.getFileDiff.mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve(diffFor(path)));

    await useDiffStore.getState().load("r", commit("c1"));
    await flush();
    expect(useDiffStore.getState().selectedPath).toBe("c1/a.ts");
    expect(useDiffStore.getState().diff?.path).toBe("c1/a.ts");
    expect(mocked.getFileDiff).toHaveBeenLastCalledWith("r", { kind: "commit", oid: "c1" }, "c1/a.ts", { context: 3, ignoreWhitespace: false });

    useDiffStore.getState().selectPath("c1/b.ts");
    await flush();
    expect(useDiffStore.getState().diff?.path).toBe("c1/b.ts");

    await useDiffStore.getState().load("r", commit("c2"));
    await flush();
    expect(useDiffStore.getState().selectedPath).toBe("c2/a.ts");
    expect(useDiffStore.getState().diff?.path).toBe("c2/a.ts");

    await useDiffStore.getState().load("r", null);
    expect(useDiffStore.getState()).toMatchObject({ files: [], selectedPath: null, diff: null });
  });

  it("loads a two-commit range from the same target the file list came from", async () => {
    const target: DiffTarget = { kind: "commitRange", from: "older", to: "newer" };
    mocked.getChangedFiles.mockResolvedValue([file("a.ts"), file("b.ts")]);
    mocked.getFileDiff.mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve(diffFor(path)));

    await useDiffStore.getState().load("r", target);
    await flush();
    expect(mocked.getChangedFiles).toHaveBeenLastCalledWith("r", target);
    expect(useDiffStore.getState().selectedPath).toBe("a.ts");
    expect(mocked.getFileDiff).toHaveBeenLastCalledWith("r", target, "a.ts", { context: 3, ignoreWhitespace: false });
  });

  it("ignores file-list and diff responses that arrive after the selection moved on", async () => {
    let resolveFiles!: (f: FileChange[]) => void;
    let resolveDiff!: (d: FileDiff) => void;
    mocked.getChangedFiles
      .mockImplementationOnce(() => new Promise<FileChange[]>((r) => (resolveFiles = r)))
      .mockImplementationOnce(() => Promise.resolve([file("x.ts"), file("y.ts")]));
    mocked.getFileDiff
      .mockImplementationOnce(() => new Promise<FileDiff>((r) => (resolveDiff = r))) // x.ts (slow)
      .mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve(diffFor(path)));

    void useDiffStore.getState().load("r", commit("slow"));
    await useDiffStore.getState().load("r", commit("fast"));
    await flush();
    expect(useDiffStore.getState().selectedPath).toBe("x.ts");
    expect(useDiffStore.getState().diffLoading).toBe(true);

    useDiffStore.getState().selectPath("y.ts");
    await flush();
    expect(useDiffStore.getState().diff?.path).toBe("y.ts");

    resolveDiff(diffFor("x.ts"));
    resolveFiles([file("stale.ts")]);
    await flush();
    expect(useDiffStore.getState().diff?.path).toBe("y.ts");
    expect(useDiffStore.getState().files.map((f) => f.path)).toEqual(["x.ts", "y.ts"]);
    expect(useDiffStore.getState().target).toEqual(commit("fast"));
  });

  it("persists the view mode and reloads on the whitespace toggle", async () => {
    mocked.getChangedFiles.mockResolvedValue([file("a.ts")]);
    mocked.getFileDiff.mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve(diffFor(path)));
    await useDiffStore.getState().load("r", commit("c"));
    await flush();
    useDiffStore.getState().toggleWhitespace();
    await flush();
    expect(mocked.getFileDiff).toHaveBeenLastCalledWith("r", { kind: "commit", oid: "c" }, "a.ts", { context: 3, ignoreWhitespace: true });

    useDiffStore.getState().setView("split");
    expect(localStorage.getItem("diffView")).toBe("split");
    useDiffStore.getState().setFileListMode("tree");
    expect(localStorage.getItem("fileListMode")).toBe("tree");
  });
});

describe("diffStore — Files tab", () => {
  beforeEach(() => {
    mocked.getChangedFiles.mockResolvedValue([file("a.ts")]);
    mocked.getFileDiff.mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve(diffFor(path)));
    mocked.readFile.mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve(contentFor(path)));
  });

  it("lists the commit for a commit target and the *to* commit of a compare", () => {
    expect(treeTargetOf(commit("c1"))).toEqual({ kind: "commit", oid: "c1" });
    expect(treeTargetOf({ kind: "commitRange", from: "older", to: "newer" })).toEqual({ kind: "commit", oid: "newer" });
    expect(treeTargetOf({ kind: "workdir" })).toEqual({ kind: "workingTree" });
    expect(treeTargetOf({ kind: "staged" })).toEqual({ kind: "workingTree" });
    expect(treeTargetOf(null)).toBeNull();
  });

  it("fetches the tree only for the tab that is on screen, and serves a revisited commit from the cache", async () => {
    mocked.listTree.mockImplementation((_id: string, t: { oid: string }) => Promise.resolve(listing(`tree-${t.oid}`, "src/a.ts", "src/b.ts")));

    // The Changes tab is enough for this commit: nothing asks for its 47k paths.
    await useDiffStore.getState().load("r", commit("c1"));
    await flush();
    expect(mocked.listTree).not.toHaveBeenCalled();

    useDiffStore.getState().setTab("files");
    await flush();
    expect(mocked.listTree).toHaveBeenCalledTimes(1);
    expect(useDiffStore.getState().tree?.map((e) => e.path)).toEqual(["src/a.ts", "src/b.ts"]);

    // Another commit is another call; coming back to the first one is not.
    mocked.listTree.mockImplementation((_id: string, t: { oid: string }) => Promise.resolve(listing(`tree-${t.oid}`, "only.ts")));
    await useDiffStore.getState().load("r", commit("c2"));
    await flush();
    expect(mocked.listTree).toHaveBeenCalledTimes(2);
    await useDiffStore.getState().load("r", commit("c1"));
    await flush();
    expect(mocked.listTree).toHaveBeenCalledTimes(2);
    expect(useDiffStore.getState().tree?.map((e) => e.path)).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("remembers the selected file per target and loads its content", async () => {
    mocked.listTree.mockImplementation((_id: string, t: { oid: string }) => Promise.resolve(listing(`tree-${t.oid}`, "a.ts", "b.ts")));
    useDiffStore.setState({ tab: "files" });

    await useDiffStore.getState().load("r", commit("c1"));
    await flush();
    // Nothing is preselected — a whole tree has no "first changed file" to start on.
    expect(useDiffStore.getState().treeSelectedPath).toBeNull();
    useDiffStore.getState().selectTreePath("b.ts");
    await flush();
    expect(useDiffStore.getState().content?.path).toBe("b.ts");

    await useDiffStore.getState().load("r", commit("c2"));
    await flush();
    expect(useDiffStore.getState().treeSelectedPath).toBeNull();

    await useDiffStore.getState().load("r", commit("c1"));
    await flush();
    expect(useDiffStore.getState().treeSelectedPath).toBe("b.ts");
    expect(useDiffStore.getState().content?.path).toBe("b.ts");
  });

  it("drops a tree and a content response that arrive after the target moved on", async () => {
    let resolveTree!: (l: TreeListing) => void;
    mocked.listTree
      .mockImplementationOnce(() => new Promise<TreeListing>((r) => (resolveTree = r)))
      .mockImplementation(() => Promise.resolve(listing("tree-fast", "fast.ts")));
    useDiffStore.setState({ tab: "files" });

    void useDiffStore.getState().load("r", commit("slow"));
    await useDiffStore.getState().load("r", commit("fast"));
    await flush();
    resolveTree(listing("tree-slow", "stale.ts"));
    await flush();
    expect(useDiffStore.getState().tree?.map((e) => e.path)).toEqual(["fast.ts"]);

    let resolveContent!: (c: FileContent) => void;
    mocked.readFile.mockImplementationOnce(() => new Promise<FileContent>((r) => (resolveContent = r))).mockImplementation((_i: string, _t: unknown, p: string) => Promise.resolve(contentFor(p)));
    useDiffStore.getState().selectTreePath("fast.ts");
    useDiffStore.getState().selectTreePath("other.ts");
    await flush();
    resolveContent(contentFor("fast.ts"));
    await flush();
    expect(useDiffStore.getState().content?.path).toBe("other.ts");
  });

  it("never caches the working tree — it changes under us", async () => {
    mocked.listTree.mockResolvedValue(listing(null, "a.ts"));
    useDiffStore.setState({ tab: "files" });
    await useDiffStore.getState().load("r", { kind: "workdir" });
    await flush();
    await useDiffStore.getState().load("r", { kind: "workdir" });
    await flush();
    expect(mocked.listTree).toHaveBeenCalledTimes(2);
  });
});
