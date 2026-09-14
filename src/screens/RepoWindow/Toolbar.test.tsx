import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogReturnFocus } from "../../components/ui/Dialog/Dialog";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { sortRecents, useRecentsStore, type RecentRepo } from "../../store/recentsStore";
import { useRepoStore } from "../../store/repoStore";
import { useTabsStore, type Tab } from "../../store/tabsStore";
import { useViewStore } from "../../store/viewStore";
import { openCommitPanel } from "./actions";
import { Toolbar } from "./Toolbar";

vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return {
    ...actual,
    fetch: vi.fn(() => Promise.resolve({ opId: "1", code: 0, conflicts: [], failure: null })),
    getDefaultRemote: vi.fn(() => Promise.resolve("origin")),
    getStatus: vi.fn(() => new Promise(() => {})),
    getRefs: vi.fn(() => new Promise(() => {})),
    getLinked: vi.fn(() => Promise.resolve(null)),
    startLog: vi.fn(() => Promise.resolve(1)),
    getLogPage: vi.fn(() => new Promise(() => {})),
    windowOrigin: vi.fn(() => Promise.resolve({ x: 100, y: 50, scale: 1, exact: true })),
    dragOver: vi.fn(() => Promise.resolve(null)),
    dragCancel: vi.fn(() => Promise.resolve()),
    dropTab: vi.fn(() => Promise.resolve("none")),
  };
});

import * as ipc from "../../api/ipc";
const mocked = ipc as unknown as Record<"fetch" | "dragOver" | "dragCancel" | "dropTab", ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  window.innerWidth = 1280;
  useViewStore.getState().__resetForTests();
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: { oid: "a", branch: "main", detached: false } }, refs: null });
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useDialogStore.setState({ dialog: null });
  useRecentsStore.setState({ recents: [] });
  useTabsStore.setState({ tabs: [], active: null, caret: null });
});
afterEach(cleanup);

describe("Toolbar Fetch", () => {
  it("is a split button: the label fetches the default remote, the ▾ opens the Fetch dialog", async () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "Fetch" }));
    await waitFor(() => expect(mocked.fetch).toHaveBeenCalledWith("r", "origin", true, false));
    expect(useDialogStore.getState().dialog).toBeNull();

    fireEvent.click(getByRole("button", { name: "Fetch options" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "fetch" });
  });
});

describe("Toolbar settings", () => {
  it("the gear opens the settings dialog", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "Settings" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "settings" });
  });
});

describe("openCommitPanel", () => {
  it("clears the search and path filters first — a filtered walk has no working-tree row to select — and switches to Changes", () => {
    useRepoStore.setState({
      refs: { head: { oid: "a", branch: "main", detached: false }, state: "merge", local: [], remotes: [], tags: [], stashes: [] },
      filter: { text: "lane", path: "a.txt" },
      log: { generation: 1, total: 1, complete: true, error: null, flat: true },
      wtSelected: false,
    });
    act(() => openCommitPanel());
    expect(useRepoStore.getState().filter.text).toBeNull();
    expect(useRepoStore.getState().filter.path).toBeNull();
    expect(useRepoStore.getState().wtSelected).toBe(true);
    expect(useViewStore.getState().view).toBe("changes");
  });
});

describe("Toolbar view switch", () => {
  it("replaces the Commit button: Changes switches the view and is never disabled", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: /^Changes/ }));
    expect(useViewStore.getState().view).toBe("changes");
    expect(getByRole("button", { name: /^Changes/ }).hasAttribute("disabled")).toBe(false);
  });
});

