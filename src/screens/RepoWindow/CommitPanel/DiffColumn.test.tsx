import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkdirStatus } from "../../../api/types";
import { useCommitStore } from "../../../store/commitStore";
import { useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { DiffColumn } from "./CommitPanel";

/** Every `actions` object the column handed down, in order. */
const seen = vi.hoisted(() => ({ actions: [] as unknown[] }));
const last = () => seen.actions[seen.actions.length - 1];
vi.mock("../DiffViewer/DiffViewer", () => ({
  DiffViewer: ({ actions }: { actions?: unknown }) => {
    seen.actions.push(actions);
    return null;
  },
}));
// `actions.ts` (the external diff tool) pulls the folder picker in.
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn() }));

const STATUS: WorkdirStatus = {
  entries: [{ path: "a.rs", oldPath: null, index: null, workdir: "modified", conflicted: false, workdirStamp: "1:1" }],
  staged: 0,
  unstaged: 1,
  untracked: 0,
  conflicted: 0,
  state: "clean",
};

beforeEach(() => {
  seen.actions.length = 0;
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "r", head: { oid: "h", branch: "main", detached: false } }, refs: null });
  useStatusStore.setState({ status: STATUS, error: null });
  useCommitStore.getState().reset();
  useCommitStore.setState({ diffPath: "a.rs", diffList: "unstaged" });
});
afterEach(cleanup);

describe("DiffColumn", () => {
  it("keeps one `actions` object across renders that change nothing it is made of", () => {
    render(<DiffColumn />);
    const first = last();
    expect(first).toBeTruthy();
    // A background reload of the same file: the column re-renders, but every input to `actions` is
    // untouched — a fresh object here re-renders every memoised row in the diff below.
    act(() => useCommitStore.setState({ diffLoading: true }));
    expect(seen.actions.length).toBeGreaterThan(1);
    expect(last()).toBe(first);
  });
});
