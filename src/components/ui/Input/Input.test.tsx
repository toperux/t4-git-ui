import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select } from "./Input";

afterEach(cleanup);

function Harness({ onChange = () => {} }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("origin");
  return (
    <Select
      aria-label="Remote"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange(e.target.value);
      }}
    >
      <option value="">All remotes</option>
      <option value="origin">origin</option>
      <option value="upstream">upstream</option>
    </Select>
  );
}

function Actions({ onChange = () => {} }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("pick");
  return (
    <Select
      aria-label="Action"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange(e.target.value);
      }}
    >
      <option value="pick">pick</option>
      <option value="squash" disabled title="No commit above to squash into">
        squash
      </option>
      <option value="drop">drop</option>
    </Select>
  );
}

describe("Select", () => {
  it("shows the selected option and opens the list on click", () => {
    const { getByRole, queryByRole, getAllByRole } = render(<Harness />);
    const combo = getByRole("combobox", { name: "Remote" });
    expect(combo.textContent).toBe("origin");
    expect(queryByRole("listbox")).toBeNull();

    fireEvent.click(combo);
    expect(combo.getAttribute("aria-expanded")).toBe("true");
    expect(getAllByRole("option").map((o) => o.textContent)).toEqual(["All remotes", "origin", "upstream"]);
    // The current value is the active option, not the first row.
    expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[1].id);
  });

  it("picks with the mouse", () => {
    const onChange = vi.fn();
    const { getByRole, queryByRole } = render(<Harness onChange={onChange} />);
    fireEvent.click(getByRole("combobox", { name: "Remote" }));
    fireEvent.click(getByRole("option", { name: "upstream" }));
    expect(onChange).toHaveBeenCalledWith("upstream");
    expect(queryByRole("listbox")).toBeNull();
    expect(getByRole("combobox", { name: "Remote" }).textContent).toBe("upstream");
  });

  it("picks with the keyboard, and Escape closes without changing the value", () => {
    const onChange = vi.fn();
    const { getByRole, queryByRole } = render(<Harness onChange={onChange} />);
    const combo = getByRole("combobox", { name: "Remote" });

    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.keyDown(combo, { key: "Escape" });
    expect(queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.keyDown(combo, { key: "ArrowUp" });
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("Alt+↓ opens the list and Alt+↑ commits the active option; any other Alt chord is left to the surrounding app", () => {
    const onChange = vi.fn();
    const { getByRole, queryByRole, getAllByRole } = render(<Harness onChange={onChange} />);
    const combo = getByRole("combobox", { name: "Remote" });
    fireEvent.keyDown(combo, { key: "ArrowDown", altKey: true });
    expect(getAllByRole("option")).toHaveLength(3);

    // Alt+↓ again neither moves the active option — only ↓ on its own does — nor toggles the list shut.
    const active = combo.getAttribute("aria-activedescendant");
    fireEvent.keyDown(combo, { key: "ArrowDown", altKey: true });
    expect(combo.getAttribute("aria-activedescendant")).toBe(active);
    expect(queryByRole("listbox")).not.toBeNull();

    // Alt+↑ closes the list on the active option, as a native select does.
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.keyDown(combo, { key: "ArrowUp", altKey: true });
    expect(onChange).toHaveBeenCalledWith("upstream");
    expect(queryByRole("listbox")).toBeNull();

    fireEvent.keyDown(combo, { key: "Enter", altKey: true });
    expect(queryByRole("listbox")).toBeNull();
  });

  it("stays open when its own list scrolls", () => {
    const { getByRole, queryByRole } = render(
      <Select aria-label="Commit" value="c0" onChange={() => {}}>
        {Array.from({ length: 40 }, (_, i) => (
          <option key={i} value={`c${i}`}>{`commit ${i}`}</option>
        ))}
      </Select>,
    );
    fireEvent.click(getByRole("combobox", { name: "Commit" }));
    fireEvent.scroll(getByRole("listbox"));
    expect(queryByRole("listbox")).not.toBeNull();

    // A scroll anywhere else still closes it: the list is placed once, from the field's rect.
    fireEvent.scroll(document);
    expect(queryByRole("listbox")).toBeNull();
  });

  it("↑/↓ step over an option that cannot be picked", () => {
    const onChange = vi.fn();
    const { getByRole, queryByRole, getAllByRole } = render(<Actions onChange={onChange} />);
    const combo = getByRole("combobox", { name: "Action" });
    fireEvent.click(combo);

    fireEvent.keyDown(combo, { key: "ArrowDown" });
    expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[2].id);
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("drop");
    expect(queryByRole("listbox")).toBeNull();
  });

  it("opens on the nearest option it can pick when the selected one is a trailing dead row", () => {
    // The Merge / Rebase / Create branch dialogs append the ref they were opened for once it is
    // gone: last row, disabled, and the selected one. Landing the active option there would swallow
    // ↓ and Enter without even closing the list.
    const onChange = vi.fn();
    const { getByRole, getAllByRole, queryByRole } = render(
      <Select aria-label="Branch" value="gone" onChange={(e) => onChange(e.target.value)}>
        <option value="main">main</option>
        <option value="dev">dev</option>
        <option value="gone" disabled title="No longer exists">
          gone (no longer exists)
        </option>
      </Select>,
    );
    const combo = getByRole("combobox", { name: "Branch" });
    fireEvent.click(combo);
    const opts = getAllByRole("option");
    expect(combo.getAttribute("aria-activedescendant")).toBe(opts[1].id);

    // Nothing below it can be picked, so ↓ stays put — and Enter commits it and closes.
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    expect(combo.getAttribute("aria-activedescendant")).toBe(opts[1].id);
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("dev");
    expect(queryByRole("listbox")).toBeNull();
  });

  it("names no active option when the list is empty", () => {
    const { getByRole } = render(
      <Select aria-label="Remote" value="" onChange={() => {}}>
        {null}
      </Select>,
    );
    const combo = getByRole("combobox", { name: "Remote" });
    fireEvent.click(combo);
    fireEvent.keyDown(combo, { key: "End" });
    // There is no row to point at: an id of one that does not exist is worse than none.
    expect(combo.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("Alt+↑ does not commit an option the pointer swept over but cannot be picked", () => {
    const onChange = vi.fn();
    const { getByRole, queryByRole } = render(<Actions onChange={onChange} />);
    const combo = getByRole("combobox", { name: "Action" });
    fireEvent.click(combo);

    fireEvent.mouseMove(getByRole("option", { name: "squash" }));
    fireEvent.keyDown(combo, { key: "ArrowUp", altKey: true });
    // The active option stayed on `pick` (the value already held), so the chord closes and commits nothing.
    expect(onChange).not.toHaveBeenCalled();
    expect(queryByRole("listbox")).toBeNull();
  });

  it("closes when the trigger loses focus", () => {
    const { getByRole, queryByRole } = render(<Harness />);
    fireEvent.click(getByRole("combobox", { name: "Remote" }));
    fireEvent.blur(getByRole("combobox", { name: "Remote" }));
    expect(queryByRole("listbox")).toBeNull();
  });
});
