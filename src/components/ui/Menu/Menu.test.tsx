import { act, cleanup, fireEvent, render } from "@testing-library/react";
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

  // WebKitGTK gives no script-focused item `:focus-visible`, so the menu marks keyboard focus itself.
  it("marks the item the keyboard focused, and only that one", () => {
    const { getByRole } = render(<Harness />);
    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.click(getByRole("button", { name: "Open" }));
    const first = getByRole("menuitem", { name: "First" });
    const second = getByRole("menuitem", { name: "Second" });
    expect(first.hasAttribute("data-kbd")).toBe(true);
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(second);
    expect(second.hasAttribute("data-kbd")).toBe(true);
    expect(first.hasAttribute("data-kbd")).toBe(false);
  });

  it("opened from the pointer, its first item is focused but not marked", () => {
    const { getByRole } = render(<Harness />);
    const open = getByRole("button", { name: "Open" });
    fireEvent.pointerDown(open);
    fireEvent.click(open);
    const first = getByRole("menuitem", { name: "First" });
    expect(document.activeElement).toBe(first);
    expect(first.hasAttribute("data-kbd")).toBe(false);
  });

  // As native menus: only the last input counts, not the opener's own keyboard focus.
  it("a pointer open from a marked opener does not mark the first item", () => {
    const { getByRole } = render(<Harness />);
    const open = getByRole("button", { name: "Open" });
    fireEvent.keyDown(document, { key: "Tab" });
    act(() => open.focus());
    expect(open.hasAttribute("data-kbd")).toBe(true);
    fireEvent.pointerDown(open);
    fireEvent.click(open);
    const first = getByRole("menuitem", { name: "First" });
    expect(document.activeElement).toBe(first);
    expect(first.hasAttribute("data-kbd")).toBe(false);
  });

  // #14: jsdom, like macOS WebKit, leaves a clicked button unfocused, so the focus is on <body> at open.
  it("Escape after a click-open gives the focus to the trigger, marked", () => {
    const { getByRole } = render(<Harness />);
    const trigger = getByRole("button", { name: "Open" });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    fireEvent.keyDown(getByRole("menuitem", { name: "First" }), { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    expect(trigger.hasAttribute("data-kbd")).toBe(true);
  });

  it("a click that closes the menu leaves the focus where the click found it", () => {
    const { getByRole, queryByRole } = render(<Harness />);
    const trigger = getByRole("button", { name: "Open" });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    act(() => (document.activeElement as HTMLElement).blur());
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(queryByRole("menu")).toBeNull();
    expect(document.activeElement).not.toBe(trigger);
  });

  it("opened from the keyboard, then closed by a click on its unfocused trigger, it leaves the focus alone", () => {
    const { getByRole, queryByRole } = render(<Harness />);
    const trigger = getByRole("button", { name: "Open" });
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(trigger);
    act(() => (document.activeElement as HTMLElement).blur());
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(document.body);
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

/** A menu whose last item owns a submenu, as the Repository menu's "More recent" does. */
function SubHarness({ onOuterKey, onPick }: { onOuterKey?: (key: string) => void; onPick?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div onKeyDown={(e) => onOuterKey?.(e.key)}>
      <Menu open={open} onClose={close} label="Repository" anchor={<button onClick={() => setOpen((o) => !o)}>Open</button>}>
        <MenuItem onClick={close}>First</MenuItem>
        <MenuItem
          submenu={
            <>
              <MenuItem
                onClick={() => {
                  close();
                  onPick?.();
                }}
              >
                Sixth
              </MenuItem>
              <MenuItem onClick={close}>Seventh</MenuItem>
            </>
          }
        >
          More recent
        </MenuItem>
      </Menu>
    </div>
  );
}

describe("MenuItem submenu", () => {
  /** Opens the menu and returns the item that owns the submenu. */
  function openMenu(getByRole: ReturnType<typeof render>["getByRole"]) {
    fireEvent.click(getByRole("button", { name: "Open" }));
    return getByRole("menuitem", { name: "More recent" });
  }

  it("opens on click, and closes again when a sibling item takes the focus", () => {
    const { getByRole, queryByRole } = render(<SubHarness />);
    const item = openMenu(getByRole);
    expect(item.getAttribute("aria-haspopup")).toBe("menu");
    expect(item.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(item);
    expect(queryByRole("menu", { name: "More recent" })).not.toBeNull();
    expect(item.getAttribute("aria-expanded")).toBe("true");
    // The panel is a sibling of the menu, not one of its rows: the ↑/↓ cycle must not pick it up.
    expect(getByRole("menu", { name: "Repository" }).querySelectorAll('[role="menuitem"]')).toHaveLength(2);

    act(() => getByRole("menuitem", { name: "First" }).focus());
    expect(queryByRole("menu", { name: "More recent" })).toBeNull();
  });

  it("clamps a panel taller than the window instead of letting it run off the bottom", () => {
    const proto = HTMLElement.prototype;
    const offsetTop = Object.getOwnPropertyDescriptor(proto, "offsetTop")!;
    const offsetHeight = Object.getOwnPropertyDescriptor(proto, "offsetHeight")!;
    const innerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight")!;
    // jsdom lays nothing out: the item sits 300px down a 200px-tall window, with a 150px panel.
    Object.defineProperty(proto, "offsetTop", { configurable: true, get: () => 300 });
    Object.defineProperty(proto, "offsetHeight", { configurable: true, get: () => 150 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 200 });
    try {
      const { getByRole } = render(<SubHarness />);
      fireEvent.click(openMenu(getByRole));
      // Level with the item would be 300 + 300; the last row the window can show is 200 - 4 - 150.
      expect(getByRole("menu", { name: "More recent" }).style.top).toBe("346px");
    } finally {
      Object.defineProperty(proto, "offsetTop", offsetTop);
      Object.defineProperty(proto, "offsetHeight", offsetHeight);
      Object.defineProperty(window, "innerHeight", innerHeight);
    }
  });

  it("opens on ArrowRight and on Enter, with the focus on its first row", () => {
    const { getByRole, queryByRole } = render(<SubHarness />);
    const item = openMenu(getByRole);
    fireEvent.keyDown(item, { key: "ArrowRight" });
    expect(document.activeElement).toBe(getByRole("menuitem", { name: "Sixth" }));
    // ↓ inside the panel stays inside the panel.
    fireEvent.keyDown(getByRole("menuitem", { name: "Sixth" }), { key: "ArrowDown" });
    expect(document.activeElement).toBe(getByRole("menuitem", { name: "Seventh" }));

    fireEvent.keyDown(getByRole("menuitem", { name: "Seventh" }), { key: "ArrowLeft" });
    expect(queryByRole("menu", { name: "More recent" })).toBeNull();
    expect(document.activeElement).toBe(item);

    fireEvent.keyDown(item, { key: "Enter" });
    expect(document.activeElement).toBe(getByRole("menuitem", { name: "Sixth" }));
  });

  // T12: a click on an item the keyboard marked opens an unmarked panel; Enter on it opens a marked one.
  it("closing the panel from the keyboard marks its item, and only a key reopening it marks its first row", () => {
    const { getByRole } = render(<SubHarness />);
    fireEvent.pointerDown(getByRole("button", { name: "Open" }));
    const item = openMenu(getByRole);
    act(() => item.focus());
    fireEvent.pointerDown(item);
    fireEvent.click(item);
    expect(getByRole("menuitem", { name: "Sixth" }).hasAttribute("data-kbd")).toBe(false);

    fireEvent.keyDown(getByRole("menuitem", { name: "Sixth" }), { key: "Escape" });
    expect(document.activeElement).toBe(item);
    expect(item.hasAttribute("data-kbd")).toBe(true);
    // The pointer again: the item's own mark must not carry into the panel.
    fireEvent.pointerDown(item);
    fireEvent.click(item);
    expect(document.activeElement).toBe(getByRole("menuitem", { name: "Sixth" }));
    expect(getByRole("menuitem", { name: "Sixth" }).hasAttribute("data-kbd")).toBe(false);

    fireEvent.keyDown(getByRole("menuitem", { name: "Sixth" }), { key: "Escape" });
    fireEvent.keyDown(item, { key: "Enter" });
    expect(getByRole("menuitem", { name: "Sixth" }).hasAttribute("data-kbd")).toBe(true);
  });

  it("Escape closes the panel alone, and nothing around the menu sees the key", () => {
    const outer = vi.fn();
    const { getByRole, queryByRole } = render(<SubHarness onOuterKey={outer} />);
    const item = openMenu(getByRole);
    fireEvent.keyDown(item, { key: "ArrowRight" });

    fireEvent.keyDown(getByRole("menuitem", { name: "Sixth" }), { key: "Escape" });
    expect(queryByRole("menu", { name: "More recent" })).toBeNull();
    expect(queryByRole("menu", { name: "Repository" })).not.toBeNull();
    expect(document.activeElement).toBe(item);
    expect(outer).not.toHaveBeenCalledWith("Escape");
  });

  it("Tab closes both, and a mousedown in the panel closes neither", () => {
    const { getByRole, queryAllByRole } = render(<SubHarness />);
    fireEvent.click(openMenu(getByRole));
    fireEvent.mouseDown(getByRole("menuitem", { name: "Sixth" }));
    expect(queryAllByRole("menu")).toHaveLength(2);

    fireEvent.keyDown(getByRole("menuitem", { name: "Sixth" }), { key: "Tab" });
    expect(queryAllByRole("menu")).toHaveLength(0);
  });

  it("a panel row runs its own onClick, which closes the whole menu", () => {
    const onPick = vi.fn();
    const { getByRole, queryAllByRole } = render(<SubHarness onPick={onPick} />);
    fireEvent.click(openMenu(getByRole));
    fireEvent.click(getByRole("menuitem", { name: "Sixth" }));
    expect(onPick).toHaveBeenCalled();
    expect(queryAllByRole("menu")).toHaveLength(0);
  });

  // macOS: a real click lands after the hover has opened the panel, and its press has dropped the
  // focus to <body> (WebKit focuses no clicked button). The click must still take the focus in.
  it("a click, → or Enter on an item whose panel the hover opened takes the focus into it", () => {
    vi.useFakeTimers();
    try {
      const { getByRole } = render(<SubHarness />);
      const item = openMenu(getByRole);
      fireEvent.mouseOver(item);
      act(() => vi.advanceTimersByTime(150));
      act(() => (document.activeElement as HTMLElement).blur());
      fireEvent.pointerDown(item);
      fireEvent.click(item);
      const sixth = getByRole("menuitem", { name: "Sixth" });
      expect(document.activeElement).toBe(sixth);
      expect(sixth.hasAttribute("data-kbd")).toBe(false);

      act(() => item.focus());
      fireEvent.keyDown(item, { key: "ArrowRight" });
      expect(document.activeElement).toBe(sixth);
      expect(sixth.hasAttribute("data-kbd")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a panel the hover reopens after a click doesn't take the focus", () => {
    vi.useFakeTimers();
    try {
      const { getByRole, queryByRole } = render(<SubHarness />);
      const item = openMenu(getByRole);
      fireEvent.pointerDown(item);
      fireEvent.click(item);
      expect(document.activeElement).toBe(getByRole("menuitem", { name: "Sixth" }));

      // The pointer settles on a sibling (the panel closes), the focus on that sibling, then back.
      const first = getByRole("menuitem", { name: "First" });
      fireEvent.mouseOver(first);
      act(() => vi.advanceTimersByTime(150));
      expect(queryByRole("menu", { name: "More recent" })).toBeNull();
      act(() => first.focus());
      fireEvent.mouseOver(item);
      act(() => vi.advanceTimersByTime(150));
      expect(queryByRole("menu", { name: "More recent" })).not.toBeNull();
      expect(document.activeElement).toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  // T22: the panel holding the focus unmounts under a hover, and the focus must not drop to <body>.
  it("a hover that closes the focused panel hands the focus back to its row", () => {
    vi.useFakeTimers();
    try {
      const { getByRole, queryByRole } = render(<SubHarness />);
      const item = openMenu(getByRole);
      fireEvent.pointerDown(item);
      fireEvent.click(item);
      expect(document.activeElement).toBe(getByRole("menuitem", { name: "Sixth" }));

      const first = getByRole("menuitem", { name: "First" });
      fireEvent.mouseOver(first);
      act(() => vi.advanceTimersByTime(150));
      expect(queryByRole("menu", { name: "More recent" })).toBeNull();
      expect(document.activeElement).toBe(item);
      fireEvent.keyDown(item, { key: "ArrowDown" });
      expect(document.activeElement).toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the row a hover close hands the focus back to is marked when the last input was a key", () => {
    vi.useFakeTimers();
    try {
      const { getByRole } = render(<SubHarness />);
      const item = openMenu(getByRole);
      fireEvent.keyDown(item, { key: "ArrowRight" });
      expect(document.activeElement).toBe(getByRole("menuitem", { name: "Sixth" }));

      fireEvent.mouseOver(getByRole("menuitem", { name: "First" }));
      act(() => vi.advanceTimersByTime(150));
      expect(document.activeElement).toBe(item);
      expect(item.hasAttribute("data-kbd")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hover opens the panel after a grace, and only a settled hover on a sibling closes it", () => {
    vi.useFakeTimers();
    try {
      const { getByRole, queryByRole } = render(<SubHarness />);
      fireEvent.mouseOver(openMenu(getByRole));
      expect(queryByRole("menu", { name: "More recent" })).toBeNull();
      act(() => vi.advanceTimersByTime(150));
      expect(queryByRole("menu", { name: "More recent" })).not.toBeNull();

      // The pointer crosses siblings on its diagonal path into the panel: one hover is not enough.
      fireEvent.mouseOver(getByRole("menuitem", { name: "First" }));
      fireEvent.mouseOver(getByRole("menu", { name: "More recent" }));
      act(() => vi.advanceTimersByTime(150));
      expect(queryByRole("menu", { name: "More recent" })).not.toBeNull();

      fireEvent.mouseOver(getByRole("menuitem", { name: "First" }));
      act(() => vi.advanceTimersByTime(150));
      expect(queryByRole("menu", { name: "More recent" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("titles a row whose label is clipped, and leaves one that fits alone", () => {
    const label = "Merge origin/feature/a-really-long-branch-name into main";
    const { getByRole } = render(
      <Menu open onClose={() => {}} label="History" anchor={<button>Open</button>}>
        <MenuItem>{label}</MenuItem>
      </Menu>,
    );
    // jsdom lays nothing out, so the overflow the handler reads has to be stubbed.
    const span = getByRole("menuitem", { name: label }).querySelector("span")!;
    Object.defineProperty(span, "scrollWidth", { value: 200, configurable: true });
    Object.defineProperty(span, "clientWidth", { value: 100, configurable: true });
    // React synthesises onMouseEnter from a delegated mouseover; a dispatched mouseenter never lands.
    fireEvent.mouseOver(span);
    expect(span.title).toBe(label);

    Object.defineProperty(span, "scrollWidth", { value: 100, configurable: true });
    fireEvent.mouseOver(span);
    expect(span.title).toBe("");
  });
});

/** A row that opens a `ContextMenu` on right-click, Shift+F10 or the Menu key alike (`contextmenu`). */
function CtxHarness() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button onContextMenu={() => setAt({ x: 10, y: 10 })}>Row</button>
      <ContextMenu at={at} onClose={() => setAt(null)} label="Row actions">
        <MenuItem>Checkout</MenuItem>
      </ContextMenu>
    </>
  );
}

describe("ContextMenu", () => {
  // As native menus on Windows and GTK: a right-click highlights nothing, even after arrowing through
  // the grid, whose row still shows keyboard focus then.
  it("opened by the pointer from a marked opener, its first item is focused but not marked", () => {
    const { getByRole } = render(<CtxHarness />);
    const row = getByRole("button", { name: "Row" });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    act(() => row.focus());
    expect(row.hasAttribute("data-kbd")).toBe(true);
    fireEvent.pointerDown(row);
    fireEvent.contextMenu(row);
    const first = getByRole("menuitem", { name: "Checkout" });
    expect(document.activeElement).toBe(first);
    expect(first.hasAttribute("data-kbd")).toBe(false);
  });

  it("opened by Shift+F10, its first item is marked", () => {
    const { getByRole } = render(<CtxHarness />);
    const row = getByRole("button", { name: "Row" });
    act(() => row.focus());
    fireEvent.keyDown(row, { key: "F10", shiftKey: true });
    fireEvent.contextMenu(row);
    expect(getByRole("menuitem", { name: "Checkout" }).hasAttribute("data-kbd")).toBe(true);
  });

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
