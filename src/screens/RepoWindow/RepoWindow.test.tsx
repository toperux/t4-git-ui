import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileDiff, RefsSnapshot } from "../../api/types";
import { useCommitStore } from "../../store/commitStore";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useStatusStore } from "../../store/statusStore";
import { useTabsStore } from "../../store/tabsStore";
import { useViewStore } from "../../store/viewStore";
import { fileDiff, hunk, line } from "./DiffViewer/diffFixtures";
import { forgetScroll, seedScroll, takeNote, takeSeed, type DiffScroll } from "./DiffViewer/diffScroll";
import { DiffViewer } from "./DiffViewer/DiffViewer";
import { RepoStatusBar, RepoWindow, StateBanners } from "./RepoWindow";

vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return {
    ...actual,
    getStatus: vi.fn(() => new Promise(() => {})),
    getRefs: vi.fn(() => new Promise(() => {})),
    getLinked: vi.fn(() => Promise.resolve(null)),
  };
});

// The window's layout alone: jsdom has no layout for the panels, and the panes under test elsewhere.
type PanelProps = {
  children?: React.ReactNode;
  maxSize?: number;
  defaultSize?: number;
  onResize?: (s: { inPixels: number }) => void;
  elementRef?: React.Ref<HTMLDivElement>;
};
type SeparatorProps = {
  "aria-label"?: string;
  disabled?: boolean;
  elementRef?: React.Ref<HTMLDivElement>;
  onKeyDown?: React.KeyboardEventHandler;
  onPointerDown?: React.PointerEventHandler;
  onDoubleClick?: React.MouseEventHandler;
};
const sidebar = vi.hoisted(() => ({ props: null as PanelProps | null }));
const dock = vi.hoisted(() => ({ props: null as PanelProps | null }));
vi.mock("react-resizable-panels", async () => {
  const { useLayoutEffect, useRef } = await import("react");
  return {
    Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Panel: (p: PanelProps) => {
      if (p.maxSize === 560) sidebar.props = p;
      if (p.maxSize === 320) dock.props = p; // the dock's DOCK_MAX_H
      return <div ref={p.elementRef}>{p.children}</div>;
    },
    // As the library does: `onFocus`, `onBlur` and `ref` are its own (so not taken here), and a
    // disabled separator has no `tabindex`, so it cannot hold the focus. This one drops the focus in
    // the very render that disables it, the earliest a webview could: a check for "the bar holds the
    // focus" made any later than the store's change finds nothing.
    Separator: ({ "aria-label": label, disabled, elementRef, onKeyDown, onPointerDown, onDoubleClick }: SeparatorProps) => {
      const el = useRef<HTMLDivElement | null>(null);
      useLayoutEffect(() => {
        if (disabled && document.activeElement === el.current) el.current?.blur();
      }, [disabled]);
      return (
        <div
          ref={(node) => {
            el.current = node;
            if (typeof elementRef === "function") elementRef(node);
            else if (elementRef) elementRef.current = node;
          }}
          role="separator"
          aria-label={label}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? undefined : 0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
        />
      );
    },
    usePanelRef: () => ({ current: null }),
  };
});
vi.mock("./ChangesView", () => ({ ChangesView: () => null }));
vi.mock("./CommandPalette/CommandPalette", () => ({ CommandPalette: () => null }));
vi.mock("./CommitPanel/CommitPanel", () => ({ useCommitSync: () => {} }));
vi.mock("./DetailsPane", () => ({ DetailsPane: () => null }));
vi.mock("./dialogs/DialogHost", () => ({ DialogHost: () => null }));
// The header's toggle, mounted in both states as the real one is, with its marker; a prompt that
// exists only in the open dock; and a Cancel that stays through a close, as a running op's does.
vi.mock("./OutputDock", async () => {
  const { useOpsStore } = await import("../../store/opsStore");
  return {
    OutputDock: () => {
      const open = useOpsStore((st) => st.open);
      return (
        <>
          <button type="button">Cancel</button>
          <button type="button" data-dock-toggle>
            {open ? "Collapse output" : "Expand output"}
          </button>
          {open && <input aria-label="Run git command" />}
        </>
      );
    },
  };
});
vi.mock("./RevisionGrid/RevisionGrid", () => ({ RevisionGrid: () => null }));
vi.mock("./Sidebar", () => ({ Sidebar: () => <div data-testid="sidebar" /> }));
vi.mock("./SidebarRail", () => ({ SidebarRail: () => null }));
vi.mock("./TabStrip", () => ({ TabStrip: () => null }));
vi.mock("./Toolbar", () => ({ Toolbar: () => null }));
vi.mock("./useShortcuts", () => ({ useShortcuts: () => {} }));

