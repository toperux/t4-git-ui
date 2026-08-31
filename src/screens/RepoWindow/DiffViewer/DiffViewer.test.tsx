import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDiffStore } from "../../../store/diffStore";
import { bigDiff, fileDiff, hunk, line } from "./diffFixtures";
import { DiffViewer } from "./DiffViewer";

vi.mock("../../../api/ipc", () => ({
  getCommitFiles: vi.fn(() => new Promise(() => {})),
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
        initialRect: { width: 800, height: 400 },
        observeElementRect: (_instance, cb) => {
          cb({ width: 800, height: 400 });
          return () => {};
        },
      }),
  };
});

afterEach(cleanup);

const SMALL = fileDiff(
  [
    hunk("@@ -112,3 +112,4 @@ impl LaneLayout", [
      line("context", 112, 112, "    let a = 1;"),
      line("del", 113, null, "    let lane = matches[0];\r"),
      line("add", null, 113, "    let lane = match matches.first() {"),
      line("add", null, 114, "    };", true),
    ]),
  ],
  { path: "crates/git-core/src/log/graph.rs" },
);

describe("DiffViewer", () => {
  it("unified: header path + stats, hunk header, both line numbers, CR glyph and no-newline marker", () => {
    useDiffStore.setState({ selectedPath: SMALL.path, files: [], diff: SMALL, diffLoading: false, diffError: null, view: "unified" });
    const { container, getByRole } = render(<DiffViewer />);
    expect(container.textContent).toContain("crates/git-core/src/log/graph.rs");
    expect(container.textContent).toContain("+2");
    expect(container.textContent).toContain("−1");
    const region = getByRole("region", { name: "Diff" });
    const rows = Array.from(region.firstElementChild!.children);
    expect(rows).toHaveLength(6); // hunk + 4 lines + nonl
    expect(rows[0].textContent).toBe("@@ -112,3 +112,4 @@ impl LaneLayout");
    const cells = (i: number) => Array.from(rows[i].children).map((c) => c.textContent);
    expect(cells(1)).toEqual(["112", "112", " ", "    let a = 1;"]);
    expect(cells(2)).toEqual(["113", "", "−", "    let lane = matches[0];␍"]);
    expect(cells(3)).toEqual(["", "113", "+", "    let lane = match matches.first() {"]);
    expect(cells(5)).toEqual(["", "", "\\", "No newline at end of file"]);
    expect(rows[1].querySelector(".selectable")).toBeTruthy();
    expect(getByRole("button", { name: "Unified view" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("split: del/add pair share a row, each side with its own number", () => {
    useDiffStore.setState({ selectedPath: SMALL.path, files: [], diff: SMALL, diffLoading: false, diffError: null, view: "split" });
    const { getByRole } = render(<DiffViewer />);
    const rows = Array.from(getByRole("region", { name: "Diff" }).firstElementChild!.children);
    expect(rows).toHaveLength(5); // hunk, context, pair, add-only, nonl
    const sides = (i: number) => Array.from(rows[i].children).map((side) => Array.from(side.children).map((c) => c.textContent));
    expect(sides(1)).toEqual([
      ["112", " ", "    let a = 1;"],
      ["112", " ", "    let a = 1;"],
    ]);
    expect(sides(2)).toEqual([
      ["113", "−", "    let lane = matches[0];␍"],
      ["113", "+", "    let lane = match matches.first() {"],
    ]);
    expect(sides(3)[0]).toEqual([]); // filler
    expect(sides(3)[1]).toEqual(["114", "+", "    };"]);
  });

  it("renders only the virtual window of a 30k-line diff and shows the truncation banner", () => {
    const big = { ...bigDiff(30_000), truncated: true };
    useDiffStore.setState({ selectedPath: big.path, files: [], diff: big, diffLoading: false, diffError: null, view: "unified" });
    const { getByRole, getByText } = render(<DiffViewer />);
    const body = getByRole("region", { name: "Diff" }).firstElementChild as HTMLElement;
    expect(body.children.length).toBeLessThan(120); // 400px / 20px + 2×30 overscan
    expect(parseInt(body.style.height, 10)).toBeGreaterThan(30_000 * 20);
    expect(getByText("Diff truncated at 20 000 lines")).toBeTruthy();
  });

  it("empty and binary states", () => {
    useDiffStore.setState({ selectedPath: null, diff: null, diffLoading: false, diffError: null });
    const a = render(<DiffViewer />);
    expect(a.getByText("Select a file")).toBeTruthy();
    cleanup();
    useDiffStore.setState({ selectedPath: "img.png", diff: fileDiff([], { path: "img.png", binary: true }) });
    const b = render(<DiffViewer />);
    expect(b.getByText("Binary file")).toBeTruthy();
  });
});
