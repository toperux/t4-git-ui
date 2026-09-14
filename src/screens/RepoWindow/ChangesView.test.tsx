import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot, WorkdirStatus } from "../../api/types";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useStatusStore } from "../../store/statusStore";
import { useViewStore } from "../../store/viewStore";
import { ChangesBar, ChangesView } from "./ChangesView";

vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return {
    ...actual,
    getStatus: vi.fn(() => new Promise(() => {})),
    getChangedFiles: vi.fn(() => Promise.resolve([])),
    getFileDiff: vi.fn(() => new Promise(() => {})),
    getAuthor: vi.fn(() => Promise.resolve({ name: "Ada", email: "ada@x" })),
    getRefs: vi.fn(() => new Promise(() => {})),
    getLinked: vi.fn(() => Promise.resolve(null)),
  };
});
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn() }));
vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: ({ "aria-label": label }: { "aria-label"?: string }) => <div role="separator" aria-label={label} />,
}));

const REFS: RefsSnapshot = { head: { oid: "a", branch: "main", detached: false }, state: "clean", local: [], remotes: [], tags: [], stashes: [] };
const status = (n: Partial<WorkdirStatus>): WorkdirStatus => ({ entries: [], staged: 0, unstaged: 0, untracked: 0, conflicted: 0, state: "clean", ...n }) as WorkdirStatus;

beforeEach(() => {
  window.innerWidth = 1280;
  useViewStore.getState().__resetForTests();
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: REFS.head }, refs: REFS });
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useDialogStore.setState({ dialog: null });
});
afterEach(cleanup);

describe("ChangesBar", () => {
  it("names the branch and the counts; conflicts only when there are any", () => {
    useStatusStore.setState({ status: status({ staged: 2, unstaged: 3, untracked: 1, conflicted: 1 }) });
    const { getByText } = render(<ChangesBar />);
    expect(getByText("main")).toBeTruthy();
    expect(getByText("· 4 unstaged · 2 staged · 1 conflicted")).toBeTruthy();
  });
  it("says nothing to commit on a clean tree and disables Stash…", () => {
    useStatusStore.setState({ status: status({}) });
    const { getByText, getByRole } = render(<ChangesBar />);
    expect(getByText("· nothing to commit")).toBeTruthy();
    expect(getByRole("button", { name: "Stash…" }).hasAttribute("disabled")).toBe(true);
  });
  it("Stash… opens the stash dialog, History switches the view", () => {
    useStatusStore.setState({ status: status({ unstaged: 1 }) });
    useViewStore.getState().setView("changes");
    const { getByRole } = render(<ChangesBar />);
    fireEvent.click(getByRole("button", { name: "Stash…" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "stashPush" });
    fireEvent.click(getByRole("button", { name: "History" }));
    expect(useViewStore.getState().view).toBe("history");
  });
});

describe("ChangesView", () => {
  it("shows the empty state beside the message column on a clean tree", () => {
    useStatusStore.setState({ status: status({}) });
    const { getByText, getByLabelText } = render(<ChangesView />);
    expect(getByText("Working tree clean")).toBeTruthy();
    expect(getByLabelText("Summary")).toBeTruthy();
  });
});
