import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlameHunk, FileContent as FileContentModel } from "../../../api/types";
import { useDialogStore } from "../../../store/dialogStore";
import { useDiffStore } from "../../../store/diffStore";
import { useRepoStore } from "../../../store/repoStore";
import { useToastStore } from "../../../store/toastStore";
import { FileContent } from "./FileContent";

// The gutter's entry points reload the store through `blameAt`, whose reads never answer here: the
// tests wait for the state it sets once the reveal hits, not for the reads.
vi.mock("../../../api/ipc", () => ({
  getChangedFiles: vi.fn(() => new Promise(() => {})),
  listTree: vi.fn(() => new Promise(() => {})),
  readFile: vi.fn(() => new Promise(() => {})),
  getBlame: vi.fn(() => new Promise(() => {})),
  toAppError: (e: unknown) => ({ kind: "unknown", message: String(e) }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn(() => Promise.resolve()) }));

// jsdom neither lays out nor scrolls: give the virtualizer a viewport so it renders rows, and record
// its scroll requests (which then scroll nothing: the rendered window stays at the top).
const scrolls = vi.hoisted(() => ({ offsets: [] as number[], indexes: [] as number[] }));
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
      v.scrollToIndex = (index: number) => scrolls.indexes.push(index);
      return v;
    },
  };
});

afterEach(cleanup);
// The blame state is shared across tests; every one of them states what it is about.
beforeEach(() => {
  useDiffStore.setState({ blame: null, blameOn: false, blameLoading: false, blameError: null, tab: "files", treeSelectedPath: null, repoId: null, target: null, revealLine: null });
  useToastStore.setState({ toasts: [] });
  scrolls.offsets.length = 0;
  scrolls.indexes.length = 0;
});

const content = (over: Partial<FileContentModel> = {}): FileContentModel => ({
  path: "src/a.rs",
  text: "fn main() {\r\n    let a = 1;\n}\n",
  binary: false,
  size: 30,
  truncated: false,
  maxLines: 20_000,
  kind: "blob",
  ...over,
});

const lines = (container: HTMLElement) => Array.from(container.querySelectorAll('[role="region"] > div > div'));

describe("FileContent", () => {
  it("numbers every line from 1 and draws no sign column", () => {
    const { container, getByRole } = render(<FileContent path="src/a.rs" content={content()} loading={false} error={null} />);
    expect(getByRole("region", { name: "File content" })).toBeTruthy();
    // The piece after the file's last newline is the terminator, not a fourth line; a CR shows as ␍.
    expect(lines(container).map((r) => r.textContent)).toEqual(["1fn main() {␍", "2    let a = 1;", "3}"]);
    // Two cells per row: the number and the text. The diff's old / new / sign triple means nothing here.
    expect(lines(container).map((r) => r.childElementCount)).toEqual([2, 2, 2]);
  });

  it("shows nothing for a binary file and banners a truncated one", () => {
    const { container, rerender } = render(<FileContent path="big.bin" content={content({ text: null, binary: true })} loading={false} error={null} />);
    expect(container.textContent).toContain("Binary file");
    expect(lines(container)).toHaveLength(0);

    // The count is the kept lines, not the cap: a byte-capped file stops short of `maxLines`.
    rerender(<FileContent path="long.txt" content={content({ truncated: true })} loading={false} error={null} />);
    expect(container.textContent).toContain("File truncated at 3 lines");
    expect(container.textContent).toContain("first 3 lines");
  });

  it("waits for a selection and reports a failed read", () => {
    const { container, rerender } = render(<FileContent path={null} content={null} loading={false} error={null} />);
    expect(container.textContent).toContain("Select a file");
    rerender(<FileContent path="gone.txt" content={null} loading={false} error="no such file" />);
    expect(container.textContent).toContain("Couldn't load the file");
    expect(container.textContent).toContain("no such file");
  });
});

const hunk = (over: Partial<BlameHunk> = {}): BlameHunk => ({
  start: 1,
  origStart: 1,
  lines: 1,
  oid: "a".repeat(40),
  short: "aaaaaaa",
  author: "Ada",
  time: 1_700_000_000,
  summary: "a change",
  origPath: null,
  uncommitted: false,
  previous: null,
  ...over,
});