describe("Toolbar history chip", () => {
  it("shows the file's basename with the full path as its title, and × clears only the path", () => {
    useRepoStore.setState({ filter: { text: "lane", path: "src/screens/RepoWindow/Toolbar.tsx" } });
    const { getByRole, getByText, queryByRole } = render(<Toolbar />);
    expect(getByText("History: Toolbar.tsx").parentElement?.getAttribute("title")).toBe("src/screens/RepoWindow/Toolbar.tsx");

    fireEvent.click(getByRole("button", { name: "Clear the file history filter" }));
    expect(useRepoStore.getState().filter.path).toBeNull();
    expect(useRepoStore.getState().filter.text).toBe("lane");
    expect(queryByRole("button", { name: "Clear the file history filter" })).toBeNull();
  });

  it("is absent with no path filter", () => {
    useRepoStore.setState({ filter: {} });
    const { queryByText } = render(<Toolbar />);
    expect(queryByText(/^History:/)).toBeNull();
  });
});

/** `DialogHost` in miniature: whatever the store points at, with a field that takes the focus. */
function Host() {
  const dialog = useDialogStore((st) => st.dialog);
  const returnFocus = useDialogStore((st) => st.returnFocus);
  const close = useDialogStore((st) => st.close);
  if (!dialog) return null;
  return (
    <DialogReturnFocus.Provider value={returnFocus}>
      <Dialog title="Create branch" onClose={close}>
        <input aria-label="Name" autoFocus />
      </Dialog>
    </DialogReturnFocus.Provider>
  );
}

describe("Toolbar Branch menu", () => {
  it("hands focus back to the button it has at close time, even once an op wraps it in a hint", () => {
    const { getByRole } = render(
      <>
        <Toolbar />
        <Host />
      </>,
    );
    fireEvent.click(getByRole("button", { name: "Branch" }));
    const stale = getByRole("button", { name: "Branch" });
    fireEvent.click(getByRole("menuitem", { name: /Create branch/ }));
    expect(document.activeElement).toBe(getByRole("textbox", { name: "Name" }));

    // An op runs under the open dialog: the disabled trigger's `DisabledHint` wrapper takes the
    // title, and the button itself stays the same node throughout (it used to be remounted, which
    // is why the dialog is handed the ref rather than the node).
    act(() => useOpsStore.setState({ busy: "Pushing to origin…" }));
    expect(getByRole("button", { name: "Branch" }).parentElement?.getAttribute("title")).toBe("Operation in progress");
    act(() => useOpsStore.setState({ busy: null }));
    expect(stale.isConnected).toBe(true);

    act(() => useDialogStore.getState().close());
    expect(document.activeElement).toBe(getByRole("button", { name: "Branch" }));
  });
});

