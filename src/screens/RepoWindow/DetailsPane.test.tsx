import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitDetail, LogRow, RefsSnapshot } from "../../api/types";
import { __resetForTests as resetRepo, useRepoStore } from "../../store/repoStore";
import { DetailsPane } from "./DetailsPane";

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
    getCommitFiles: vi.fn(() => Promise.resolve([])),
    getFileDiff: vi.fn(() => new Promise(() => {})),
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
});
