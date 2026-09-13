import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogReturnFocus } from "../../components/ui/Dialog/Dialog";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { sortRecents, useRecentsStore, type RecentRepo } from "../../store/recentsStore";
import { useRepoStore } from "../../store/repoStore";
import { useTabsStore, type Tab } from "../../store/tabsStore";
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

describe("Toolbar Commit", () => {
  it("is disabled with no changes, but a merge still to be committed enables it", () => {
    const { getByRole, rerender } = render(<Toolbar />);
    expect(getByRole("button", { name: "Commit" }).hasAttribute("disabled")).toBe(true);
    // "Keep main's version" on the only conflict: MERGE_HEAD is there, the status is empty.
    useRepoStore.setState({ refs: { head: { oid: "a", branch: "main", detached: false }, state: "merge", local: [], remotes: [], tags: [], stashes: [] } });
    rerender(<Toolbar />);
    expect(getByRole("button", { name: "Commit" }).hasAttribute("disabled")).toBe(false);
  });

  it("clears the search filter first — the pseudo-row that mounts the panel is hidden while it flattens the walk", () => {
    useRepoStore.setState({
      refs: { head: { oid: "a", branch: "main", detached: false }, state: "merge", local: [], remotes: [], tags: [], stashes: [] },
      filter: { text: "lane" },
      log: { generation: 1, total: 1, complete: true, error: null, flat: true },
      wtSelected: false,
    });
    const { getByRole, getByLabelText } = render(<Toolbar />);
    expect((getByLabelText("Search commits") as HTMLInputElement).value).toBe("lane");

    fireEvent.click(getByRole("button", { name: "Commit" }));
    expect(useRepoStore.getState().filter.text).toBeNull();
    expect(useRepoStore.getState().wtSelected).toBe(true);
    // The field follows the store, so it doesn't keep showing a filter that is no longer applied.
    expect((getByLabelText("Search commits") as HTMLInputElement).value).toBe("");
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

  it("Commit clears the path filter too — it flattens the walk just as the search does", () => {
    useRepoStore.setState({
      refs: { head: { oid: "a", branch: "main", detached: false }, state: "merge", local: [], remotes: [], tags: [], stashes: [] },
      filter: { path: "a.txt" },
      log: { generation: 1, total: 1, complete: true, error: null, flat: true },
      wtSelected: false,
    });
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: "Commit" }));
    expect(useRepoStore.getState().filter.path).toBeNull();
    expect(useRepoStore.getState().filter.text).toBeNull();
    expect(useRepoStore.getState().wtSelected).toBe(true);
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
