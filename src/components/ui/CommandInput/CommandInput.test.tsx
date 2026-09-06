import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot } from "../../../api/types";
import { CommandInput } from "./CommandInput";

const REFS: RefsSnapshot = {
  head: { oid: "a", branch: "main", detached: false },
  state: "clean",
  local: [{ name: "main", oid: "a", upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead: true }],
  remotes: [],
  tags: [],
  stashes: [],
};

interface HarnessProps {
  history?: string[];
  onSubmit?: () => void;
  initial?: string;
  disabled?: boolean;
  refs?: RefsSnapshot;
  placement?: "up" | "down";
  /** The dock clears the line once it runs. */
  clearOnSubmit?: boolean;
}

/** The component is controlled; this owns the value like the dialog / dock do. */
function Harness({ history = [], onSubmit = () => {}, initial = "", disabled = false, refs = REFS, placement = "down", clearOnSubmit = false }: HarnessProps) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <CommandInput
        aria-label="Git command"
        placement={placement}
        value={value}
        onChange={setValue}
        onSubmit={() => {
          onSubmit();
          if (clearOnSubmit) setValue("");
        }}
        history={history}
        refs={refs}
        disabled={disabled}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const key = (el: Element, key: string) => fireEvent.keyDown(el, { key });

describe("CommandInput", () => {
  it("lists completions with hints once something is typed", () => {
    const { getByRole, queryByRole, getAllByRole } = render(<Harness />);
    const input = getByRole("combobox");
    expect(queryByRole("listbox")).toBeNull();
    fireEvent.change(input, { target: { value: "sta" } });
    expect(getAllByRole("option").map((o) => o.textContent)).toEqual(["statusWorking tree status", "stashShelve changes"]);
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  it("↓ + Enter accepts a row and appends a space; Enter with no highlight submits", () => {
    const onSubmit = vi.fn();
    const { getByRole, getByTestId, getAllByRole } = render(<Harness onSubmit={onSubmit} />);
    const input = getByRole("combobox");
    fireEvent.change(input, { target: { value: "sta" } });
    key(input, "ArrowDown");
    expect(getAllByRole("option")[0].getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[0].id);
    key(input, "Enter");
    expect(getByTestId("value").textContent).toBe("status ");
    expect(onSubmit).not.toHaveBeenCalled();
    key(input, "Enter");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Tab takes the first row and stays in the field", () => {
    const { getByRole, getByTestId } = render(<Harness />);
    const input = getByRole("combobox");
    fireEvent.change(input, { target: { value: "checkout ma" } });
    // `fireEvent` returns false when the default was prevented — focus stays put.
    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(false);
    expect(getByTestId("value").textContent).toBe("checkout main ");
    // Nothing to complete: Tab is the browser's again.
    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(true);
  });

  it("Tab on a history row completes the line with a trailing space too", () => {
    const { getByRole, getByTestId, getAllByRole } = render(<Harness history={["status"]} />);
    const input = getByRole("combobox");
    fireEvent.change(input, { target: { value: "sta" } });
    // The history row leads the list, so Tab takes it.
    expect(getAllByRole("option")[0].textContent).toBe("statushistory");
    key(input, "Tab");
    expect(getByTestId("value").textContent).toBe("status ");
  });

  it("a click accepts a row, and pressing the mouse on the list does not blur the field", () => {
    const { getByRole, getByTestId, getAllByRole } = render(<Harness />);
    const input = getByRole("combobox");
    fireEvent.change(input, { target: { value: "sta" } });
    expect(fireEvent.mouseDown(getByRole("listbox"))).toBe(false);
    fireEvent.mouseUp(getAllByRole("option")[1]);
    fireEvent.click(getAllByRole("option")[1]);
    expect(getByTestId("value").textContent).toBe("stash ");
  });

  it("completes the word at the caret and keeps what follows it, caret after the inserted word", () => {
    const { getByRole, getByTestId, getAllByRole } = render(<Harness initial="checkout main" />);
    const input = getByRole("combobox") as HTMLInputElement;
    // A click after `che`: the caret lands, the mouse comes up, React reports the selection.
    input.focus();
    input.setSelectionRange(3, 3);
    fireEvent.mouseUp(input);
    expect(getAllByRole("option").map((o) => o.firstChild?.textContent)).toEqual(["checkout", "cherry-pick"]);
    key(input, "Tab");
    expect(getByTestId("value").textContent).toBe("checkout ckout main");
    expect(input.selectionStart).toBe(9);
  });

  it("↑ on an empty field recalls history newest first; ↓ returns to what was typed", () => {
    const { getByRole, getByTestId, queryByRole } = render(<Harness history={["log --oneline", "status"]} initial="dra" />);
    const input = getByRole("combobox");
    key(input, "Escape");
    key(input, "ArrowUp");
    expect(getByTestId("value").textContent).toBe("log --oneline");
    // Recalled text is shown as is, not turned into a list.
    expect(queryByRole("listbox")).toBeNull();
    key(input, "ArrowUp");
    expect(getByTestId("value").textContent).toBe("status");
    key(input, "ArrowUp");
    expect(getByTestId("value").textContent).toBe("status");
    key(input, "ArrowDown");
    key(input, "ArrowDown");
    expect(getByTestId("value").textContent).toBe("dra");
  });

  it("starts the walk over after a submit, so ↑ recalls the line just run (as a shell does)", () => {
    const { getByRole, getByTestId } = render(<Harness history={["status", "log"]} clearOnSubmit />);
    const input = getByRole("combobox");
    key(input, "ArrowUp");
    expect(getByTestId("value").textContent).toBe("status");
    key(input, "Enter");
    expect(getByTestId("value").textContent).toBe("");
    key(input, "ArrowUp");
    expect(getByTestId("value").textContent).toBe("status");
  });

  it("Escape closes the list, keeps the text, and does not reach the dialog behind", () => {
    const outer = vi.fn();
    const { getByRole, queryByRole, getByTestId } = render(
      <div onKeyDown={outer}>
        <Harness />
      </div>,
    );
    const input = getByRole("combobox");
    fireEvent.change(input, { target: { value: "sta" } });
    key(input, "Escape");
    expect(queryByRole("listbox")).toBeNull();
    expect(getByTestId("value").textContent).toBe("sta");
    expect(outer).not.toHaveBeenCalled();
    // With the list closed, Escape is the dialog's.
    key(input, "Escape");
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("closes on blur and on a scroll outside the list; a scroll inside it is fine", () => {
    const { getByRole, queryByRole } = render(<Harness />);
    const input = getByRole("combobox");
    fireEvent.change(input, { target: { value: "sta" } });
    fireEvent.scroll(getByRole("listbox"));
    expect(queryByRole("listbox")).not.toBeNull();
    fireEvent.scroll(document.body);
    expect(queryByRole("listbox")).toBeNull();
    fireEvent.change(input, { target: { value: "stas" } });
    expect(queryByRole("listbox")).not.toBeNull();
    fireEvent.blur(input);
    expect(queryByRole("listbox")).toBeNull();
  });

  it("opens above the field with placement up, below it with down", () => {
    const rect = (o: Partial<DOMRect>) => ({ x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON() {}, ...o }) as DOMRect;
    // jsdom has no layout: the field sits at 300–320, the list is 100 tall.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "LABEL" ? rect({ top: 300, bottom: 320, left: 10, width: 200 }) : rect({ height: 100 });
    });
    for (const [placement, top] of [
      ["up", "196px"],
      ["down", "324px"],
    ] as const) {
      const { getByRole, unmount } = render(<Harness placement={placement} />);
      fireEvent.change(getByRole("combobox"), { target: { value: "sta" } });
      const { style } = getByRole("listbox") as HTMLElement;
      expect([style.top, style.left, style.width]).toEqual([top, "10px", "200px"]);
      unmount();
    }
  });

  it("placement up with no headroom opens down instead of covering the field", () => {
    const rect = (o: Partial<DOMRect>) => ({ x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON() {}, ...o }) as DOMRect;
    // The field sits 40px down a 600px window, the list is 328 tall: nothing like it fits above.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "LABEL" ? rect({ top: 40, bottom: 60, left: 10, width: 200 }) : rect({ height: 328 });
    });
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(600);
    const { getByRole } = render(<Harness placement="up" />);
    fireEvent.change(getByRole("combobox"), { target: { value: "sta" } });
    const { style } = getByRole("listbox") as HTMLElement;
    expect([style.top, style.maxHeight]).toEqual(["64px", "328px"]);
  });

  it("gives a local branch and a remote of the same name their own rows (no duplicate keys)", () => {
    const refs: RefsSnapshot = {
      ...REFS,
      local: [...REFS.local, { ...REFS.local[0], name: "upstream", isHead: false }],
      remotes: [{ name: "upstream", url: null, branches: [] }],
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getByRole, getAllByRole } = render(<Harness refs={refs} />);
    fireEvent.change(getByRole("combobox"), { target: { value: "checkout up" } });
    expect(getAllByRole("option").map((o) => o.textContent)).toEqual(["upstreambranch", "upstreamremote"]);
    expect(error).not.toHaveBeenCalled();
  });

  it("is quiet while disabled", () => {
    const { getByRole, queryByRole } = render(<Harness initial="sta" disabled />);
    expect((getByRole("combobox") as HTMLInputElement).disabled).toBe(true);
    expect(queryByRole("listbox")).toBeNull();
  });
});