describe("FileContent blame gutter", () => {
  const cells = (container: HTMLElement) => Array.from(container.querySelectorAll('[role="img"]'));
  const selected = (container: HTMLElement) => Array.from(container.querySelectorAll('[role="option"]')).map((o) => o.getAttribute("aria-selected"));
  const blamed = () =>
    useDiffStore.setState({
      blameOn: true,
      blame: {
        path: "src/a.rs",
        hunks: [hunk({ start: 1, lines: 2 }), hunk({ start: 3, lines: 1, oid: "b".repeat(40), short: "bbbbbbb", author: "Bo", previous: { oid: "c".repeat(40), path: "old.rs" } })],
      },
    });

  it("carries the label on a hunk's first row and the name on every row", () => {
    blamed();
    const { container } = render(<FileContent path="src/a.rs" content={content()} loading={false} error={null} />);
    // One cell per line, but the label is drawn once per hunk: rows 1 and 3.
    expect(cells(container).map((c) => c.textContent)).toEqual([expect.stringContaining("aaaaaaa Ada"), "", expect.stringContaining("bbbbbbb Bo")]);
    // The accessible name is on every row, so a continuation row still says whose commit it is.
    expect(cells(container).map((c) => c.getAttribute("aria-label"))).toEqual([
      expect.stringContaining("Blame: aaaaaaa Ada"),
      expect.stringContaining("Blame: aaaaaaa Ada"),
      expect.stringContaining("Blame: bbbbbbb Bo"),
    ]);
    // Age tint, newest to oldest, with no per-row tab stop: one roving cursor for the whole list.
    expect(cells(container)[0].getAttribute("style")).toContain("--age: 5");
    expect(container.querySelectorAll('[role="region"] [tabindex="0"]')).toHaveLength(1);
  });

  it("reveals the hunk's commit on a gutter click and says so when the grid cannot", async () => {
    const revealOid = vi.fn(() => Promise.resolve(true));
    useRepoStore.setState({ revealOid });
    blamed();
    const { container } = render(<FileContent path="src/a.rs" content={content()} loading={false} error={null} />);

    // The second row of the first hunk: a continuation row acts on the same commit.
    fireEvent.click(cells(container)[1]);
    // The click reaches the row too: the cursor is on it before the drill-down has done anything.
    expect(selected(container)).toEqual(["false", "true", "false"]);
    await waitFor(() => expect(revealOid).toHaveBeenCalledWith("a".repeat(40)));
    // The reveal moves the grid, and the details pane reloads the store from it: the file is seeded
    // against that commit once the reveal hits, so the drill-down lands on it rather than starting over.
    // `waitFor` reloads until the seed has landed; the seed-after-load order is diffStore.test's.
    await waitFor(() => {
      void useDiffStore.getState().load("r", { kind: "commit", oid: "a".repeat(40) });
      expect(useDiffStore.getState()).toMatchObject({ tab: "files", blameOn: true, treeSelectedPath: "src/a.rs" });
    });

    // A commit the current walk does not hold (a filter, or a `Head`-only spec): a toast, nothing else.
    act(() => blamed()); // the reload dropped the hunks
    revealOid.mockResolvedValue(false);
    fireEvent.click(cells(container)[2]);
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Not in the current view — clear the filter"));
  });

  it("offers the hunk's commit, its parent and its SHA on the row menu", async () => {
    const revealOid = vi.fn(() => Promise.resolve(true));
    useRepoStore.setState({ revealOid });
    blamed();
    const { container, getByRole } = render(<FileContent path="src/a.rs" content={content()} loading={false} error={null} />);
    const labels = (root: HTMLElement) => Array.from(root.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent?.trim());

    // The first hunk is the file's start, so it has no `previous` to blame.
    fireEvent.contextMenu(cells(container)[0], { clientX: 4, clientY: 4 });
    expect(labels(getByRole("menu", { name: "Blame actions" }))).toEqual(["Select in graph", "Blame parent", "History of this file", "Copy SHA"]);
    const dead = getByRole("menuitem", { name: "Blame parent" });
    expect(dead.hasAttribute("disabled")).toBe(true);
    // Why it is dead, on the item and on the `DisabledHint` wrapper that takes the hover a
    // disabled control never gets.
    expect(dead.getAttribute("title")).toBe("This commit is where the file begins");
    expect(dead.closest('[role="none"]')?.getAttribute("title")).toBe("This commit is where the file begins");
    fireEvent.keyDown(getByRole("menu", { name: "Blame actions" }), { key: "Escape" });

    fireEvent.contextMenu(cells(container)[2], { clientX: 4, clientY: 4 });
    const live = getByRole("menuitem", { name: "Blame parent" });
    // A hunk that has a `previous` is a live item with nothing to explain away.
    expect(live.hasAttribute("disabled")).toBe(false);
    expect(live.getAttribute("title")).toBeNull();
    fireEvent.click(live);
    // Porcelain's `previous`: the commit *and* the name the file had there.
    await waitFor(() => expect(revealOid).toHaveBeenCalledWith("c".repeat(40)));
    await waitFor(() => {
      void useDiffStore.getState().load("r", { kind: "commit", oid: "c".repeat(40) });
      expect(useDiffStore.getState().treeSelectedPath).toBe("old.rs");
    });
  });

  it("History of this file filters the walk to the name the hunk's commit knew it by", () => {
    const startLog = vi.fn(() => Promise.resolve());
    useRepoStore.setState({ startLog, spec: { kind: "all" }, filter: {} });
    blamed();
    const { container, getByRole } = render(<FileContent path="src/a.rs" content={content()} loading={false} error={null} />);

    fireEvent.contextMenu(cells(container)[0], { clientX: 4, clientY: 4 });
    fireEvent.click(getByRole("menuitem", { name: "History of this file" }));
    expect(startLog).toHaveBeenCalledWith({ kind: "all" }, { path: "src/a.rs" });
  });

  it("refuses the toggle on a file blame cannot see whole", () => {
    const toggle = (over: Partial<FileContentModel>) => {
      cleanup();
      const { getByRole } = render(<FileContent path="x" content={content(over)} loading={false} error={null} />);
      return getByRole("button", { name: "Blame" });
    };
    expect(toggle({}).hasAttribute("disabled")).toBe(false);
    expect(toggle({ text: null, binary: true }).hasAttribute("disabled")).toBe(true);
    expect(toggle({ truncated: true }).hasAttribute("disabled")).toBe(true);
    expect(toggle({ truncated: true }).getAttribute("title")).toBe("Blame needs the whole file");
  });

  it("holds the gutter back until the text it belongs to has arrived", () => {
    // The store keeps the old file's text while the new one is read, and blame for the new one can
    // land first: painting it would put B's authors on A's lines.
    blamed();
    const { container } = render(<FileContent path="src/b.rs" content={content()} loading={true} error={null} />);
    expect(cells(container)).toHaveLength(0);
  });

  it("names the blamed rows as a list, so the cursor is announced", () => {
    blamed();
    const { getAllByRole, getByRole } = render(<FileContent path="src/a.rs" content={content()} loading={false} error={null} />);
    expect(getByRole("listbox", { name: "Blame" })).toBeTruthy();
    const options = getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
  });

  it("a click on a row's text moves the cursor there, so the arrows carry on from the mouse", () => {
    blamed();
    const { container, getByRole } = render(<FileContent path="src/a.rs" content={content()} loading={false} error={null} />);
    fireEvent.click(lines(container)[2].querySelector(".selectable")!);
    expect(selected(container)).toEqual(["false", "false", "true"]);
    expect(container.querySelector('[role="region"] [tabindex="0"]')).toBe(lines(container)[2]);
    fireEvent.keyDown(getByRole("region", { name: "File content" }), { key: "ArrowUp" });
    expect(selected(container)).toEqual(["false", "true", "false"]);
  });

  it("hands the focus in to the cursor row, and lets Shift+Tab back out past the region", () => {
    blamed();
    const { container, getByRole } = render(<FileContent path="src/a.rs" content={content()} loading={false} error={null} />);
    const region = getByRole("region", { name: "File content" });
    const row = container.querySelector<HTMLElement>("[data-cursor]");

    act(() => region.focus());
    expect(document.activeElement).toBe(row);
    // Shift+Tab off the row lands on the region — an ancestor comes first in tab order — and
    // throwing it straight back in would trap the focus.
    act(() => region.focus());
    expect(document.activeElement).toBe(region);
  });

  it("still lets blame off on a file it cannot see whole", () => {
    // Blame on, then a truncated file selected: a dead toggle would strand it on.
    useDiffStore.setState({ blameOn: true });
    const { getByRole } = render(<FileContent path="long.txt" content={content({ truncated: true })} loading={false} error={null} />);
    const btn = getByRole("button", { name: "Blame" });
    expect(btn.hasAttribute("disabled")).toBe(false);
    expect(btn.getAttribute("title")).toBe("Blame");
    fireEvent.click(btn);
    expect(useDiffStore.getState().blameOn).toBe(false);
  });

  it("draws no gutter while the toggle is off, even with hunks in hand", () => {
    useDiffStore.setState({ blame: { path: "src/a.rs", hunks: [hunk({ start: 1, lines: 3 })] }, blameOn: false });
    const { container, queryByRole } = render(<FileContent path="src/a.rs" content={content()} loading={false} error={null} />);
    expect(cells(container)).toHaveLength(0);
    // Nothing to act on, so the rows are plain lines rather than a list.
    expect(queryByRole("listbox")).toBeNull();
    expect(container.querySelectorAll('[role="region"] [tabindex="0"]')).toHaveLength(0);
    // A click has no cursor to move either.
    fireEvent.click(lines(container)[2].querySelector(".selectable")!);
    expect(container.querySelectorAll('[role="region"] [tabindex="0"]')).toHaveLength(0);
  });
});

