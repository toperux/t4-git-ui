import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot } from "../../../api/types";
import { useDialogStore } from "../../../store/dialogStore";
import { useOpsStore } from "../../../store/opsStore";
import { useRecentsStore } from "../../../store/recentsStore";
import { useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { useTabsStore } from "../../../store/tabsStore";
import { useViewStore } from "../../../store/viewStore";
import { CommandPalette } from "./CommandPalette";
import { usePaletteStore } from "./paletteStore";

vi.mock("../../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/ipc")>();
  return { ...actual, getRefs: vi.fn(() => new Promise(() => {})), getStatus: vi.fn(() => new Promise(() => {})), startLog: vi.fn(() => Promise.resolve(1)) };
});
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));

const REFS: RefsSnapshot = {
  head: { oid: "a", branch: "main", detached: false },
  state: "clean",
  local: [{ name: "main", oid: "a", upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead: true }],
  remotes: [{ name: "origin", url: null, branches: [{ name: "origin/main", oid: "a", mergedInto: null }] }],
  tags: [],
  stashes: [],
};

beforeEach(() => {
  usePaletteStore.getState().__resetForTests();
  useViewStore.getState().__resetForTests();
  useDialogStore.setState({ dialog: null });
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useRecentsStore.setState({ recents: [] });
  useStatusStore.setState({ status: null });
  useTabsStore.setState({ tabs: [], active: null, caret: null });
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: REFS.head }, refs: REFS });
  usePaletteStore.getState().setOpen(true);
});
afterEach(cleanup);

describe("CommandPalette", () => {
  it("types to filter, Enter runs the highlighted item, closes, and the item lands in Recent", () => {
    const { getByRole, getAllByRole } = render(<CommandPalette />);
    const input = getByRole("combobox", { name: "Command palette" });
    fireEvent.change(input, { target: { value: "chan" } });
    expect(getAllByRole("option")[0].textContent).toContain("Changes");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useViewStore.getState().view).toBe("changes");
    expect(usePaletteStore.getState().open).toBe(false);
    expect(usePaletteStore.getState().recent).toEqual(["view.changes"]);
    act(() => usePaletteStore.getState().setOpen(true)); // the mounted palette reopens with an empty query
    expect(getAllByRole("option")[0].textContent).toContain("Changes");
  });
  it("arrows move the highlight, Escape closes", () => {
    const { getByRole, getAllByRole } = render(<CommandPalette />);
    const input = getByRole("combobox", { name: "Command palette" });
    expect(input.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[0].id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[1].id);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(usePaletteStore.getState().open).toBe(false);
  });
  it("branches are Go to branch rows; items an operation would disable are disabled with the reason", () => {
    useOpsStore.setState({ busy: "Fetching…" });
    const { getByRole } = render(<CommandPalette />);
    const input = getByRole("combobox", { name: "Command palette" });
    fireEvent.change(input, { target: { value: "origin/" } });
    expect(getByRole("option", { name: "origin/main" })).toBeTruthy();
    fireEvent.change(input, { target: { value: "push" } });
    const item = getByRole("option", { name: /^Push/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.getAttribute("title")).toBe("Operation in progress");
    fireEvent.click(item);
    expect(useDialogStore.getState().dialog).toBeNull();
  });
});
