// The details pane end to end across a tab switch: a file of its own, since its virtualizer mock
// applies to the whole file and `DetailsPane.test.tsx` keeps the real size watch.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitDetail, FileChange, FileDiff, LogRow } from "../../api/types";
import { observeVisibleRect } from "../../lib/observeVisibleRect";
import { restore, snapshot, useDiffStore } from "../../store/diffStore";
import { __resetForTests as resetRepo, useRepoStore } from "../../store/repoStore";
import { DetailsPane } from "./DetailsPane";
import { stripes } from "./DiffViewer/diffFixtures";
import { flattenUnified } from "./DiffViewer/diffRows";
import { forgetScroll, seedScroll } from "./DiffViewer/diffScroll";

const DETAIL: CommitDetail = {
  info: { oid: "a", short: "a", summary: "Ship it", authorName: "Ada", authorEmail: "ada@x", authorTime: 0, committerTime: 0, parents: [], isMerge: false },
  message: "Ship it\n",
  committerName: "Ada",
  committerEmail: "ada@x",
  signed: false,
};
const ROW: LogRow = { row: { commit: DETAIL.info, lane: 0, color: 0, lines: [], maxLane: 0 }, labels: [] };
const DIFF = stripes();
const FILES: FileChange[] = [
  { path: "first.rs", oldPath: null, status: "modified", additions: 1, deletions: 1, binary: false },
  { path: DIFF.path, oldPath: null, status: "modified", additions: DIFF.additions, deletions: DIFF.deletions, binary: false },
];

const ipcMock = vi.hoisted(() => ({ files: null as null | ((f: FileChange[]) => void), diff: null as null | ((d: FileDiff) => void) }));
vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return {
    ...actual,
    getCommit: vi.fn(() => Promise.resolve(DETAIL)),
    getChangedFiles: vi.fn(() => new Promise((r) => (ipcMock.files = r))),
    getFileDiff: vi.fn(() => new Promise((r) => (ipcMock.diff = r))),
  };
});
vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => <div />,
}));
// The diff body's virtualizer (the one with the visible-box watch) gets a viewport and records its
// scroll requests; the file list's is left alone.
const offsets = vi.hoisted(() => [] as number[]);
vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-virtual")>();
  return {
    ...actual,
    useVirtualizer: (opts: Parameters<typeof actual.useVirtualizer>[0]) => {
      if (opts.observeElementRect !== observeVisibleRect) return actual.useVirtualizer(opts);
      const v = actual.useVirtualizer({
        ...opts,
        initialRect: { width: 800, height: 400 },
        observeElementRect: (_instance, cb) => {
          cb({ width: 800, height: 400 });
          return () => {};
        },
        observeElementOffset: (_instance, cb) => {
          cb(0, false);
          return () => {};
        },
      });
      v.scrollToOffset = (offset: number) => offsets.push(offset);
      return v;
    },
  };
});

beforeEach(() => {
  resetRepo();
  forgetScroll();
  offsets.length = 0;
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } }, rows: [ROW], selectedIndex: 0, wtSelected: false });
  useDiffStore.setState({ view: "unified", tab: "changes", ignoreWhitespace: false, context: 3 });
});
afterEach(cleanup);

describe("DetailsPane across a tab switch", () => {
  it("comes back on its file at its scroll, and keeps both through the same-target reload", async () => {
    // What the tab was left with, then put back by the switch: its file and diff, and its seed.
    useDiffStore.setState({ repoId: "r", target: { kind: "commit", oid: "a" }, files: FILES, selectedPath: DIFF.path, diff: DIFF, filesLoading: false, diffLoading: false });
    restore(snapshot());
    seedScroll({ pane: "history", repoId: "r", path: DIFF.path, diff: DIFF, rows: flattenUnified(DIFF).rows, view: "unified", top: 12_000 });

    const { getByRole } = render(<DetailsPane />);
    const region = getByRole("region", { name: "Diff" });
    expect(offsets).toEqual([12_000]);

    // The pane's reload (the window's settings) keeps the body mounted, on its file.
    await act(async () => ipcMock.files?.(FILES));
    expect(useDiffStore.getState().selectedPath).toBe(DIFF.path);
    await act(async () => ipcMock.diff?.(stripes()));
    expect(getByRole("region", { name: "Diff" })).toBe(region);
    expect(useDiffStore.getState().diff).toBe(DIFF);
    expect(offsets).toEqual([12_000]);
  });
});