describe("FileContent blame drill-down", () => {
  const A = "a".repeat(40);
  const B = "b".repeat(40);
  const C = "c".repeat(40);
  const cells = (container: HTMLElement) => Array.from(container.querySelectorAll('[role="img"]'));
  const cursorRow = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-cursor]");
  const revealLine = () => useDiffStore.getState().revealLine;
  /** The region at a height jsdom doesn't give it (it lays nothing out). */
  const sized = (container: HTMLElement, height: number) => {
    const region = container.querySelector<HTMLElement>('[role="region"]')!;
    Object.defineProperty(region, "clientHeight", { value: height, configurable: true });
    return region;
  };

  describe("from a blamed row", () => {
    beforeEach(() => {
      useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } }, revealOid: vi.fn(() => Promise.resolve(true)) });
      // Both hunks sit elsewhere in their own commits: lines 1–2 were 5–6, line 3 was 9.
      useDiffStore.setState({
        blameOn: true,
        blame: {
          path: "src/a.rs",
          hunks: [hunk({ start: 1, lines: 2, origStart: 5 }), hunk({ start: 3, lines: 1, origStart: 9, oid: B, previous: { oid: C, path: "old.rs" } })],
        },
      });
    });
    afterEach(() => useRepoStore.setState({ repo: null }));

    it("a gutter click carries the repo, the commit, its path and the row's line and height", async () => {
      const { container } = render(<FileContent path="src/a.rs" content={content()} loading={false} error={null} />);
      sized(container, 400);
      fireEvent.click(cells(container)[1]);
      await waitFor(() => expect(revealLine()).toEqual({ repoId: "r", oid: A, path: "src/a.rs", line: 6, y: 20 }));

      // A miss carries nothing.
      useDiffStore.setState({ revealLine: null });
      vi.mocked(useRepoStore.getState().revealOid).mockResolvedValue(false);
      fireEvent.click(cells(container)[2]);
      await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Not in the current view — clear the filter"));
      expect(revealLine()).toBeNull();
    });

    it("a row below the view's bottom lands at the bottom", async () => {
      const { container } = render(<FileContent path="src/a.rs" content={content()} loading={false} error={null} />);
      sized(container, 40); // two rows tall: row 3 (y 40) is below it
      fireEvent.click(cells(container)[2]);
      await waitFor(() => expect(revealLine()).toMatchObject({ line: 9, y: 20 }));
    });

    it("Enter, Select in graph and Blame parent carry their rows", async () => {
      const { container, getByRole } = render(<FileContent path="src/a.rs" content={content()} loading={false} error={null} />);
      const region = sized(container, 400);

      fireEvent.click(lines(container)[2].querySelector(".selectable")!);
      fireEvent.keyDown(region, { key: "Enter" });
      await waitFor(() => expect(revealLine()).toEqual({ repoId: "r", oid: B, path: "src/a.rs", line: 9, y: 40 }));

      fireEvent.contextMenu(cells(container)[0], { clientX: 4, clientY: 4 });
      fireEvent.click(getByRole("menuitem", { name: "Select in graph" }));
      await waitFor(() => expect(revealLine()).toEqual({ repoId: "r", oid: A, path: "src/a.rs", line: 5, y: 0 }));

      // The parent has no such line yet: the hunk's own line, near where it went in.
      fireEvent.contextMenu(cells(container)[2], { clientX: 4, clientY: 4 });
      fireEvent.click(getByRole("menuitem", { name: "Blame parent" }));
      await waitFor(() => expect(revealLine()).toEqual({ repoId: "r", oid: C, path: "old.rs", line: 9, y: 40 }));
    });
  });

  describe("landing", () => {
    const OID = "d".repeat(40);
    const long = content({ text: Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n") + "\n" });
    const blame = { path: "src/a.rs", hunks: [hunk({ start: 1, lines: 60 })] };
    const drilled = (over: { repoId?: string; oid?: string; line?: number } = {}) =>
      useDiffStore.setState({
        repoId: "r",
        target: { kind: "commit", oid: OID },
        blameOn: true,
        revealLine: { repoId: over.repoId ?? "r", oid: over.oid ?? OID, path: "src/a.rs", line: over.line ?? 30, y: 100 },
      });
    // The receiving view's height, read at mount: set on the prototype, since the region doesn't exist yet.
    let viewHeight = 400;
    beforeEach(() => {
      viewHeight = 400;
      Object.defineProperty(HTMLElement.prototype, "clientHeight", { get: () => viewHeight, configurable: true });
    });
    afterEach(() => {
      delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
      useDialogStore.setState({ dialog: null });
    });

    it("starts on the drilled line, at its height, with the focus on it", () => {
      // The mount race: blame and content both ready, so the reveal and the cursor effect run in one
      // commit. The focus went with the remount (`<body>`).
      drilled();
      useDiffStore.setState({ blame });
      const { container } = render(<FileContent path="src/a.rs" content={long} loading={false} error={null} />);
      expect(cursorRow(container)?.dataset.line).toBe("30");
      // (30 − 1) × 20 − 100, and nothing after it: no scroll to the top, no `scrollToIndex`.
      expect(scrolls.offsets).toEqual([480]);
      expect(scrolls.indexes).toEqual([]);
      expect(document.activeElement).toBe(cursorRow(container));
    });

    it("blame arriving after the content takes the focus then", () => {
      drilled();
      const { container } = render(<FileContent path="src/a.rs" content={long} loading={false} error={null} />);
      expect(cursorRow(container)).toBeNull();
      expect(document.activeElement).toBe(document.body);
      act(() => useDiffStore.setState({ blame }));
      expect(cursorRow(container)?.dataset.line).toBe("30");
      expect(document.activeElement).toBe(cursorRow(container));
      expect(scrolls.indexes).toEqual([]);
    });

    it("a view behind an open dialog leaves the focus where the dialog has it", () => {
      drilled();
      useDiffStore.setState({ blame });
      useDialogStore.setState({ dialog: { kind: "commit" } });
      const { container } = render(<FileContent path="src/a.rs" content={long} loading={false} error={null} />);
      expect(cursorRow(container)?.dataset.line).toBe("30");
      expect(document.activeElement).toBe(document.body);
    });

    it("a line past the end lands on the last one", () => {
      // 40 lines: the mocked scroll moves nothing, and the last row must be in the rendered window.
      drilled({ line: 999 });
      useDiffStore.setState({ blame: { path: "src/a.rs", hunks: [hunk({ start: 1, lines: 40 })] } });
      const short = content({ text: Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n") + "\n" });
      const { container } = render(<FileContent path="src/a.rs" content={short} loading={false} error={null} />);
      expect(cursorRow(container)?.dataset.line).toBe("40");
      expect(scrolls.offsets).toEqual([39 * 20 - 100]);
    });

    it("a height past this view's bottom lands on its last whole row", () => {
      // Clicked at y 100 in a taller view; this one is 60 px: the line goes at 60 − 20.
      viewHeight = 60;
      drilled();
      useDiffStore.setState({ blame });
      render(<FileContent path="src/a.rs" content={long} loading={false} error={null} />);
      expect(scrolls.offsets).toEqual([29 * 20 - 40]);
    });

    it("another commit's or another repo's line under the same path is not this view's", () => {
      for (const over of [{ oid: "e".repeat(40) }, { repoId: "other" }]) {
        cleanup();
        scrolls.offsets.length = 0;
        drilled(over);
        useDiffStore.setState({ blame });
        const { container } = render(<FileContent path="src/a.rs" content={long} loading={false} error={null} />);
        expect(cursorRow(container)?.dataset.line).toBe("1");
        expect(scrolls.offsets).toEqual([0]);
      }
    });
  });
});
