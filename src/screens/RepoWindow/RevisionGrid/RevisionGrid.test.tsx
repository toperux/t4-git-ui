// Static render check: chips lead the row, HEAD chip before the branch chip, before the subject.
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Branch, LogRow, RefsSnapshot } from "../../../api/types";
import { useDialogStore } from "../../../store/dialogStore";
import { useOpsStore } from "../../../store/opsStore";
import { __resetForTests as resetRepo, useRepoStore } from "../../../store/repoStore";
import { __resetForTests as resetStatus, useStatusStore } from "../../../store/statusStore";
import { RevisionGrid } from "./RevisionGrid";

vi.mock("../../../api/ipc", () => ({
  getLogPage: vi.fn(() => new Promise(() => {})),
  getStatus: vi.fn(() => new Promise(() => {})),
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
        initialRect: { width: 800, height: 300 },
        observeElementRect: (_instance, cb) => {
          cb({ width: 800, height: 300 });
          return () => {};
        },
      }),
  };
});

function row(i: number, summary: string, labels: LogRow["labels"]): LogRow {
  return {
    row: {
      commit: { oid: `oid${i}`, short: `oid${i}`, summary, authorName: "Ada", authorEmail: "a@b", authorTime: 0, committerTime: 0, parents: [], isMerge: false },
      lane: 0,
      color: 0,
      lines: [],
      maxLane: 0,
    },
    labels,
  };
}

const branch = (name: string, oid: string, extra: Partial<Branch> = {}): Branch => ({ name, oid, upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead: false, ...extra });

// `main` (current) and `stale` are at oid0; `feature` / `hotfix` sit at oid1 with origin/main and
// origin/renamed (tracked by `stale`); origin/new at oid2 has no local counterpart.
const REFS: RefsSnapshot = {
  head: { oid: "oid0", branch: "main", detached: false },
  state: "clean",
  local: [branch("main", "oid0", { upstream: "origin/main", isHead: true }), branch("feature", "oid1"), branch("hotfix", "oid1"), branch("stale", "oid0", { upstream: "origin/renamed" })],
  remotes: [
    {
      name: "origin",
      url: null,
      branches: [
        { name: "origin/main", oid: "oid1", mergedInto: null },
        { name: "origin/renamed", oid: "oid1", mergedInto: null },
        { name: "origin/new", oid: "oid2", mergedInto: null },
      ],
    },
  ],
  tags: [],
  stashes: [],
};

function withRefs() {
  useRepoStore.setState({
    repo: { id: "r", name: "r", path: "r", head: { oid: "oid0", branch: "main", detached: false } },
    refs: REFS,
    log: { generation: 1, total: 3, complete: true, error: null, flat: false },
    rows: [row(0, "Top", []), row(1, "Middle", []), row(2, "Initial", [])],
    selectedIndex: 0,
  });
}

// jsdom has no canvas backend; GraphCell skips drawing when getContext returns null.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  resetRepo();
  resetStatus();
});
afterEach(() => {
  cleanup();
  // The prototype spy is global: leaving it installed would leak into other suites in the same worker.
  vi.restoreAllMocks();
});

