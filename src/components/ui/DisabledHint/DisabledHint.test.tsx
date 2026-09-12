import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import { MenuItem } from "../Menu/Menu";
import { ToolbarButton } from "../ToolbarButton/ToolbarButton";

afterEach(cleanup);

/**
 * The wrapper is the whole point: a disabled control cannot take a hover, so this has to. It is
 * always there (so the control never remounts); "wrapped" means it carries the title.
 */
const wrapperOf = (el: HTMLElement) => {
  const w = el.closest('[role="none"]');
  return w?.hasAttribute("title") ? w : null;
};

describe("DisabledHint", () => {
  it("wraps a disabled control so its title has something to hover", () => {
    const { getByRole } = render(
      <Button disabled title="No changes">
        Commit
      </Button>,
    );
    const btn = getByRole("button", { name: "Commit" });
    const wrap = wrapperOf(btn);
    expect(wrap).not.toBeNull();
    expect(wrap?.getAttribute("title")).toBe("No changes");
    // Kept on the button as well: assistive tech reads it there, and anything already asserting
    // on the button's own title goes on working.
    expect(btn.getAttribute("title")).toBe("No changes");
  });

  it("leaves an enabled control alone", () => {
    const { getByRole } = render(<Button title="Commit, then push">Commit</Button>);
    // An enabled control fires its own tooltip; the wrapper stays boxless and says nothing.
    const btn = getByRole("button", { name: "Commit" });
    expect(wrapperOf(btn)).toBeNull();
    expect(btn.parentElement?.className).toMatch(/idle/);
  });

  it("keeps the same control node when the hint switches on and off", () => {
    // An operation disables every button with an "Operation in progress" title, then re-enables it.
    // Whoever captured the button before (a toast's focus return, a dialog's return-focus target)
    // must still hold a live node afterwards, so the hint may not remount it.
    const { getByRole, rerender } = render(<Button>Commit</Button>);
    const before = getByRole("button", { name: "Commit" });
    rerender(
      <Button disabled title="Operation in progress">
        Commit
      </Button>,
    );
    expect(wrapperOf(before)?.getAttribute("title")).toBe("Operation in progress");
    rerender(<Button>Commit</Button>);
    expect(getByRole("button", { name: "Commit" })).toBe(before);
    expect(before.isConnected).toBe(true);
  });

  it("leaves a disabled control with nothing to say alone", () => {
    const { getByRole } = render(<Button disabled>Commit</Button>);
    expect(wrapperOf(getByRole("button", { name: "Commit" }))).toBeNull();
  });

  it("wraps a disabled menu item in the caller's own box", () => {
    const { getByRole } = render(
      <MenuItem disabled title="The file is not in the working tree">
        Open
      </MenuItem>,
    );
    const wrap = wrapperOf(getByRole("menuitem", { name: "Open" }));
    expect(wrap).not.toBeNull();
    // The default box hugs the control, which is right in a flex row and wrong for a menu item: it
    // fills the menu, and a hugging wrapper leaves it narrower than its neighbours. `MenuItem` is
    // the one caller that needs the escape hatch, and this is what proves it still reaches the DOM.
    expect(wrap?.className).toMatch(/itemWrap/);
  });

  it("leaves a disabled icon button with nothing but its label to say alone", () => {
    // IconButton falls back to `label` for the title, which is the name of the action, not a reason
    // it cannot be taken: hovering a dead arrow to be told "Move up" explains nothing.
    const { getByRole } = render(<IconButton label="Split view" disabled />);
    const btn = getByRole("button", { name: "Split view" });
    expect(wrapperOf(btn)).toBeNull();
    // The fallback still names the button for an enabled hover and for assistive tech.
    expect(btn.getAttribute("title")).toBe("Split view");
  });

  it("wraps a disabled icon button that was given a reason", () => {
    const { getByRole } = render(<IconButton label="Split view" disabled title="Split view is unavailable while staging" />);
    const wrap = wrapperOf(getByRole("button", { name: "Split view" }));
    expect(wrap?.getAttribute("title")).toBe("Split view is unavailable while staging");
  });

  it("wraps a disabled toolbar button", () => {
    // ToolbarButton renders its own <button> instead of going through Button, so it needed wiring
    // up separately. It was missed on the first pass, which left the app's most-seen dead-control
    // message ("Operation in progress", on every toolbar control during an operation) invisible.
    const { getByRole } = render(
      <ToolbarButton icon={null} disabled title="Operation in progress">
        Push
      </ToolbarButton>,
    );
    const wrap = wrapperOf(getByRole("button", { name: "Push" }));
    expect(wrap?.getAttribute("title")).toBe("Operation in progress");
  });
});
