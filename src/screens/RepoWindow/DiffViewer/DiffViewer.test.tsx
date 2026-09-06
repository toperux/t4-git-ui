import { act, cleanup, fireEvent, render } from "@testing-library/react";
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

  it("a mode change gets a chip in the header; an unchanged mode gets none", () => {
    const { getByTitle } = render(<DiffViewer path={SMALL.path} diff={{ ...SMALL, oldMode: "100644", newMode: "100755" }} {...idle} />);
    expect(getByTitle("File mode").textContent).toBe("100644 → 100755");
    cleanup();
    const same = render(<DiffViewer path={SMALL.path} diff={{ ...SMALL, oldMode: "100644", newMode: "100644" }} {...idle} />);
    expect(same.queryByTitle("File mode")).toBeNull();
    cleanup();
    const none = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} />);
    expect(none.queryByTitle("File mode")).toBeNull();
  });

  it("an added or deleted file gets a one-sided chip — the only place its exec bit shows", () => {
    const added = render(<DiffViewer path={SMALL.path} diff={{ ...SMALL, status: "added", newMode: "100755" }} {...idle} />);
    expect(added.getByTitle("File mode").textContent).toBe("→ 100755");
    cleanup();
    const deleted = render(<DiffViewer path={SMALL.path} diff={{ ...SMALL, status: "deleted", oldMode: "120000" }} {...idle} />);
    expect(deleted.getByTitle("File mode").textContent).toBe("120000 →");
    cleanup();
    // An ordinary new file has nothing to say.
    const plain = render(<DiffViewer path={SMALL.path} diff={{ ...SMALL, status: "added", newMode: "100644" }} {...idle} />);
    expect(plain.queryByTitle("File mode")).toBeNull();
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
    // No discard callbacks (a staged diff edits the index): no Discard buttons either.
    expect(queryByText("Discard hunk")).toBeNull();

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

    expect(queryByRole("button", { name: "Discard 2 lines" })).toBeNull();
    fireEvent.click(getAllByRole("button", { name: "Stage 2 lines" })[0]);
    expect(actions.onStageLines).toHaveBeenCalledWith([
      [0, 1],
      [0, 3],
    ]);
  });

  it("the discard buttons only exist when the callbacks do, and Delete discards the selection", () => {
    useDiffStore.setState({ view: "unified" });
    const actions: DiffActions = {
      target: "unstaged",
      wholeFile: false,
      onStageHunk: vi.fn(),
      onStageLines: vi.fn(),
      onDiscardHunk: vi.fn(),
      onDiscardLines: vi.fn(),
    };
    const { getByRole } = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} actions={actions} />);
    fireEvent.click(getByRole("button", { name: "Discard hunk" }));
    expect(actions.onDiscardHunk).toHaveBeenCalledWith(0);

    const region = getByRole("region", { name: "Diff" });
    const rows = Array.from(region.firstElementChild!.children);
    fireEvent.click(rows[2]); // del
    fireEvent.click(getByRole("button", { name: "Discard 1 line" }));
    expect(actions.onDiscardLines).toHaveBeenCalledWith([[0, 1]]);

    // Delete is the keyboard half of that button, the way Enter is of "Stage lines".
    fireEvent.keyDown(region, { key: "Delete" });
    expect(actions.onDiscardLines).toHaveBeenCalledTimes(2);
    expect(actions.onStageLines).not.toHaveBeenCalled();
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

  it("Shift+↑/↓ stops at the hunk edge instead of restarting the selection in the next hunk", () => {
    useDiffStore.setState({ view: "unified" });
    const two = fileDiff(
      [
        hunk("@@ -1,2 +1,2 @@", [line("del", 1, null, "a"), line("add", null, 1, "A")]),
        hunk("@@ -9,2 +9,2 @@", [line("del", 9, null, "b"), line("add", null, 9, "B")]),
      ],
      { path: "two.txt" },
    );
    const actions: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getAllByRole } = render(<DiffViewer path={two.path} diff={two} {...idle} actions={actions} />);
    const region = getByRole("region", { name: "Diff" });
    const options = getAllByRole("option");
    fireEvent.click(options[2]); // the del of the second hunk — its first pick

    // Shift+↑ would leave the hunk: the cursor stays put and the selection is untouched.
    fireEvent.keyDown(region, { key: "ArrowUp", shiftKey: true });
    expect(options.map((o) => o.getAttribute("tabindex"))).toEqual(["-1", "-1", "0", "-1"]);
    expect(getByRole("toolbar", { name: "Selected lines" }).textContent).toContain("1 line selected");
    // Shift+↓ inside the hunk still extends.
    fireEvent.keyDown(region, { key: "ArrowDown", shiftKey: true });
    expect(getByRole("toolbar", { name: "Selected lines" }).textContent).toContain("2 lines selected");
    // Shift+↓ at the last pick of the last hunk is a no-op too.
    fireEvent.keyDown(region, { key: "ArrowDown", shiftKey: true });
    expect(options.map((o) => o.getAttribute("tabindex"))).toEqual(["-1", "-1", "-1", "0"]);

    // Without Shift the cursor crosses hunks as before.
    fireEvent.keyDown(region, { key: "ArrowUp" });
    fireEvent.keyDown(region, { key: "ArrowUp" });
    expect(options.map((o) => o.getAttribute("tabindex"))).toEqual(["-1", "0", "-1", "-1"]);
  });

  it("Shift+↓ after the cursor crossed a hunk extends from it, instead of collapsing to one line", () => {
    useDiffStore.setState({ view: "unified" });
    const two = fileDiff(
      [
        hunk("@@ -1,2 +1,2 @@", [line("del", 1, null, "a"), line("add", null, 1, "A")]),
        hunk("@@ -9,2 +9,2 @@", [line("del", 9, null, "b"), line("add", null, 9, "B")]),
      ],
      { path: "two.txt" },
    );
    const actions: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getAllByRole } = render(<DiffViewer path={two.path} diff={two} {...idle} actions={actions} />);
    const region = getByRole("region", { name: "Diff" });
    const options = getAllByRole("option");

    fireEvent.click(options[0]);
    fireEvent.keyDown(region, { key: "ArrowDown", shiftKey: true });
    expect(getByRole("toolbar", { name: "Selected lines" }).textContent).toContain("2 lines selected");
    // Plain ↓ crosses into the second hunk and leaves the anchor behind in the first.
    fireEvent.keyDown(region, { key: "ArrowDown" });
    expect(options.map((o) => o.getAttribute("tabindex"))).toEqual(["-1", "-1", "0", "-1"]);
    // The anchor is re-seeded at the cursor: a range in the new hunk, never a single line.
    fireEvent.keyDown(region, { key: "ArrowDown", shiftKey: true });
    expect(getByRole("toolbar", { name: "Selected lines" }).textContent).toContain("2 lines selected");
    fireEvent.keyDown(region, { key: "Enter" });
    expect(actions.onStageLines).toHaveBeenCalledWith([
      [1, 0],
      [1, 1],
    ]);
  });

  it("an idle focus is left alone: only a loss the diff caused is repaired", async () => {
    useDiffStore.setState({ view: "unified" });
    const actions: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getAllByRole, rerender } = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} actions={actions} />);
    const region = getByRole("region", { name: "Diff" });

    // Clicking the header or the path blurs to `<body>` with no `relatedTarget`; the row is still
    // there, so the loss is not the diff's to repair and an unrelated reload must leave it alone.
    region.focus();
    (document.activeElement as HTMLElement).blur();
    await act(async () => {});
    rerender(<DiffViewer path={SMALL.path} diff={{ ...SMALL }} {...idle} actions={actions} />);
    expect(document.activeElement).toBe(document.body);

    // Same for a focus that moved to something outside the diff.
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    region.focus();
    expect(document.activeElement).toBe(getAllByRole("option")[0]);
    outside.focus();
    await act(async () => {});
    rerender(<DiffViewer path={SMALL.path} diff={{ ...SMALL }} {...idle} actions={actions} />);
    expect(document.activeElement).toBe(outside);
    outside.remove();
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

  it("staging one hunk keeps the selection in the hunks that survive the reload", () => {
    useDiffStore.setState({ view: "unified" });
    const two = fileDiff(
      [
        hunk("@@ -1,2 +1,2 @@", [line("del", 1, null, "a"), line("add", null, 1, "A")]),
        hunk("@@ -9,2 +9,2 @@", [line("del", 9, null, "b"), line("add", null, 9, "B")]),
      ],
      { path: "two.txt" },
    );
    const actions: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getAllByRole, rerender } = render(<DiffViewer path={two.path} diff={two} {...idle} actions={actions} />);
    fireEvent.click(getAllByRole("option")[3]); // the add in the second hunk
    expect(getByRole("toolbar", { name: "Selected lines" }).textContent).toContain("1 line selected");

    // The first hunk was staged: the same file reloads without it, and the selection moves with its hunk.
    const staged = fileDiff([two.hunks[1]], { path: "two.txt" });
    rerender(<DiffViewer path={staged.path} diff={staged} {...idle} actions={actions} />);
    const left = getAllByRole("option");
    expect(left).toHaveLength(2);
    expect(left.map((o) => o.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    fireEvent.click(getByRole("button", { name: "Stage 1 line" }));
    expect(actions.onStageLines).toHaveBeenCalledWith([[0, 1]]);
  });

  it("the same path in the other list is a different diff: nothing carries over into it", () => {
    useDiffStore.setState({ view: "unified" });
    const unstaged: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getAllByRole, queryByRole, rerender } = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} actions={unstaged} />);
    fireEvent.click(getAllByRole("option")[2]); // the last pick
    expect(getByRole("toolbar", { name: "Selected lines" }).textContent).toContain("1 line selected");

    // Clicking the same file in the Staged list: same path, another diff.
    rerender(<DiffViewer path={SMALL.path} diff={{ ...SMALL }} {...idle} actions={{ ...unstaged, target: "staged" }} />);
    expect(queryByRole("toolbar", { name: "Selected lines" })).toBeNull();
    expect(getAllByRole("option").map((o) => o.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("a reload that ends shorter than the cursor leaves it on the last pick", () => {
    useDiffStore.setState({ view: "unified" });
    const two = fileDiff(
      [
        hunk("@@ -1,2 +1,2 @@", [line("del", 1, null, "a"), line("add", null, 1, "A")]),
        hunk("@@ -9,3 +9,3 @@", [line("del", 9, null, "b"), line("add", null, 9, "B"), line("add", null, 10, "C")]),
      ],
      { path: "two.txt" },
    );
    const actions: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getAllByRole, rerender } = render(<DiffViewer path={two.path} diff={two} {...idle} actions={actions} />);
    fireEvent.click(getAllByRole("option")[4]); // the last pick of the second hunk

    // That whole hunk is staged: `carryRef` has nowhere to put the cursor and `picks` is shorter than it.
    const staged = fileDiff([two.hunks[0]], { path: "two.txt" });
    rerender(<DiffViewer path={staged.path} diff={staged} {...idle} actions={actions} />);
    const left = getAllByRole("option");
    expect(left.map((o) => o.getAttribute("tabindex"))).toEqual(["-1", "0"]);
    fireEvent.keyDown(getByRole("region", { name: "Diff" }), { key: " " });
    fireEvent.keyDown(getByRole("region", { name: "Diff" }), { key: "Enter" });
    expect(actions.onStageLines).toHaveBeenCalledWith([[0, 1]]);
  });

  it("staging a hunk above the cursor moves the cursor with its line, not down by the picks it lost", () => {
    useDiffStore.setState({ view: "unified" });
    const two = fileDiff(
      [
        hunk("@@ -1,2 +1,2 @@", [line("del", 1, null, "a"), line("add", null, 1, "A")]),
        hunk("@@ -9,3 +9,3 @@", [line("del", 9, null, "b"), line("add", null, 9, "B"), line("add", null, 10, "C")]),
      ],
      { path: "two.txt" },
    );
    const actions: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getAllByRole, rerender } = render(<DiffViewer path={two.path} diff={two} {...idle} actions={actions} />);
    fireEvent.click(getAllByRole("option")[2]); // the del in the second hunk: cursor 2 of 5 picks

    // The first hunk was staged, so two picks above the cursor are gone: the same index would now
    // name a line two further down (and scroll there). ↓ then Space must land on the line after it.
    const staged = fileDiff([two.hunks[1]], { path: "two.txt" });
    rerender(<DiffViewer path={staged.path} diff={staged} {...idle} actions={actions} />);
    const region = getByRole("region", { name: "Diff" });
    fireEvent.keyDown(region, { key: "ArrowDown" });
    fireEvent.keyDown(region, { key: " " });
    fireEvent.click(getByRole("button", { name: "Stage 2 lines" }));
    expect(actions.onStageLines).toHaveBeenCalledWith([
      [0, 0],
      [0, 1],
    ]);
  });

  it("Enter stages the selection and the reloaded diff takes the focus back from <body>", () => {
    useDiffStore.setState({ view: "unified" });
    const two = fileDiff(
      [
        hunk("@@ -1,2 +1,2 @@", [line("del", 1, null, "a"), line("add", null, 1, "A")]),
        hunk("@@ -9,3 +9,3 @@", [line("del", 9, null, "b"), line("add", null, 9, "B"), line("add", null, 10, "C")]),
      ],
      { path: "two.txt" },
    );
    const actions: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole, getAllByRole, rerender } = render(<DiffViewer path={two.path} diff={two} {...idle} actions={actions} />);
    const region = getByRole("region", { name: "Diff" });

    // Cursor on the last pick — the row the shorter reload will not have.
    region.focus();
    for (let i = 0; i < 4; i++) fireEvent.keyDown(region, { key: "ArrowDown" });
    fireEvent.keyDown(region, { key: " " });
    expect(document.activeElement).toBe(getAllByRole("option")[4]);
    fireEvent.keyDown(region, { key: "Enter" });
    expect(actions.onStageLines).toHaveBeenCalledWith([[1, 2]]);

    // The staged line is gone from the reload, and so is the row that held the focus.
    const staged = fileDiff([two.hunks[0], hunk("@@ -9,3 +9,3 @@", two.hunks[1].lines.slice(0, 2))], { path: "two.txt" });
    rerender(<DiffViewer path={staged.path} diff={staged} {...idle} actions={actions} />);
    expect(document.activeElement).toBe(getAllByRole("option")[3]);
  });

  it("Stage hunk moves the cursor onto the hunk, so the reload refocuses there and not the top of the file", () => {
    useDiffStore.setState({ view: "unified" });
    const three = fileDiff(
      [
        hunk("@@ -1,2 +1,2 @@", [line("del", 1, null, "a"), line("add", null, 1, "A")]),
        hunk("@@ -9,2 +9,2 @@", [line("del", 9, null, "b"), line("add", null, 9, "B")]),
        hunk("@@ -20,2 +20,2 @@", [line("del", 20, null, "c"), line("add", null, 20, "C")]),
      ],
      { path: "three.txt" },
    );
    const actions: DiffActions = { target: "unstaged", wholeFile: false, onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getAllByRole, getAllByText, rerender } = render(<DiffViewer path={three.path} diff={three} {...idle} actions={actions} />);

    // jsdom's click does not focus: the real button would hold the focus it is about to lose.
    const button = getAllByText("Stage hunk")[1];
    button.focus();
    fireEvent.click(button);
    expect(actions.onStageHunk).toHaveBeenCalledWith(1);

    const staged = fileDiff([three.hunks[0], three.hunks[2]], { path: "three.txt" });
    rerender(<DiffViewer path={staged.path} diff={staged} {...idle} actions={actions} />);
    // The cursor sat on the staged hunk's first pick; the third hunk's del took its place.
    expect(document.activeElement).toBe(getAllByRole("option")[2]);
  });

  it("a conflict offers to keep either side, named the way the backend labelled them", () => {
    const onKeepSide = vi.fn();
    const actions: DiffActions = {
      target: "unstaged",
      wholeFile: true,
      sides: { ours: "main", theirs: "feature" },
      onKeepSide,
      onResolve: vi.fn(),
      onStageHunk: vi.fn(),
      onStageLines: vi.fn(),
    };
    const { getByRole } = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} actions={actions} />);
    // The names come from `sides`; the title repeats the label (it is ellipsized) and says which git flag it is.
    expect(getByRole("button", { name: "Keep main's version" }).getAttribute("title")).toBe("Keep main's version (git checkout --ours)");
    expect(getByRole("button", { name: "Keep feature's version" }).getAttribute("title")).toBe("Keep feature's version (git checkout --theirs)");
    fireEvent.click(getByRole("button", { name: "Keep feature's version" }));
    expect(onKeepSide).toHaveBeenCalledWith("theirs");
  });

  it("without named sides the buttons fall back to git's own words, not 'our's'", () => {
    // A snapshot from before the backend named the sides, or an operation whose sides it can't tell apart.
    const actions: DiffActions = { target: "unstaged", wholeFile: true, onKeepSide: vi.fn(), onStageHunk: vi.fn(), onStageLines: vi.fn() };
    const { getByRole } = render(<DiffViewer path={SMALL.path} diff={SMALL} {...idle} actions={actions} />);
    expect(getByRole("button", { name: "Keep our version" })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Keep their version" }));
    expect(actions.onKeepSide).toHaveBeenCalledWith("theirs");
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
