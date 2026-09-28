import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot } from "../../api/types";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useStatusStore } from "../../store/statusStore";
import { useViewStore } from "../../store/viewStore";
import { RepoWindow, StateBanners } from "./RepoWindow";

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
type PanelProps = { children?: React.ReactNode; maxSize?: number; defaultSize?: number; onResize?: (s: { inPixels: number }) => void };
const sidebar = vi.hoisted(() => ({ props: null as PanelProps | null }));
vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: (p: PanelProps) => {
    if (p.maxSize === 560) sidebar.props = p;
    return <div>{p.children}</div>;
  },
  Separator: () => <div />,
  usePanelRef: () => ({ current: null }),
}));
vi.mock("./ChangesView", () => ({ ChangesView: () => null }));
vi.mock("./CommandPalette/CommandPalette", () => ({ CommandPalette: () => null }));
vi.mock("./CommitPanel/CommitPanel", () => ({ useCommitSync: () => {} }));
vi.mock("./DetailsPane", () => ({ DetailsPane: () => null }));
vi.mock("./dialogs/DialogHost", () => ({ DialogHost: () => null }));
vi.mock("./OutputDock", () => ({ OutputDock: () => null }));
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