describe("RevisionGrid", () => {
  it("renders HEAD chip, then branch chip, then subject", () => {
    useRepoStore.setState({
      repo: { id: "r", name: "r", path: "r", head: { oid: "oid0", branch: "main", detached: false } },
      refs: null,
      log: { generation: 1, total: 3, complete: true, error: null, flat: false },
      rows: [
        row(0, "Dedupe lanes", [{ name: "main", kind: "local", isCurrent: true, remote: "origin" }]),
        row(1, "Merge branch", [{ name: "origin/dev", kind: "remote", isCurrent: false, remote: null }, { name: "v1.0", kind: "tag", isCurrent: false, remote: null }]),
        row(2, "Initial", []),
      ],
      selectedIndex: 0,
    });

    const { container } = render(<RevisionGrid />);
    const rows = container.querySelectorAll('[role="row"][aria-rowindex]');
    expect(rows).toHaveLength(3);

    const text = (el: Element) => el.textContent?.replace(/\s+/g, " ").trim();
    // Chips lead the subject cell, HEAD first; the synced remote renders inside the local chip.
    expect(text(rows[0])).toMatch(/^HEADmainoriginDedupe lanes/);
    expect(text(rows[1])).toMatch(/^origin\/devv1\.0Merge branch/);
    expect(text(rows[2])).toMatch(/^Initial/);

    expect(rows[0].getAttribute("aria-selected")).toBe("true");
    expect(rows[1].getAttribute("aria-selected")).toBe("false");
  });

  it("shows at most 3 chips; +N opens a popover listing the rest", () => {
    const labels: LogRow["labels"] = ["a", "b", "c", "d", "e"].map((name) => ({ name, kind: "local" as const, isCurrent: false, remote: null }));
    useRepoStore.setState({
      repo: { id: "r", name: "r", path: "r", head: { oid: "oid0", branch: "main", detached: false } },
      refs: null,
      log: { generation: 1, total: 1, complete: true, error: null, flat: false },
      rows: [row(0, "Many refs", labels)],
      selectedIndex: 0,
    });

    const { getByRole, getByText, queryByRole } = render(<RevisionGrid />);
    expect(queryByRole("menu", { name: "More refs" })).toBeNull();
    const more = getByRole("button", { name: "+2" });
    expect(more.getAttribute("title")).toBe("2 more refs");
    expect(getByText("+2")).toBeTruthy();

    fireEvent.click(more);
    const menu = getByRole("menu", { name: "More refs" });
    expect(Array.from(menu.children).map((c) => c.textContent)).toEqual(["d", "e"]);
    // Clicking the +N chip must not move the grid selection off the row it belongs to.
    expect(useRepoStore.getState().wtSelected).toBe(false);
  });

  it("shows the working-tree pseudo-row first while the tree is dirty; commits shift by one", () => {
    useRepoStore.setState({
      repo: { id: "r", name: "r", path: "r", head: { oid: "oid0", branch: "main", detached: false } },
      refs: null,
      log: { generation: 1, total: 2, complete: true, error: null, flat: false },
      rows: [row(0, "Top", []), row(1, "Initial", [])],
      selectedIndex: 0,
      wtSelected: false,
    });
    useStatusStore.setState({
      status: { entries: [{ path: "a", oldPath: null, index: null, workdir: "modified", conflicted: false, workdirStamp: "1:1" }], staged: 0, unstaged: 1, untracked: 2, conflicted: 0 },
    });
    const { container, getByRole } = render(<RevisionGrid />);
    const rows = container.querySelectorAll('[role="row"][aria-rowindex]');
    expect(rows).toHaveLength(3);
    expect(getByRole("grid").getAttribute("aria-rowcount")).toBe("3");
    expect(rows[0].textContent?.trim()).toBe("Working tree · 3 changes");
    expect(rows[0].getAttribute("aria-rowindex")).toBe("1");
    expect(rows[1].getAttribute("aria-rowindex")).toBe("2");
    expect(rows[1].textContent).toContain("Top");
    // HEAD stays the selected row until the pseudo-row is picked.
    expect(rows[0].getAttribute("aria-selected")).toBe("false");
    expect(rows[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.mouseDown(rows[0]);
    expect(useRepoStore.getState().wtSelected).toBe(true);
    // A double-click opens the full-window commit dialog.
    useDialogStore.setState({ dialog: null });
    fireEvent.doubleClick(rows[0]);
    expect(useDialogStore.getState().dialog).toEqual({ kind: "commit" });
    useDialogStore.setState({ dialog: null });
    // ArrowDown from the pseudo-row lands on the first commit.
    fireEvent.keyDown(getByRole("grid"), { key: "ArrowDown" });
    expect(useRepoStore.getState()).toMatchObject({ wtSelected: false, selectedIndex: 0 });
    fireEvent.keyDown(getByRole("grid"), { key: "ArrowUp" });
    expect(useRepoStore.getState().wtSelected).toBe(true);
    useStatusStore.setState({ status: null });
  });

  it("offers the branches at a right-clicked row and opens the dialogs on them", () => {
    withRefs();
    useDialogStore.setState({ dialog: null, returnFocus: null });
    const { container, getByRole, getAllByRole, queryByRole } = render(<RevisionGrid />);
    const rows = container.querySelectorAll('[role="row"][aria-rowindex]');
    const items = () => getAllByRole("menuitem").map((el) => el.textContent);
    const pick = (name: string) => {
      fireEvent.click(getByRole("menuitem", { name }));
      expect(queryByRole("menu", { name: "Commit actions" })).toBeNull();
      return useDialogStore.getState();
    };

    fireEvent.contextMenu(rows[1], { clientX: 10, clientY: 20 });
    expect(useRepoStore.getState().selectedIndex).toBe(1);
    expect(items()).toEqual([
      "Checkout branch…",
      "Checkout (detached)",
      "Merge branch here…",
      "Rebase main onto feature…",
      "Create branch here…",
      "Reset main to here…",
      "Reset main to origin/main…",
      "Reset stale to origin/renamed…",
      "Create tag here…",
      "Copy SHA",
    ]);
    // Two locals at the row: the dialog picks; focus is handed back to the row the menu came from.
    const picker = pick("Checkout branch…");
    expect(picker.dialog).toEqual({ kind: "checkoutBranch", branches: [{ name: "feature", remote: null }, { name: "hotfix", remote: null }] });
    // `toBe`: matching a DOM node structurally walks React's fiber props on it and never returns.
    expect(picker.returnFocus).toBe(rows[1]);
    fireEvent.contextMenu(rows[1]);
    expect(pick("Reset main to here…").dialog).toEqual({ kind: "reset", target: "oid1" });
    fireEvent.contextMenu(rows[1]);
    // The current branch takes a `git reset`; another local moves with `branch -f`.
    expect(pick("Reset main to origin/main…").dialog).toEqual({ kind: "reset", target: "origin/main" });
    fireEvent.contextMenu(rows[1]);
    expect(pick("Reset stale to origin/renamed…").dialog).toEqual({ kind: "resetBranch", branch: "stale", target: "origin/renamed" });

    // A lone remote branch without a local: a direct checkout item, not the picker.
    fireEvent.contextMenu(rows[2]);
    expect(items()).toEqual([
      "Checkout origin/new",
      "Checkout (detached)",
      "Merge origin/new into main…",
      "Rebase main onto origin/new…",
      "Create branch here…",
      "Reset main to here…",
      "Create tag here…",
      "Copy SHA",
    ]);
    expect(pick("Create tag here…").dialog).toEqual({ kind: "createTag", target: "oid2" });
    useDialogStore.setState({ dialog: null, returnFocus: null });
  });

  it("merges and rebases against the branch at the row, the commit itself without one, and neither at HEAD", () => {
    withRefs();
    // One local branch per row: the merge item names it instead of handing the pick to the dialog.
    useRepoStore.setState({ refs: { ...REFS, local: [branch("main", "oid0", { isHead: true }), branch("feature", "oid1")], remotes: [] } });
    useDialogStore.setState({ dialog: null, returnFocus: null });
    const { container, getByRole, getAllByRole } = render(<RevisionGrid />);
    const rows = container.querySelectorAll('[role="row"][aria-rowindex]');
    const items = () => getAllByRole("menuitem").map((el) => el.textContent);
    const pick = (name: string) => {
      fireEvent.click(getByRole("menuitem", { name }));
      return useDialogStore.getState().dialog;
    };

    fireEvent.contextMenu(rows[1]);
    expect(pick("Merge feature into main…")).toEqual({ kind: "merge", branch: "feature" });
    fireEvent.contextMenu(rows[1]);
    expect(pick("Rebase main onto feature…")).toEqual({ kind: "rebase", onto: "feature" });

    // No branch here: the commit is the merge source and the rebase target.
    fireEvent.contextMenu(rows[2]);
    expect(pick("Merge commit oid2 into main…")).toEqual({ kind: "merge", branch: "oid2" });
    fireEvent.contextMenu(rows[2]);
    expect(pick("Rebase main onto here…")).toEqual({ kind: "rebase", onto: "oid2" });

    // HEAD's own commit: merging into it / rebasing onto it would be a no-op.
    fireEvent.contextMenu(rows[0]);
    expect(items().filter((t) => t?.startsWith("Merge") || t?.startsWith("Rebase"))).toEqual([]);
    useDialogStore.setState({ dialog: null, returnFocus: null });
  });

  it("a detached HEAD keeps the merge item and offers no rebase", () => {
    withRefs();
    // Nothing is checked out, so `main` / `stale` are merge sources of their own — and a rebase has no
    // branch to move: offering it would replay the loose commits onto the row.
    useRepoStore.setState({ refs: { ...REFS, head: { oid: "oid9", branch: null, detached: true }, local: REFS.local.map((b) => ({ ...b, isHead: false })), remotes: [] } });
    const { container, getAllByRole } = render(<RevisionGrid />);
    fireEvent.contextMenu(container.querySelectorAll('[role="row"][aria-rowindex]')[0]);
    const items = getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toContain("Merge branch here…");
    expect(items.some((t) => t?.startsWith("Rebase"))).toBe(false);
  });

  it("greys every item but Copy SHA while an operation runs", () => {
    withRefs();
    useOpsStore.setState({ busy: "Fetching…" });
    const { container, getAllByRole } = render(<RevisionGrid />);
    fireEvent.contextMenu(container.querySelectorAll('[role="row"][aria-rowindex]')[1]);
    const items = getAllByRole("menuitem") as HTMLButtonElement[];
    const disabled = items.filter((el) => el.disabled).map((el) => el.textContent);
    expect(disabled).toHaveLength(items.length - 1);
    expect(disabled).not.toContain("Copy SHA");
    expect(disabled).toContain("Merge branch here…");
    expect(disabled).toContain("Rebase main onto feature…");
    expect(items.filter((el) => el.disabled).every((el) => el.title === "Operation in progress")).toBe(true);
    useOpsStore.setState({ busy: null });
  });
});
