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

/** The component is controlled; this owns the value like the dialog / dock do. */
function Harness({ history = [], onSubmit = () => {}, initial = "", disabled = false }: { history?: string[]; onSubmit?: () => void; initial?: string; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <CommandInput aria-label="Git command" placement="down" value={value} onChange={setValue} onSubmit={onSubmit} history={history} refs={REFS} disabled={disabled} />
      <output data-testid="value">{value}</output>
    </>
  );
}

afterEach(cleanup);

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

  it("is quiet while disabled", () => {
    const { getByRole, queryByRole } = render(<Harness initial="sta" disabled />);
    expect((getByRole("combobox") as HTMLInputElement).disabled).toBe(true);
    expect(queryByRole("listbox")).toBeNull();
  });
});