const REFS: RefsSnapshot = {
  head: { oid: "abcdef0", branch: null, detached: true },
  state: "clean",
  local: [{ name: "main", oid: "b", upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead: false }],
  remotes: [],
  tags: [],
  stashes: [],
};

beforeEach(() => {
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: REFS.head }, refs: REFS });
  useStatusStore.setState({ status: null });
  useOpsStore.setState({ ops: [], open: false, busy: "Fetching…" });
  useDialogStore.setState({ dialog: null });
});
afterEach(cleanup);

const button = (getByRole: (role: string, o: { name: string }) => HTMLElement, name: string) => getByRole("button", { name }) as HTMLButtonElement;

describe("StateBanners while an op runs", () => {
  it("disables the detached-HEAD buttons with the reason, and enables them after", () => {
    const { getByRole } = render(<StateBanners />);
    for (const name of ["Create branch…", "Checkout main"]) {
      expect(button(getByRole, name).disabled).toBe(true);
      expect(button(getByRole, name).title).toBe("Operation in progress");
    }
    fireEvent.click(button(getByRole, "Create branch…"));
    expect(useDialogStore.getState().dialog).toBeNull();

    act(() => useOpsStore.setState({ busy: null }));
    expect(button(getByRole, "Create branch…").disabled).toBe(false);
    expect(button(getByRole, "Checkout main").disabled).toBe(false);
    fireEvent.click(button(getByRole, "Create branch…"));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "createBranch" });
  });

  it("keeps the view switch enabled in a merge, and gates Abort", () => {
    useRepoStore.setState({ refs: { ...REFS, head: { oid: "a", branch: "main", detached: false }, state: "merge" } });
    const { getByRole } = render(<StateBanners />);
    expect(button(getByRole, "Commit merge").disabled).toBe(false);
    expect(button(getByRole, "Abort").disabled).toBe(true);
  });
});

describe("RepoStatusBar", () => {
  it("groups the loading commit count in thousands", () => {
    const log = useRepoStore.getState().log;
    useRepoStore.setState({ log: { ...log, total: 96000, complete: false } });
    try {
      const { getByText } = render(<RepoStatusBar />);
      expect(getByText("Loading commits… 96 000")).toBeTruthy();
    } finally {
      useRepoStore.setState({ log });
    }
  });

  it("names the branch being rebased instead of the detached HEAD; a detached start keeps the sha", () => {
    const rebase = (theirs: string) => ({ ...REFS, head: { oid: "abcdef0123", branch: null, detached: true }, state: "rebase" as const, conflictSides: { ours: "main", theirs } });
    useRepoStore.setState({ refs: rebase("feature") });
    const named = render(<RepoStatusBar />);
    expect(named.getByText("feature")).toBeTruthy();
    expect(named.queryByText(/\(detached\)/)).toBeNull();
    cleanup();

    useRepoStore.setState({ refs: rebase("HEAD") });
    const { getByText } = render(<RepoStatusBar />);
    expect(getByText("abcdef0")).toBeTruthy();
    expect(getByText(/\(detached\)/)).toBeTruthy();
  });

  it("says Clean only beside a clean tree; an operation shows whatever the tree holds", () => {
    const edited = { path: "a", oldPath: null, index: null, workdir: "modified" as const, conflicted: false, submodule: false, submoduleDirtyOnly: false, workdirStamp: "1:1", indexStamp: null };
    const tree = (dirty: boolean, state: "clean" | "merge" = "clean") => ({ entries: dirty ? [edited] : [], staged: 0, unstaged: dirty ? 1 : 0, untracked: 0, conflicted: 0, state });
    useStatusStore.setState({ status: tree(true) });
    const dirty = render(<RepoStatusBar />);
    expect(dirty.getByText("1 unstaged · 0 staged")).toBeTruthy();
    expect(dirty.queryByText("Clean")).toBeNull();
    cleanup();

    useStatusStore.setState({ status: tree(false) });
    expect(render(<RepoStatusBar />).getByText("Clean")).toBeTruthy();
    cleanup();

    // Not known yet — an empty scan from another state, or none — is never "Clean".
    useStatusStore.setState({ status: tree(false, "merge") });
    expect(render(<RepoStatusBar />).queryByText("Clean")).toBeNull();
    cleanup();
    useStatusStore.setState({ status: null });
    expect(render(<RepoStatusBar />).queryByText("Clean")).toBeNull();
    cleanup();

    useRepoStore.setState({ refs: { ...REFS, state: "merge" } });
    useStatusStore.setState({ status: tree(true, "merge") });
    expect(render(<RepoStatusBar />).getByText("Merge in progress")).toBeTruthy();
  });
});

