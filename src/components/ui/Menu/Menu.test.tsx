import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Dialog } from "../Dialog/Dialog";
import { Menu, MenuItem } from "./Menu";

afterEach(cleanup);

/** A menu inside something that also listens for keys (a `Dialog`, say). */
function Harness({ onOuterKey }: { onOuterKey?: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div onKeyDown={(e) => onOuterKey?.(e.key)}>
      <Menu open={open} onClose={() => setOpen(false)} label="History" anchor={<button onClick={() => setOpen((o) => !o)}>Open</button>}>
        <MenuItem onClick={() => setOpen(false)}>First</MenuItem>
        <MenuItem onClick={() => setOpen(false)}>Second</MenuItem>
      </Menu>
    </div>
  );
}

describe("Menu", () => {
  it("owns Escape while open: the menu closes and nothing around it sees the key", () => {
    const outer = vi.fn();
    const { getByRole, queryByRole } = render(<Harness onOuterKey={outer} />);
    fireEvent.click(getByRole("button", { name: "Open" }));
    const first = getByRole("menuitem", { name: "First" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Escape" });
    expect(queryByRole("menu")).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    // Closed, Escape is not the menu's business.
    fireEvent.keyDown(getByRole("button", { name: "Open" }), { key: "Escape" });
    expect(outer).toHaveBeenCalledWith("Escape");
  });

  it("a shortcut chip is a picture, not part of the item's name", () => {
    const { getByRole } = render(
      <Menu open onClose={() => {}} label="History" anchor={null}>
        <MenuItem kbd="Delete">Discard…</MenuItem>
      </Menu>,
    );
    const item = getByRole("menuitem", { name: "Discard…" });
    expect(item.getAttribute("aria-keyshortcuts")).toBe("Delete");
    expect(item.querySelector("kbd")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("leaves the focus alone when an item opened a dialog: its first field keeps it", () => {
    // The item closes the menu and mounts the dialog in one commit, so this cleanup runs after the
    // field's `autoFocus`. Taking the focus back would leave the dialog sitting on its Close button.
    function WithDialog() {
      const [open, setOpen] = useState(false);
      const [dialog, setDialog] = useState(false);
      return (
        <>
          <Menu open={open} onClose={() => setOpen(false)} label="Branch" anchor={<button onClick={() => setOpen(true)}>Branch</button>}>
            <MenuItem
              onClick={() => {
                setOpen(false);
                setDialog(true);
              }}
            >
              Create branch…
            </MenuItem>
          </Menu>
          {dialog && (
            <Dialog title="Create branch" onClose={() => setDialog(false)}>
              <input aria-label="Name" autoFocus />
            </Dialog>
          )}
        </>
      );
    }
    const { getByRole } = render(<WithDialog />);
    const trigger = getByRole("button", { name: "Branch" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(getByRole("menuitem", { name: "Create branch…" }));
    expect(document.activeElement).toBe(getByRole("textbox", { name: "Name" }));
  });

  it("gives focus back to the trigger once closed", () => {
    const { getByRole, queryByRole } = render(<Harness />);
    const trigger = getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    // The first item took focus, but the trigger is what focus goes back to.
    expect(document.activeElement).toBe(getByRole("menuitem", { name: "First" }));
    fireEvent.click(getByRole("menuitem", { name: "Second" }));
    expect(queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