describe("Toolbar Repository menu", () => {
  it("offers Commit…, which opens the commit dialog", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "r" }));
    fireEvent.click(getByRole("menuitem", { name: /Commit…/ }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "commit" });
  });
  it("offers Run git command…, which opens the dialog", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "r" }));
    fireEvent.click(getByRole("menuitem", { name: /Run git command/ }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "runCommand" });
  });
  it("offers Add remote…, which opens the dialog", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "r" }));
    fireEvent.click(getByRole("menuitem", { name: /Add remote/ }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "addRemote" });
  });
  it("offers Add worktree…, which opens the dialog with no branch preselected", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "r" }));
    fireEvent.click(getByRole("menuitem", { name: /Add worktree/ }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "addWorktree" });
  });
  const recent = (name: string, lastOpened: number, pinned = false): RecentRepo => ({ path: `/${name}`, name, lastOpened, pinned });
  /** The menu's rows, with the shortcut chips stripped off their text. */
  const names = (menu: HTMLElement) => Array.from(menu.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent!.replace(/Ctrl.*$/, ""));

  it("lists four recents inline, with no submenu", () => {
    useRecentsStore.setState({ recents: sortRecents([recent("r", 9), recent("a", 4), recent("b", 3), recent("c", 2), recent("d", 1)]) });
    const { getByRole, queryByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "r" }));
    expect(names(getByRole("menu", { name: "Repository" }))).toEqual(["Commit…", "Add remote…", "Add worktree…", "Run git command…", "Open repository…", "a", "b", "c", "d", "Move to new window", "Close tab", "Quit"]);
    expect(queryByRole("menuitem", { name: "More recent" })).toBeNull();
  });

  it("lists five recents inline and the rest in a submenu, in store order, without the open repo", () => {
    useRecentsStore.setState({
      recents: sortRecents([
        recent("r", 99), // the repository that is open: in neither list
        recent("old", 1, true), // pinned, so it leads even as the oldest
        ...["a", "b", "c", "d", "e", "f"].map((n, i) => recent(n, 50 - i)),
      ]),
    });
    const { getByRole, queryByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "r" }));
    expect(names(getByRole("menu", { name: "Repository" }))).toEqual([
      "Commit…",
      "Add remote…",
      "Add worktree…",
      "Run git command…",
      "Open repository…",
      "old",
      "a",
      "b",
      "c",
      "d",
      "More recent",
      "Move to new window",
      "Close tab",
      "Quit",
    ]);

    fireEvent.click(getByRole("menuitem", { name: "More recent" }));
    expect(names(getByRole("menu", { name: "More recent" }))).toEqual(["e", "f"]);
    expect(getByRole("menuitem", { name: "f" }).getAttribute("title")).toBe("/f");
    expect(queryByRole("menuitem", { name: "r" })).toBeNull();
  });

  it("groups the items: act on the open repo, switch to another, move / close the tab, quit", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "r" }));
    // The Kbd renders inside the item, so strip the shortcut off the text.
    const items = Array.from(getByRole("menu", { name: "Repository" }).children).map((el) => (el.getAttribute("role") === "separator" ? "---" : el.textContent!.replace(/Ctrl.*$/, "")));
    expect(items).toEqual(["Commit…", "Add remote…", "Add worktree…", "Run git command…", "---", "Open repository…", "No other recent repositories", "---", "Move to new window", "Close tab", "---", "Quit"]);
  });
});

