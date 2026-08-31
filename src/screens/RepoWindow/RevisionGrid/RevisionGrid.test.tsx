// Static render check: chips lead the row, HEAD chip before the branch chip, before the subject.
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LogRow } from "../../../api/types";
import { useRepoStore } from "../../../store/repoStore";
import { RevisionGrid } from "./RevisionGrid";

vi.mock("../../../api/ipc", () => ({
  getLogPage: vi.fn(() => new Promise(() => {})),
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
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(cleanup);

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
    // Chips lead the subject cell; synced remote renders inside the local chip.
    expect(text(rows[0])).toMatch(/^HEADmainoriginDedupe lanes/);
    const chips0 = rows[0].querySelectorAll("span[title]");
    expect(chips0[0].textContent).toBe("HEAD");
    expect(chips0[1].textContent).toBe("mainorigin");

    expect(text(rows[1])).toMatch(/^origin\/devv1\.0Merge branch/);
    expect(text(rows[2])).toMatch(/^Initial/);

    expect(rows[0].getAttribute("aria-selected")).toBe("true");
    expect(rows[1].getAttribute("aria-selected")).toBe("false");
  });
});
