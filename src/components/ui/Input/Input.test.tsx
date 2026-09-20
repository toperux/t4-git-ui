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

/** Options that are their own labels, for the type-ahead cases that need particular wording. */
function List({ labels, value: initial, onChange = () => {} }: { labels: string[]; value: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <Select
      aria-label="List"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange(e.target.value);
      }}
    >
      {labels.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </Select>
  );
}

function Branches({ onChange = () => {} }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("main");
  return (
    <Select
      aria-label="Branch"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange(e.target.value);
      }}
    >
      <option value="" disabled>
        Pick a branch
      </option>
      <option value="feature">feature</option>
      <option value="feature/lane-graph">feature/lane-graph</option>
      <option value="fix">fix</option>
      <option value="main">main</option>
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

  it("typing moves the active option without committing it", () => {
    const onChange = vi.fn();
    const { getByRole, getAllByRole } = render(<Branches onChange={onChange} />);
    const combo = getByRole("combobox", { name: "Branch" });
    fireEvent.click(combo);

    fireEvent.keyDown(combo, { key: "f" });
    expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[1].id);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("typing while the list is shut opens it on the match, not on the selected option", () => {
    const onChange = vi.fn();
    const { getByRole, getAllByRole, queryByRole } = render(<Harness onChange={onChange} />);
    const combo = getByRole("combobox", { name: "Remote" });

    fireEvent.keyDown(combo, { key: "u" });
    expect(queryByRole("listbox")).not.toBeNull();
    // `upstream`, not the selected `origin` that opening any other way lands on.
    expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[2].id);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(combo, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("upstream");
  });

  it("takes the option the whole typed buffer names, then one it merely contains", () => {
    // A frozen clock: a stalled runner must not split the word in two.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const { getByRole, getAllByRole } = render(<Branches />);
      const combo = getByRole("combobox", { name: "Branch" });
      fireEvent.click(combo);

      // `f` alone lands on `feature`; the `i` after it makes the buffer `fi`.
      fireEvent.keyDown(combo, { key: "f" });
      fireEvent.keyDown(combo, { key: "i" });
      expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[3].id);

      // A fresh buffer: typed straight on, `lane` would only lengthen `fi`.
      vi.advanceTimersByTime(600);
      for (const key of "lane") fireEvent.keyDown(combo, { key });
      expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[2].id);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a space inside the word being typed is text: it must not pick what the letters before it reached", () => {
    const onChange = vi.fn();
    const { getByRole, getAllByRole } = render(<List labels={["Always expanded", "Always collapsed", "Remember"]} value="Remember" onChange={onChange} />);
    const combo = getByRole("combobox", { name: "List" });

    for (const key of "always") fireEvent.keyDown(combo, { key });
    expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[0].id);
    fireEvent.keyDown(combo, { key: " " });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(combo, { key: "c" });
    expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[1].id);

    fireEvent.keyDown(combo, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("Always collapsed");
  });

  it("a pick ends the word: the next letter starts a new one", () => {
    const { getByRole, getAllByRole, queryByRole } = render(<Branches />);
    const combo = getByRole("combobox", { name: "Branch" });

    fireEvent.keyDown(combo, { key: "m" });
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(queryByRole("listbox")).toBeNull();
    // `f`, not `mf`, which names nothing and would leave the list shut.
    fireEvent.keyDown(combo, { key: "f" });
    expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[1].id);
  });

  it("reaches an option that starts with a doubled letter", () => {
    const { getByRole, getAllByRole } = render(<List labels={["11.0.0", "1.0.0", "1.1.0"]} value="11.0.0" />);
    const combo = getByRole("combobox", { name: "List" });
    fireEvent.click(combo);

    fireEvent.keyDown(combo, { key: "1" });
    expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[1].id);
    // `11` is how `11.0.0` starts: that beats walking on to `1.1.0`.
    fireEvent.keyDown(combo, { key: "1" });
    expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[0].id);
  });

  it("walks from the top when the value is none of the options", () => {
    const { getByRole, getAllByRole } = render(<List labels={["alpha", "apple"]} value="gone" />);
    const combo = getByRole("combobox", { name: "List" });

    fireEvent.keyDown(combo, { key: "a" });
    expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[0].id);
  });

  it("the same letter over and over walks the options starting with it, and wraps", () => {
    const { getByRole, getAllByRole } = render(<Branches />);
    const combo = getByRole("combobox", { name: "Branch" });
    fireEvent.click(combo);
    const opts = getAllByRole("option");

    for (const i of [1, 2, 3, 1]) {
      fireEvent.keyDown(combo, { key: "f" });
      expect(combo.getAttribute("aria-activedescendant")).toBe(opts[i].id);
    }
  });

  it("never matches an option that cannot be picked", () => {
    const { getByRole, getAllByRole } = render(<Branches />);
    const branch = getByRole("combobox", { name: "Branch" });
    fireEvent.click(branch);
    // The disabled placeholder is the only row starting with `p`, so the match is one containing it.
    fireEvent.keyDown(branch, { key: "p" });
    expect(branch.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[2].id);
    fireEvent.keyDown(branch, { key: "Escape" }); // One list at a time: both portal into the body.

    const { getByRole: get, getAllByRole: getAll } = render(<Actions />);
    const action = get("combobox", { name: "Action" });
    fireEvent.click(action);
    const active = action.getAttribute("aria-activedescendant");
    // `squash` is disabled and nothing else has an `s` in it: the active option stays put.
    fireEvent.keyDown(action, { key: "s" });
    expect(active).toBe(getAll("option")[0].id);
    expect(action.getAttribute("aria-activedescendant")).toBe(active);
  });

  it("starts a new buffer after half a second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const { getByRole, getAllByRole } = render(<Branches />);
      const combo = getByRole("combobox", { name: "Branch" });
      fireEvent.click(combo);
      const opts = getAllByRole("option");

      fireEvent.keyDown(combo, { key: "m" });
      vi.advanceTimersByTime(100);
      fireEvent.keyDown(combo, { key: "a" });
      expect(combo.getAttribute("aria-activedescendant")).toBe(opts[4].id); // `ma` → main

      vi.advanceTimersByTime(600);
      fireEvent.keyDown(combo, { key: "a" });
      expect(combo.getAttribute("aria-activedescendant")).toBe(opts[1].id); // `a` alone → feature
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves a letter typed with Ctrl or Alt alone, and Space still opens and picks", () => {
    const onChange = vi.fn();
    const { getByRole, getAllByRole, queryByRole } = render(<Branches onChange={onChange} />);
    const combo = getByRole("combobox", { name: "Branch" });

    fireEvent.keyDown(combo, { key: "f", ctrlKey: true });
    fireEvent.keyDown(combo, { key: "f", altKey: true });
    expect(queryByRole("listbox")).toBeNull();

    fireEvent.keyDown(combo, { key: " " });
    expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[4].id);
    fireEvent.keyDown(combo, { key: "f", ctrlKey: true });
    expect(combo.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[4].id);

    fireEvent.keyDown(combo, { key: " " });
    expect(queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stays shut when what was typed matches nothing", () => {
    const { getByRole, queryByRole } = render(<Harness />);
    fireEvent.keyDown(getByRole("combobox", { name: "Remote" }), { key: "z" });
    expect(queryByRole("listbox")).toBeNull();
  });
});