describe("Toolbar repository handle", () => {
  const closeTab = vi.fn(() => Promise.resolve());
  const tabs = (...names: string[]): Tab[] => names.map((n) => ({ id: `/${n}`, path: `/repos/${n}`, name: n, stale: false }));

  beforeEach(() => {
    // jsdom has no pointer capture, and the handle takes it for the length of a drag.
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    mocked.dropTab.mockResolvedValue("none");
    useTabsStore.setState({ tabs: tabs("r"), active: "/r", closeTab: closeTab as never });
  });

  /** Presses the button and moves past the threshold, letting the origin and the chained calls land. */
  async function drag(btn: HTMLElement) {
    await act(async () => {
      fireEvent.pointerDown(btn, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    });
    await act(async () => {
      fireEvent.pointerMove(btn, { pointerId: 1, clientX: 50, clientY: 200 });
    });
  }
  const drop = (btn: HTMLElement) =>
    act(async () => {
      fireEvent.pointerUp(btn, { pointerId: 1, clientX: 50, clientY: 200 });
    });

  it("drags the active tab out, and the only tab is handed over rather than torn off", async () => {
    mocked.dropTab.mockResolvedValue("adopted");
    const { getByRole, getByText } = render(<Toolbar />);
    const btn = getByRole("button", { name: "r" });
    await drag(btn);
    // The ghost is the repository's name a second time; origin (100, 50) + client × scale 1.
    expect(getByText("r", { selector: "div" })).toBeTruthy();
    expect(mocked.dragOver).toHaveBeenCalledWith(150, 250);

    await drop(btn);
    expect(mocked.dropTab).toHaveBeenCalledWith(150, 250, "/repos/r", false);
    expect(closeTab).toHaveBeenCalledWith("/r");
    // The click that follows the drag is not a click: the menu stays shut.
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("tears off when the window has another tab to fall back on", async () => {
    useTabsStore.setState({ tabs: tabs("r", "b") });
    const { getByRole } = render(<Toolbar />);
    const btn = getByRole("button", { name: "r" });
    await drag(btn);
    await drop(btn);
    expect(mocked.dropTab).toHaveBeenCalledWith(150, 250, "/repos/r", true);
    // `none`: nowhere to go, so the tab stays here.
    expect(closeTab).not.toHaveBeenCalled();
  });

  it("a press that never passes the threshold still opens the menu", async () => {
    const { getByRole } = render(<Toolbar />);
    const btn = getByRole("button", { name: "r" });
    await act(async () => {
      fireEvent.pointerDown(btn, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    });
    await act(async () => {
      fireEvent.pointerMove(btn, { pointerId: 1, clientX: 12, clientY: 11 });
      fireEvent.pointerUp(btn, { pointerId: 1, clientX: 12, clientY: 11 });
    });
    fireEvent.click(btn);
    expect(getByRole("menu", { name: "Repository" })).toBeTruthy();
    expect(mocked.dropTab).not.toHaveBeenCalled();
  });

  it("Escape mid-drag cancels it: the tab stays and the window showing a caret is told", async () => {
    const { getByRole } = render(<Toolbar />);
    const btn = getByRole("button", { name: "r" });
    await drag(btn);
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(mocked.dragCancel).toHaveBeenCalled();

    await drop(btn);
    expect(mocked.dropTab).not.toHaveBeenCalled();
    expect(useTabsStore.getState().tabs.map((t) => t.id)).toEqual(["/r"]);
  });
});

function setWidth(w: number) {
  act(() => {
    window.innerWidth = w;
    window.dispatchEvent(new Event("resize"));
  });
}

describe("Toolbar tiers", () => {
  it("full: search and filter inline, no overflow menu", () => {
    const { getByRole, queryByRole } = render(<Toolbar />);
    expect(getByRole("searchbox", { name: "Search commits" })).toBeTruthy();
    expect(getByRole("combobox", { name: "Branch filter" })).toBeTruthy();
    expect(queryByRole("button", { name: "More" })).toBeNull();
    expect(getByRole("toolbar").className).not.toMatch(/tight|icons/);
  });
  it("tight: the toolbar carries the tier class and the buttons keep their names", () => {
    window.innerWidth = 1000;
    const { getByRole } = render(<Toolbar />);
    expect(getByRole("toolbar").className).toMatch(/tight/);
    expect(getByRole("button", { name: "Pull" }).querySelector("[data-label]")).toBeTruthy();
    expect(getByRole("button", { name: "Branch" })).toBeTruthy();
  });
  it("icons: search is a button opening a popover; Branch, Stash, Refresh, theme, Settings and the palette fold into More", () => {
    window.innerWidth = 720;
    const { getByRole, queryByRole } = render(<Toolbar />);
    expect(getByRole("toolbar").className).toMatch(/icons/);
    expect(queryByRole("searchbox")).toBeNull();
    expect(queryByRole("button", { name: "Branch" })).toBeNull();
    expect(queryByRole("button", { name: "Settings" })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Search commits" }));
    expect(getByRole("searchbox", { name: "Search commits" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("searchbox")).toBeNull();
    fireEvent.click(getByRole("button", { name: "More" }));
    for (const name of ["Branch", "Stash…", "Refresh", "Switch to dark theme", "Settings", "Command palette"]) {
      expect(getByRole("menuitem", { name: new RegExp(`^${name.replace("…", "\\…")}`) })).toBeTruthy();
    }
    fireEvent.click(getByRole("menuitem", { name: /^Settings/ }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "settings" });
  });
  it("re-lays out on resize", () => {
    const { getByRole, queryByRole } = render(<Toolbar />);
    expect(queryByRole("button", { name: "More" })).toBeNull();
    setWidth(720);
    expect(getByRole("button", { name: "More" })).toBeTruthy();
  });
  it("Changes view: no search box or filter in the toolbar", () => {
    useViewStore.getState().setView("changes");
    const { queryByRole } = render(<Toolbar />);
    expect(queryByRole("searchbox")).toBeNull();
    expect(queryByRole("combobox", { name: "Branch filter" })).toBeNull();
  });
});
