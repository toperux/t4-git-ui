import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Dialog } from "../Dialog/Dialog";
import { ContextMenu, Menu, MenuItem } from "./Menu";

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

  it("Tab closes it rather than walking focus out of a menu that stays open, and End jumps to the last item", () => {
    const { getByRole, queryByRole } = render(<Harness />);
    fireEvent.click(getByRole("button", { name: "Open" }));
    fireEvent.keyDown(getByRole("menuitem", { name: "First" }), { key: "End" });
    expect(document.activeElement).toBe(getByRole("menuitem", { name: "Second" }));
    fireEvent.keyDown(getByRole("menuitem", { name: "Second" }), { key: "Home" });
    expect(document.activeElement).toBe(getByRole("menuitem", { name: "First" }));

    fireEvent.keyDown(getByRole("menuitem", { name: "First" }), { key: "Tab" });
    expect(queryByRole("menu")).toBeNull();
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

  it("closes for a scroll that moves its trigger, not for one somewhere else on the page", () => {
    const onClose = vi.fn();
    const { getByRole, getByTestId } = render(
      <div>
        {/* The output dock autoscrolls itself while an op streams — nowhere near the menu. */}
        <div data-testid="dock" />
        <div data-testid="pane">
          <Menu open onClose={onClose} label="History" anchor={<button>Open</button>}>
            <MenuItem>First</MenuItem>
          </Menu>
        </div>
      </div>,
    );
    fireEvent.scroll(getByTestId("dock"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.scroll(getByRole("menu"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.scroll(getByTestId("pane"));
    expect(onClose).toHaveBeenCalled();
    onClose.mockClear();
    // A resize moves everything.
    fireEvent.resize(window);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ContextMenu", () => {
  it("Escape closes the menu and not the dialog it was opened from", () => {
    // The menu is portalled to the body, but React still bubbles its keys up to the dialog's form —
    // whose own Escape closes the dialog. A row menu in the commit window must close alone.
    const closeDialog = vi.fn();
    const closeMenu = vi.fn();
    const { getByRole } = render(
      <Dialog title="Commit" onClose={closeDialog}>
        <ContextMenu at={{ x: 10, y: 10 }} onClose={closeMenu} label="File actions">
          <MenuItem>Stage</MenuItem>
        </ContextMenu>
      </Dialog>,
    );
    fireEvent.keyDown(getByRole("menuitem", { name: "Stage" }), { key: "Escape" });
    expect(closeMenu).toHaveBeenCalled();
    expect(closeDialog).not.toHaveBeenCalled();
  });

  it("closes when the page scrolls under it, but not when the menu itself scrolls", () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <ContextMenu at={{ x: 10, y: 10 }} onClose={onClose} label="Commit">
        <MenuItem>Copy SHA</MenuItem>
      </ContextMenu>,
    );
    fireEvent.scroll(getByRole("menu"));
    expect(onClose).not.toHaveBeenCalled();
    // The menu is placed once, from the click point: it would name a different row after a scroll.
    fireEvent.scroll(document);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes for the scroller the click point sits in, not for one elsewhere", () => {
    const { getByTestId } = render(
      <div>
        <div data-testid="dock" />
        <div data-testid="grid">
          <span data-testid="row">Fix the thing</span>
        </div>
      </div>,
    );
    // jsdom has no layout, so the row the menu was opened on has to be named outright.
    const row = getByTestId("row");
    document.elementFromPoint = (() => row) as typeof document.elementFromPoint;
    try {
      const onClose = vi.fn();
      render(
        <ContextMenu at={{ x: 10, y: 10 }} onClose={onClose} label="Commit">
          <MenuItem>Copy SHA</MenuItem>
        </ContextMenu>,
      );
      fireEvent.scroll(getByTestId("dock"));
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.scroll(getByTestId("grid"));
      expect(onClose).toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  });
});
