import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlameHunk, FileContent as FileContentModel } from "../../../api/types";
import { useDiffStore } from "../../../store/diffStore";
import { useRepoStore } from "../../../store/repoStore";
import { useToastStore } from "../../../store/toastStore";
import { FileContent } from "./FileContent";

// The gutter's entry points reload the store through `blameAt`; nothing here waits for them.
vi.mock("../../../api/ipc", () => ({
  getChangedFiles: vi.fn(() => new Promise(() => {})),
  listTree: vi.fn(() => new Promise(() => {})),
  readFile: vi.fn(() => new Promise(() => {})),
  getBlame: vi.fn(() => new Promise(() => {})),
  toAppError: (e: unknown) => ({ kind: "unknown", message: String(e) }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn(() => Promise.resolve()) }));

// jsdom neither lays out nor scrolls: give the virtualizer a viewport so it renders rows.
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
// The blame state is shared across tests; every one of them states what it is about.
beforeEach(() => {
  useDiffStore.setState({ blame: null, blameOn: false, blameLoading: false, blameError: null, tab: "files", treeSelectedPath: null });
  useToastStore.setState({ toasts: [] });
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
    await waitFor(() => expect(revealOid).toHaveBeenCalledWith("a".repeat(40)));
    expect(useDiffStore.getState()).toMatchObject({ tab: "files", blameOn: true });
    // The reveal moves the grid, and the details pane reloads the store from it: the file was
    // seeded against that commit, so the drill-down lands on it rather than starting over.
    void useDiffStore.getState().load("r", { kind: "commit", oid: "a".repeat(40) });
    expect(useDiffStore.getState().treeSelectedPath).toBe("src/a.rs");

    // A commit the current walk does not hold (a filter, or a `Head`-only spec): a toast, nothing else.
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
    expect(labels(getByRole("menu", { name: "Blame actions" }))).toEqual(["Select in graph", "Blame parent", "Copy SHA"]);
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
    void useDiffStore.getState().load("r", { kind: "commit", oid: "c".repeat(40) });
    expect(useDiffStore.getState().treeSelectedPath).toBe("old.rs");
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
  });
});