describe("RepoWindow activity bar", () => {
  afterEach(() => useCommitStore.setState({ busy: false, committing: false }));

  // The wrapper is `aria-hidden` and the status bar's spinner is a progressbar of the same name:
  // find the wrapper first, then the bar inside it.
  const bar = (queryByTestId: (id: string) => HTMLElement | null, name: string) => {
    const wrapper = queryByTestId("activity-bar");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.getAttribute("aria-hidden")).toBe("true");
    return within(wrapper!).getByRole("progressbar", { name, hidden: true });
  };

  it("shows nothing while idle", () => {
    useOpsStore.setState({ busy: null });
    expect(render(<RepoWindow />).queryByTestId("activity-bar")).toBeNull();
  });

  it("shows the op's label while an op runs", () => {
    expect(bar(render(<RepoWindow />).queryByTestId, "Fetching…")).toBeTruthy();
  });

  it("says Committing while the commit panel commits", () => {
    useOpsStore.setState({ busy: null });
    useCommitStore.setState({ busy: true, committing: true });
    expect(bar(render(<RepoWindow />).queryByTestId, "Committing")).toBeTruthy();
  });

  it("says Applying changes while the commit panel stages", () => {
    useOpsStore.setState({ busy: null });
    useCommitStore.setState({ busy: true, committing: false });
    expect(bar(render(<RepoWindow />).queryByTestId, "Applying changes")).toBeTruthy();
  });

  it("names the op when both are busy", () => {
    useCommitStore.setState({ busy: true, committing: true });
    expect(bar(render(<RepoWindow />).queryByTestId, "Fetching…")).toBeTruthy();
  });
});

describe("RepoWindow and a tab switch's diff seed", () => {
  afterEach(() => {
    useTabsStore.setState({ active: null });
    useViewStore.getState().__resetForTests();
    forgetScroll();
  });

  it("drops a seed no body took in the switch's commit, so a file clicked later starts at the top", () => {
    const seed: DiffScroll = { pane: "changes", repoId: "r", path: "a.rs", diff: {} as FileDiff, rows: [], view: "unified", top: 500 };
    // A Changes tab with no file selected: no body mounts to take it.
    useViewStore.setState({ view: "changes" });
    useTabsStore.setState({ active: "q" });
    render(<RepoWindow />);
    // Only a switch drops it: a seed set with no switch is still there.
    act(() => seedScroll(seed));
    expect(takeSeed("changes", "r", "a.rs")).toBe(seed);

    act(() => {
      useTabsStore.setState({ active: "r" });
      seedScroll(seed);
    });
    // The file clicked later: a kept seed would open it at 500. jsdom has no layout, so give the body
    // room to scroll there.
    const tall = vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(100_000);
    try {
      render(<DiffViewer path="a.rs" diff={fileDiff([hunk("@@ -1 +1 @@", [line("del", 1, null, "a"), line("add", null, 1, "b")])], { path: "a.rs" })} loading={false} error={null} remember="changes" />);
    } finally {
      tall.mockRestore();
    }
    expect(takeNote()).toMatchObject({ path: "a.rs", top: 0 });
  });
});

