import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDiffStore } from "../../../store/diffStore";
import { bigDiff, fileDiff, hunk, line } from "./diffFixtures";
import { DiffViewer, type DiffActions } from "./DiffViewer";

vi.mock("../../../api/ipc", () => ({
  getCommitFiles: vi.fn(() => new Promise(() => {})),
  getFileDiff: vi.fn(() => new Promise(() => {})),
  toAppError: (e: unknown) => ({ kind: "unknown", message: String(e) }),
}));

// jsdom neither lays out nor scrolls: give the virtualizer a viewport and record its scroll requests.
const scrolls = vi.hoisted(() => ({ offsets: [] as number[] }));
vi.mock("@tanstack/react-virtual", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-virtual")>();
  return {
    ...actual,
    useVirtualizer: (opts: Parameters<typeof actual.useVirtualizer>[0]) => {
      const v = actual.useVirtualizer({
        ...opts,
        initialRect: { width: 800, height: 400 },
        observeElementRect: (_instance, cb) => {
          cb({ width: 800, height: 400 });
          return () => {};
        },
      });
      v.scrollToOffset = (offset: number) => scrolls.offsets.push(offset);
      return v;
    },
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

const idle = { loading: false, error: null };

describe("DiffViewer", () => {
  it("unified: header path + stats, hunk header, both line numbers, CR glyph and no-newline marker", () => {
    useDiffStore.setState({ view: "unified" });
    const { container, getByRole } = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} />);
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
    useDiffStore.setState({ view: "split" });
    const { getByRole } = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} />);
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
    useDiffStore.setState({ view: "unified" });
    const big = { ...bigDiff(30_000), truncated: true };
    const { getByRole, getByText } = render(<DiffViewer path={big.path} diff={big} {...idle} />);
    const body = getByRole("region", { name: "Diff" }).firstElementChild as HTMLElement;
    expect(body.children.length).toBeLessThan(120); // 400px / 20px + 2×30 overscan
    expect(parseInt(body.style.height, 10)).toBeGreaterThan(30_000 * 20);
    expect(getByText("Diff truncated at 20 000 lines")).toBeTruthy();
  });

  it("empty and binary states", () => {
    const a = render(<DiffViewer path={null} diff={null} {...idle} />);
    expect(a.getByText("Select a file")).toBeTruthy();
    cleanup();
    const b = render(<DiffViewer path="img.png" diff={fileDiff([], { path: "img.png", binary: true })} {...idle} />);
    expect(b.getByText("Binary file")).toBeTruthy();
  });

  it("actions mode: forces unified, hunk buttons, line selection → sticky bar → stage_lines pairs", () => {
    useDiffStore.setState({ view: "split" }); // must be ignored while staging
    const actions: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getAllByRole, queryByRole, getByText, queryByText } = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} actions={actions} />);
    expect(getByRole("button", { name: "Split view" }).hasAttribute("disabled")).toBe(true);
    const rows = Array.from(getByRole("region", { name: "Diff" }).firstElementChild!.children);
    expect(rows).toHaveLength(6); // unified rows despite the stored split preference

    fireEvent.click(getByText("Stage hunk"));
    expect(actions.onStageHunk).toHaveBeenCalledWith(0);
    // No hunk / line Discard exists: the backend has no reverse-apply-to-workdir.
    expect(queryByText("Discard")).toBeNull();

    expect(queryByRole("toolbar", { name: "Selected lines" })).toBeNull();
    fireEvent.click(rows[1]); // context line: ignored
    expect(queryByRole("toolbar", { name: "Selected lines" })).toBeNull();
    fireEvent.click(rows[2]); // del
    fireEvent.click(rows[4], { shiftKey: true }); // range → del + 2 adds
    const bar = getByRole("toolbar", { name: "Selected lines" });
    expect(bar.textContent).toContain("3 lines selected");
    expect(rows[2].getAttribute("aria-selected")).toBe("true");
    expect(rows[3].getAttribute("aria-selected")).toBe("true");
    expect(rows[4].getAttribute("aria-selected")).toBe("true");
    fireEvent.click(rows[3], { ctrlKey: true }); // toggle the middle one off
    expect(getByRole("toolbar", { name: "Selected lines" }).textContent).toContain("2 lines selected");

    fireEvent.click(getAllByRole("button", { name: "Stage 2 lines" })[0]);
    expect(actions.onStageLines).toHaveBeenCalledWith([
      [0, 1],
      [0, 3],
    ]);
  });

  it("actions mode is a listbox of options and can be driven from the keyboard", () => {
    useDiffStore.setState({ view: "unified" });
    const actions: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getAllByRole } = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} actions={actions} />);
    const region = getByRole("region", { name: "Diff" });
    // Only add / del lines are options; the hunk header and context line are presentational.
    const options = getAllByRole("option");
    expect(options).toHaveLength(3);
    // Roving tab stop: the cursor line is the only one Tab can reach.
    expect(options.map((o) => o.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);

    // Space toggles the cursor line, Shift+↓ extends inside the hunk, Enter stages the selection.
    fireEvent.keyDown(region, { key: " " });
    expect(getByRole("toolbar", { name: "Selected lines" }).textContent).toContain("1 line selected");
    fireEvent.keyDown(region, { key: "ArrowDown", shiftKey: true });
    expect(getByRole("toolbar", { name: "Selected lines" }).textContent).toContain("2 lines selected");
    fireEvent.keyDown(region, { key: "Enter" });
    expect(actions.onStageLines).toHaveBeenCalledWith([
      [0, 1],
      [0, 2],
    ]);
  });

  it("the keyboard cursor takes the focus with it, so you can see which line you are on", () => {
    // The cursor is drawn by `.pick:focus-visible`: a cursor the focus does not follow is invisible,
    // and the next Space lands on a line the user has no way of identifying.
    useDiffStore.setState({ view: "unified" });
    const actions: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getAllByRole } = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} actions={actions} />);
    const region = getByRole("region", { name: "Diff" });
    const options = getAllByRole("option");

    // Tabbing in lands on the cursor line itself, not on the region.
    region.focus();
    expect(document.activeElement).toBe(options[0]);

    fireEvent.keyDown(region, { key: "ArrowDown" });

    expect(document.activeElement).toBe(options[1]);
    expect(options.map((o) => o.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
  });

  it("clicking a line moves the cursor there, so the arrows carry on from the mouse", () => {
    useDiffStore.setState({ view: "unified" });
    const actions: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getAllByRole, queryByRole } = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} actions={actions} />);
    const region = getByRole("region", { name: "Diff" });
    const options = getAllByRole("option");

    fireEvent.click(options[2]);
    expect(getByRole("toolbar", { name: "Selected lines" }).textContent).toContain("1 line selected");
    expect(options.map((o) => o.getAttribute("tabindex"))).toEqual(["-1", "-1", "0"]);

    // Space toggles the cursor line: the one just clicked, not the one the cursor started on.
    fireEvent.keyDown(region, { key: " " });
    expect(queryByRole("toolbar", { name: "Selected lines" })).toBeNull();
  });

  it("scrolls back to the top only when the file changes, not when its diff is reloaded", () => {
    useDiffStore.setState({ view: "unified" });
    const big = bigDiff(5_000);
    const { rerender } = render(<DiffViewer path={big.path} diff={big} {...idle} />);
    scrolls.offsets.length = 0;
    // A fresh diff object for the same file (an unrelated `repo://changed`) must keep the position.
    rerender(<DiffViewer path={big.path} diff={{ ...big }} {...idle} />);
    expect(scrolls.offsets).toEqual([]);
    rerender(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} />);
    expect(scrolls.offsets).toEqual([0]);
  });

  it("untracked (whole file): note in the header, no hunk buttons, lines not selectable", () => {
    const actions: DiffActions = { target: "unstaged", wholeFile: true, note: "Untracked — stage whole file", onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getByText, queryByText, queryByRole } = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} actions={actions} />);
    expect(getByText("Untracked — stage whole file")).toBeTruthy();
    expect(queryByText("Stage hunk")).toBeNull();
    const rows = Array.from(getByRole("region", { name: "Diff" }).firstElementChild!.children);
    fireEvent.click(rows[2]);
    expect(queryByRole("toolbar", { name: "Selected lines" })).toBeNull();
  });
});
