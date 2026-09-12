import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import { MenuItem } from "../Menu/Menu";
import { ToolbarButton } from "../ToolbarButton/ToolbarButton";

afterEach(cleanup);

/** The wrapper is the whole point: a disabled control cannot take a hover, so this has to. */
const wrapperOf = (el: HTMLElement) => el.closest('[role="none"]');

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
    // An enabled control fires its own tooltip, so wrapping it would add a DOM node for nothing.
    expect(wrapperOf(getByRole("button", { name: "Commit" }))).toBeNull();
  });

  it("leaves a disabled control with nothing to say alone", () => {
    const { getByRole } = render(<Button disabled>Commit</Button>);
    expect(wrapperOf(getByRole("button", { name: "Commit" }))).toBeNull();
  });

  it("wraps a disabled menu item", () => {
    const { getByRole } = render(
      <MenuItem disabled title="The file is not in the working tree">
        Open
      </MenuItem>,
    );
    expect(wrapperOf(getByRole("menuitem", { name: "Open" }))).not.toBeNull();
  });

  it("wraps a disabled icon button, whose label doubles as its tooltip", () => {
    // IconButton falls back to `label` for the title, so a disabled one always has something to
    // show even though no `title` was passed.
    const { getByRole } = render(<IconButton label="Split view" disabled />);
    const wrap = wrapperOf(getByRole("button", { name: "Split view" }));
    expect(wrap?.getAttribute("title")).toBe("Split view");
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
