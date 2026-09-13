import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTabsStore, type Tab } from "../../store/tabsStore";
import { TabStrip } from "./TabStrip";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(() => Promise.resolve(null)), ask: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn(() => Promise.resolve()) }));
vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return {
    ...actual,
    windowOrigin: vi.fn(() => Promise.resolve({ x: 100, y: 50, scale: 1, exact: true })),
    dragOver: vi.fn(() => Promise.resolve(null)),
    dragCancel: vi.fn(() => Promise.resolve()),
    dropTab: vi.fn(() => Promise.resolve("none")),
  };
});

import * as ipc from "../../api/ipc";

const activate = vi.fn();
const closeTab = vi.fn(() => Promise.resolve());
const tab = (name: string): Tab => ({ id: `/${name}`, path: `/repos/${name}`, name, stale: false });
const mocked = ipc as unknown as Record<"dragOver" | "dragCancel" | "dropTab", ReturnType<typeof vi.fn>>;
/** Every rect is 0×0 at the origin in jsdom: a move to y=200 is out of the strip, and x>0 is past every tab. */
const names = (list: HTMLElement[]) => list.map((t) => t.textContent);

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocked.dropTab.mockResolvedValue("none");
  // jsdom has no pointer capture, and the strip takes it for the length of a drag.
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  useTabsStore.setState({ tabs: [tab("a"), tab("b")], active: "/a", caret: null, activate, closeTab: closeTab as never });
});

/** Picks up tab `i` and lets the window origin land, which the screen mapping waits for. */
async function grab(tabs: HTMLElement[], i: number) {
  await act(async () => {
    fireEvent.pointerDown(tabs[i], { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
  });
}

/** A move of that drag, plus the microtask the chained calls to Rust ride on. */
async function move(strip: HTMLElement, init: Record<string, number>) {
  await act(async () => {
    fireEvent.pointerMove(strip, { pointerId: 1, ...init });
  });
}

describe("TabStrip", () => {
  it("names every open repository, marks the active one and shows its path", () => {
    const { getAllByRole } = render(<TabStrip />);
    const tabs = getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["a", "b"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(tabs[1].getAttribute("title")).toBe("/repos/b");
  });

  it("shows the dot of a tab something changed in", () => {
    useTabsStore.setState({ tabs: [tab("a"), { ...tab("b"), stale: true }] });
    const { getByLabelText } = render(<TabStrip />);
    expect(getByLabelText("Changed")).toBeTruthy();
  });

  it("a click activates, the × and a middle-click close", () => {
    const { getAllByRole, getByLabelText } = render(<TabStrip />);
    fireEvent.click(getAllByRole("tab")[1]);
    expect(activate).toHaveBeenCalledWith("/b");

    fireEvent.click(getByLabelText("Close b"));
    expect(closeTab).toHaveBeenCalledWith("/b");

    closeTab.mockClear();
    // No `fireEvent.auxClick` in this version of testing-library; the event is the same one.
    fireEvent(getAllByRole("tab")[0], new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
    expect(closeTab).toHaveBeenCalledWith("/a");
  });

  it("a drag inside the strip reorders, and only past the threshold", async () => {
    const { getAllByRole, getByRole } = render(<TabStrip />);
    const strip = getByRole("tablist");
    await grab(getAllByRole("tab"), 0);

    await move(strip, { clientX: 13, clientY: 10 });
    expect(names(getAllByRole("tab"))).toEqual(["a", "b"]);

    await move(strip, { clientX: 100, clientY: 10 });
    expect(names(getAllByRole("tab"))).toEqual(["b", "a"]);
  });

  it("leaving the strip shows the ghost and probes for another window", async () => {
    const { getAllByRole, getByRole, getByText } = render(<TabStrip />);
    const strip = getByRole("tablist");
    await grab(getAllByRole("tab"), 0);

    await move(strip, { clientX: 50, clientY: 200, screenX: 300, screenY: 400 });
    // The ghost is the tab's name a second time; the tab itself keeps its slot, hidden.
    expect(getByText("a", { selector: "div" })).toBeTruthy();
    // origin (100, 50) + client × scale 1.
    expect(mocked.dragOver).toHaveBeenCalledWith(150, 250);
  });

  it("a tab dropped on another window is closed here, one dropped nowhere stays", async () => {
    mocked.dropTab.mockResolvedValue("adopted");
    const { getAllByRole, getByRole } = render(<TabStrip />);
    const strip = getByRole("tablist");
    await grab(getAllByRole("tab"), 0);
    await move(strip, { clientX: 50, clientY: 200 });
    await act(async () => {
      fireEvent.pointerUp(strip, { pointerId: 1, clientX: 50, clientY: 200 });
    });
    expect(mocked.dropTab).toHaveBeenCalledWith(150, 250, "/repos/a", true);
    expect(closeTab).toHaveBeenCalledWith("/a");

    closeTab.mockClear();
    mocked.dropTab.mockResolvedValue("none");
    await grab(getAllByRole("tab"), 0);
    await move(strip, { clientX: 50, clientY: 200 });
    await act(async () => {
      fireEvent.pointerUp(strip, { pointerId: 1, clientX: 50, clientY: 200 });
    });
    expect(closeTab).not.toHaveBeenCalled();
  });

  it("Escape puts the tab back where it was picked up", async () => {
    const { getAllByRole, getByRole } = render(<TabStrip />);
    const strip = getByRole("tablist");
    await grab(getAllByRole("tab"), 0);
    await move(strip, { clientX: 100, clientY: 10 });
    expect(names(getAllByRole("tab"))).toEqual(["b", "a"]);
    await move(strip, { clientX: 100, clientY: 200 });

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(names(getAllByRole("tab"))).toEqual(["a", "b"]);
    // The window that was showing a caret for it has to be told the drag is over.
    expect(mocked.dragCancel).toHaveBeenCalled();
  });

  it("the row menu moves the tab to its own window", () => {
    const detach = vi.fn(() => Promise.resolve());
    useTabsStore.setState({ detach: detach as never });
    const { getAllByRole, getByRole } = render(<TabStrip />);
    fireEvent.contextMenu(getAllByRole("tab")[1]);
    fireEvent.click(getByRole("menuitem", { name: "Move to new window" }));
    expect(detach).toHaveBeenCalledWith("/b");
  });
});
