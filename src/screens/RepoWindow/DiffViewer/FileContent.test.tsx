import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileContent as FileContentModel } from "../../../api/types";
import { FileContent } from "./FileContent";

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
