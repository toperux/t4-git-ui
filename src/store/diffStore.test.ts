import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileChange, FileDiff } from "../api/types";

vi.mock("../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/ipc")>();
  return { ...actual, getCommitFiles: vi.fn(), getFileDiff: vi.fn() };
});

import * as ipc from "../api/ipc";
import { useDiffStore } from "./diffStore";

const mocked = ipc as unknown as { getCommitFiles: ReturnType<typeof vi.fn>; getFileDiff: ReturnType<typeof vi.fn> };
const flush = () => new Promise((r) => setTimeout(r, 0));

const file = (path: string): FileChange => ({ path, oldPath: null, status: "modified", additions: 1, deletions: 1, binary: false });
const diffFor = (path: string): FileDiff => ({ path, oldPath: null, status: "modified", binary: false, hunks: [], truncated: false, maxLines: 20_000, additions: 1, deletions: 1 });

beforeEach(() => {
  vi.clearAllMocks();
  useDiffStore.setState({ repoId: null, oid: null, files: [], selectedPath: null, diff: null, ignoreWhitespace: false });
});

describe("diffStore", () => {
  it("selects the first file of a commit and loads its diff; a new commit resets the selection", async () => {
    mocked.getCommitFiles.mockImplementation((_id: string, oid: string) => Promise.resolve([file(`${oid}/a.ts`), file(`${oid}/b.ts`)]));
    mocked.getFileDiff.mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve(diffFor(path)));

    await useDiffStore.getState().loadCommit("r", "c1");
    await flush();
    expect(useDiffStore.getState().selectedPath).toBe("c1/a.ts");
    expect(useDiffStore.getState().diff?.path).toBe("c1/a.ts");
    expect(mocked.getFileDiff).toHaveBeenLastCalledWith("r", { kind: "commit", oid: "c1" }, "c1/a.ts", { context: 3, ignoreWhitespace: false });

    useDiffStore.getState().selectPath("c1/b.ts");
    await flush();
    expect(useDiffStore.getState().diff?.path).toBe("c1/b.ts");

    await useDiffStore.getState().loadCommit("r", "c2");
    await flush();
    expect(useDiffStore.getState().selectedPath).toBe("c2/a.ts");
    expect(useDiffStore.getState().diff?.path).toBe("c2/a.ts");

    await useDiffStore.getState().loadCommit("r", null);
    expect(useDiffStore.getState()).toMatchObject({ files: [], selectedPath: null, diff: null });
  });

  it("ignores file-list and diff responses that arrive after the selection moved on", async () => {
    let resolveFiles!: (f: FileChange[]) => void;
    let resolveDiff!: (d: FileDiff) => void;
    mocked.getCommitFiles
      .mockImplementationOnce(() => new Promise<FileChange[]>((r) => (resolveFiles = r)))
      .mockImplementationOnce(() => Promise.resolve([file("x.ts"), file("y.ts")]));
    mocked.getFileDiff
      .mockImplementationOnce(() => new Promise<FileDiff>((r) => (resolveDiff = r))) // x.ts (slow)
      .mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve(diffFor(path)));

    void useDiffStore.getState().loadCommit("r", "slow");
    await useDiffStore.getState().loadCommit("r", "fast");
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
    expect(useDiffStore.getState().oid).toBe("fast");
  });

  it("persists the view mode and reloads on the whitespace toggle", async () => {
    mocked.getCommitFiles.mockResolvedValue([file("a.ts")]);
    mocked.getFileDiff.mockImplementation((_id: string, _t: unknown, path: string) => Promise.resolve(diffFor(path)));
    await useDiffStore.getState().loadCommit("r", "c");
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
