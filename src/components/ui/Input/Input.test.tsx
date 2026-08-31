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

  it("closes when the trigger loses focus", () => {
    const { getByRole, queryByRole } = render(<Harness />);
    fireEvent.click(getByRole("combobox", { name: "Remote" }));
    fireEvent.blur(getByRole("combobox", { name: "Remote" }));
    expect(queryByRole("listbox")).toBeNull();
  });
});