describe("RepoWindow sidebar", () => {
  const innerWidth = window.innerWidth;
  afterEach(() => {
    cleanup();
    window.innerWidth = innerWidth;
    useViewStore.getState().__resetForTests();
  });

  it("comes back at its dragged width after a view switch hid it", () => {
    window.innerWidth = 1280;
    useViewStore.setState({ view: "history", railOverride: { history: null, changes: true } });
    const { queryByTestId } = render(<RepoWindow />);
    expect(sidebar.props?.defaultSize).toBe(260);
    act(() => sidebar.props?.onResize?.({ inPixels: 400 }));
    act(() => sidebar.props?.onResize?.({ inPixels: 0 })); // a minimised window's report is not kept
    act(() => useViewStore.getState().setView("changes"));
    expect(queryByTestId("sidebar")).toBeNull();
    act(() => useViewStore.getState().setView("history"));
    expect(queryByTestId("sidebar")).not.toBeNull();
    expect(sidebar.props?.defaultSize).toBe(400);
  });
});

describe("RepoWindow output bar's focus when the dock closes", () => {
  beforeEach(() => useOpsStore.setState({ open: true, busy: null }));

  // The gesture's end waits two frames (`releaseDockGesture`); these two land after it.
  const twoFrames = () => act(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  const bar = (getByRole: (role: string, o: { name: string }) => HTMLElement) => getByRole("separator", { name: "Resize output" });

  it("End on the bar closes the dock and hands the focus to the header's toggle", async () => {
    const { getByRole } = render(<RepoWindow />);
    // What the toggle reads at the moment it takes the focus is what a screen reader announces.
    const toggle = getByRole("button", { name: "Collapse output" });
    const heard: (string | null)[] = [];
    toggle.addEventListener("focus", () => heard.push(toggle.textContent));
    bar(getByRole).focus();
    fireEvent.keyDown(bar(getByRole), { key: "End" });
    act(() => dock.props?.onResize?.({ inPixels: 28 }));
    await twoFrames();
    expect(useOpsStore.getState().open).toBe(false);
    expect(document.activeElement).toBe(toggle);
    expect(heard).toEqual(["Expand output"]);
  });

  it("a drag onto the header closes the dock and leaves the focus where the library put it", async () => {
    const { getByRole } = render(<RepoWindow />);
    // The library focuses the bar on a press, and takes the focus off it again when a drag that
    // moved it ends, before the dock closes; the mock does neither.
    bar(getByRole).focus();
    fireEvent.pointerDown(bar(getByRole), { pointerType: "mouse", button: 0 });
    act(() => dock.props?.onResize?.({ inPixels: 28 }));
    bar(getByRole).blur();
    fireEvent.pointerUp(window);
    await twoFrames();
    expect(useOpsStore.getState().open).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it("a close straight through the store (Ctrl+`) while the bar holds the focus does the same", () => {
    const { getByRole } = render(<RepoWindow />);
    bar(getByRole).focus();
    act(() => useOpsStore.getState().setOpen(false));
    expect(document.activeElement).toBe(getByRole("button", { name: "Expand output" }));
  });

  it("leaves a focus elsewhere where it is", () => {
    const { getByRole } = render(
      <>
        <RepoWindow />
        <button type="button">Elsewhere</button>
      </>,
    );
    const elsewhere = getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();
    act(() => useOpsStore.getState().setOpen(false));
    expect(document.activeElement).toBe(elsewhere);
  });

  it("a close (Ctrl+`) while the prompt holds the focus hands it to the toggle", () => {
    const { getByRole } = render(<RepoWindow />);
    getByRole("textbox", { name: "Run git command" }).focus();
    act(() => useOpsStore.getState().setOpen(false));
    expect(document.activeElement).toBe(getByRole("button", { name: "Expand output" }));
  });

  it("a close while a control that stays holds the focus leaves it there", () => {
    const { getByRole } = render(<RepoWindow />);
    const cancel = getByRole("button", { name: "Cancel" });
    cancel.focus();
    act(() => useOpsStore.getState().setOpen(false));
    expect(document.activeElement).toBe(cancel);
  });
});
