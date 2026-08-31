// Static render check: chips lead the row, HEAD chip before the branch chip, before the subject.
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogRow } from "../../../api/types";
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
      maxLane: 0,
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
      maxLane: 0,
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
      maxLane: 0,
      selectedIndex: 0,
      wtSelected: false,
    });
    useStatusStore.setState({
      status: { entries: [{ path: "a", oldPath: null, index: null, workdir: "modified", conflicted: false }], staged: 0, unstaged: 1, untracked: 2, conflicted: 0 },
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
    // ArrowDown from the pseudo-row lands on the first commit.
    fireEvent.keyDown(getByRole("grid"), { key: "ArrowDown" });
    expect(useRepoStore.getState()).toMatchObject({ wtSelected: false, selectedIndex: 0 });
    fireEvent.keyDown(getByRole("grid"), { key: "ArrowUp" });
    expect(useRepoStore.getState().wtSelected).toBe(true);
    useStatusStore.setState({ status: null });
  });
});
